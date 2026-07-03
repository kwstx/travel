import { Router, Request, Response } from 'express';
import db from './db';
import jwt from 'jsonwebtoken';
import { validateLoyalty, validatePreferences, validateCompanion, validateConsent } from './validation';
import { areNamesDuplicate } from './fuzzyMatch';
import { logEvent, reconstructUserState } from './ledger';
import { encrypt, decrypt } from './encryption';
import { AuthRequest, Role, requireRoles, requestJitElevation } from './rbac';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_travel_app_development';

// Middleware to protect onboarding routes
router.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: 'Authorization header required' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string, email: string };
        (req as any).user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Post-onboarding: LLM calls this to persist loyalty memberships
router.post('/loyalty', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { airlineCode, memberNumber, tierStatus } = req.body;

        // Input validation
        const validationErrors = validateLoyalty({ airlineCode, memberNumber, tierStatus });
        if (validationErrors.length > 0) {
            res.status(400).json({ error: 'Validation failed', details: validationErrors });
            return;
        }

        const encryptedMemberNumber = encrypt(memberNumber);

        const result = await db.query(
            `INSERT INTO auth.loyalty_programs (user_id, airline_code, member_number, tier_status)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, airline_code) 
             DO UPDATE SET member_number = EXCLUDED.member_number, tier_status = EXCLUDED.tier_status
             RETURNING *`,
            [userId, airlineCode, encryptedMemberNumber, tierStatus]
        );

        // Audit Event
        await logEvent(userId, 'LOYALTY_UPDATE', { airlineCode, memberNumber: '***', tierStatus });

        const savedLoyalty = { ...result.rows[0], member_number: decrypt(result.rows[0].member_number) };
        res.json({ success: true, loyalty: savedLoyalty });
    } catch (error) {
        console.error('Loyalty save error:', error);
        res.status(500).json({ error: 'Failed to save loyalty information' });
    }
});

// Post-onboarding: LLM calls this to persist user travel preferences
router.post('/preferences', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { cabinClass, seatType, dietaryRestrictions, layoverTolerance, sustainabilityWeighting } = req.body;

        // Input validation
        const validationErrors = validatePreferences({ cabinClass, seatType, dietaryRestrictions, layoverTolerance, sustainabilityWeighting });
        if (validationErrors.length > 0) {
            res.status(400).json({ error: 'Validation failed', details: validationErrors });
            return;
        }

        const result = await db.query(
            `INSERT INTO auth.user_preferences 
             (user_id, cabin_class, seat_type, dietary_restrictions, layover_tolerance, sustainability_weighting)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id) 
             DO UPDATE SET 
                cabin_class = EXCLUDED.cabin_class,
                seat_type = EXCLUDED.seat_type,
                dietary_restrictions = EXCLUDED.dietary_restrictions,
                layover_tolerance = EXCLUDED.layover_tolerance,
                sustainability_weighting = EXCLUDED.sustainability_weighting,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [userId, cabinClass, seatType, dietaryRestrictions, layoverTolerance, sustainabilityWeighting || 0]
        );

        // Audit Event
        await logEvent(userId, 'PREFERENCES_UPDATE', { cabinClass, seatType, dietaryRestrictions, layoverTolerance, sustainabilityWeighting });

        res.json({ success: true, preferences: result.rows[0] });
    } catch (error) {
        console.error('Preferences save error:', error);
        res.status(500).json({ error: 'Failed to save preferences' });
    }
});

// Post-onboarding: LLM calls this to instantiate companion profiles
router.post('/companions', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { firstName, lastName, relationship } = req.body;

        // Input validation
        const validationErrors = validateCompanion({ firstName, lastName, relationship });
        if (validationErrors.length > 0) {
            res.status(400).json({ error: 'Validation failed', details: validationErrors });
            return;
        }

        // Fuzzy Matching Deduplication Check
        const existingCompanions = await db.query(
            'SELECT first_name, last_name FROM auth.companion_profiles WHERE user_id = $1',
            [userId]
        );

        for (const row of existingCompanions.rows) {
            if (areNamesDuplicate(firstName, lastName, row.first_name, row.last_name)) {
                res.status(409).json({
                    error: 'Duplicate companion profile detected via fuzzy matching',
                    match: `${row.first_name} ${row.last_name}`
                });
                return;
            }
        }

        const result = await db.query(
            `INSERT INTO auth.companion_profiles (user_id, first_name, last_name, relationship)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, firstName, lastName, relationship]
        );

        const newCompanion = result.rows[0];

        // Audit Event
        await logEvent(userId, 'COMPANION_CREATE', newCompanion);

        res.json({ success: true, companion: newCompanion });
    } catch (error) {
        console.error('Companion save error:', error);
        res.status(500).json({ error: 'Failed to save companion profile' });
    }
});

// Get consent flags for user
router.get('/consent', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const result = await db.query(
            'SELECT permission_flag, granted, updated_at FROM auth.consent_records WHERE user_id = $1',
            [userId]
        );
        res.json({ consents: result.rows });
    } catch (error) {
        console.error('Failed to get consents:', error);
        res.status(500).json({ error: 'Failed to retrieve consent records' });
    }
});

// Update a consent flag
router.post('/consent', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { permissionFlag, granted } = req.body;

        // Input validation
        const validationErrors = validateConsent({ permissionFlag, granted });
        if (validationErrors.length > 0) {
            res.status(400).json({ error: 'Validation failed', details: validationErrors });
            return;
        }

        const result = await db.query(
            `INSERT INTO auth.consent_records (user_id, permission_flag, granted, updated_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id, permission_flag)
             DO UPDATE SET granted = EXCLUDED.granted, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [userId, permissionFlag, granted]
        );

        // Audit Event
        await logEvent(userId, 'CONSENT_UPDATE', { permissionFlag, granted });

        res.json({ success: true, consent: result.rows[0] });
    } catch (error) {
        console.error('Failed to update consent:', error);
        res.status(500).json({ error: 'Failed to update consent record' });
    }
});

// Reconstruct complete user profile state from audit ledger (compliance / auditing)
router.get('/reconstruct', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const state = await reconstructUserState(userId);
        res.json(state);
    } catch (error) {
        console.error('Failed to reconstruct state:', error);
        res.status(500).json({ error: 'Failed to reconstruct user state' });
    }
});

// JIT Elevation Endpoint for Support Staff
router.post('/elevate-privilege', requireRoles([Role.SUPPORT]), async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user!.id;
        // In a real application, we would retrieve the roles from the DB or a trusted token
        const currentRoles = authReq.user!.roles || [Role.SUPPORT];
        const durationMinutes = req.body.durationMinutes || 60;

        const { roles: newRoles, jitExpiration } = requestJitElevation(userId, currentRoles, durationMinutes);

        // Here you would save the new roles and expiration to a session store or issue a new JWT
        await logEvent(userId, 'JIT_ELEVATION_GRANTED', { newRoles, jitExpiration });

        res.json({ success: true, newRoles, jitExpiration });
    } catch (error: any) {
        console.error('JIT elevation error:', error);
        res.status(500).json({ error: error.message || 'Failed to elevate privilege' });
    }
});

export default router;
