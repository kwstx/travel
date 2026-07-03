import { Router, Request, Response } from 'express';
import db from './db';
import jwt from 'jsonwebtoken';

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

        const result = await db.query(
            `INSERT INTO auth.loyalty_programs (user_id, airline_code, member_number, tier_status)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, airline_code) 
             DO UPDATE SET member_number = EXCLUDED.member_number, tier_status = EXCLUDED.tier_status
             RETURNING *`,
            [userId, airlineCode, memberNumber, tierStatus]
        );

        res.json({ success: true, loyalty: result.rows[0] });
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

        const result = await db.query(
            `INSERT INTO auth.companion_profiles (user_id, first_name, last_name, relationship)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, firstName, lastName, relationship]
        );

        res.json({ success: true, companion: result.rows[0] });
    } catch (error) {
        console.error('Companion save error:', error);
        res.status(500).json({ error: 'Failed to save companion profile' });
    }
});

export default router;
