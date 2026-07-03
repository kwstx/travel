import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { validateProfile } from './validation';
import { createSession, rotateSession, revokeSession, DeviceBinding } from './session';
import { logEvent } from './ledger';

const router = Router();

function getDeviceBinding(req: Request): DeviceBinding {
  const deviceId = req.headers['x-device-id'] as string || 'unknown-device';
  const userAgent = req.headers['user-agent'] || 'unknown-ua';
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress || 'unknown-ip';
  return { deviceId, userAgent, ipAddress };
}

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_travel_app_development';
const RP_NAME = 'AI Travel Agent';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || `http://${RP_ID}:3000`;

// Real SMTP service logic using environment variables, falling back to a mock/ethereal setup for testing if not provided.
let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName } = req.body;
    
    // Schema Validation
    const validationErrors = validateProfile({ email, firstName, lastName });
    if (validationErrors.length > 0) {
      res.status(400).json({ error: 'Validation failed', details: validationErrors });
      return;
    }

    const userCheck = await db.query('SELECT * FROM auth.users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
       res.status(400).json({ error: 'User already exists' });
       return;
    }
    
    let passwordHash = null;
    if (password) {
        const salt = await bcrypt.genSalt(10);
        passwordHash = await bcrypt.hash(password, salt);
    }
    
    const newUser = await db.query(
      'INSERT INTO auth.users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name',
      [email, passwordHash, firstName, lastName]
    );

    const user = newUser.rows[0];

    // Audit Event logging
    await logEvent(user.id, 'PROFILE_CREATE', { email, firstName, lastName });
    
    // Device-bound Session
    const device = getDeviceBinding(req);
    const session = await createSession(user.id, device);

    res.status(201).json({ user, ...session });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const userCheck = validateProfile({ email });
    if (userCheck.length > 0) {
      res.status(400).json({ error: 'Validation failed', details: userCheck });
      return;
    }
    
    const result = await db.query('SELECT * FROM auth.users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
       res.status(400).json({ error: 'Invalid credentials' });
       return;
    }
    
    const user = result.rows[0];
    
    if (!user.password_hash) {
       res.status(400).json({ error: 'Please use passwordless or OAuth login' });
       return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
       res.status(400).json({ error: 'Invalid credentials' });
       return;
    }
    
    const { password_hash, ...userProfile } = user;

    // Device-bound Session
    const device = getDeviceBinding(req);
    const session = await createSession(user.id, device);
    
    res.json({ user: userProfile, ...session });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Magic Link Implementation
const magicLinkStore: Record<string, string> = {}; // In-memory store for demo. Use Redis in prod.

router.post('/magic-link/request', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        // Upsert user for passwordless
        let userResult = await db.query('SELECT * FROM auth.users WHERE email = $1', [email]);
        let user;
        if (userResult.rows.length === 0) {
            userResult = await db.query('INSERT INTO auth.users (email) VALUES ($1) RETURNING id, email', [email]);
        }
        user = userResult.rows[0];

        const token = uuidv4();
        magicLinkStore[token] = user.id;

        const magicLink = `${ORIGIN}/api/auth/magic-link/verify?token=${token}`;
        
        await transporter.sendMail({
            from: '"AI Travel Agent" <no-reply@aitravel.com>',
            to: email,
            subject: 'Your Magic Login Link',
            text: `Click here to login: ${magicLink}`,
            html: `<a href="${magicLink}">Click here to login</a>`
        });

        res.json({ message: 'Magic link sent' });
    } catch (error) {
        console.error('Magic link error:', error);
        res.status(500).json({ error: 'Failed to send magic link' });
    }
});

router.get('/magic-link/verify', async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.query.token as string;
        const userId = magicLinkStore[token];
        
        if (!userId) {
            res.status(400).json({ error: 'Invalid or expired magic link' });
            return;
        }

        const userResult = await db.query('SELECT id, email, first_name, last_name FROM auth.users WHERE id = $1', [userId]);
        const user = userResult.rows[0];

        delete magicLinkStore[token];

        const jwtToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ user, token: jwtToken });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Passkeys (WebAuthn) endpoints
const challengesStore: Record<string, string> = {}; // In-memory for demo

router.post('/webauthn/register/options', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        let userResult = await db.query('SELECT * FROM auth.users WHERE email = $1', [email]);
        let user;
        if (userResult.rows.length === 0) {
             userResult = await db.query('INSERT INTO auth.users (email) VALUES ($1) RETURNING id, email', [email]);
        }
        user = userResult.rows[0];

        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID: RP_ID,
            userID: new TextEncoder().encode(user.id),
            userName: user.email,
            attestationType: 'none',
            authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
        });

        challengesStore[user.id] = options.challenge;
        res.json({ options, userId: user.id });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/webauthn/register/verify', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, registrationResponse } = req.body;
        const expectedChallenge = challengesStore[userId];

        const verification = await verifyRegistrationResponse({
            response: registrationResponse,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
        });

        if (verification.verified && verification.registrationInfo) {
            const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
            
            await db.query(
                'INSERT INTO auth.passkeys (user_id, credential_id, public_key, counter) VALUES ($1, $2, $3, $4)',
                [userId, Buffer.from(credentialID).toString('base64'), Buffer.from(credentialPublicKey), counter]
            );
            
            res.json({ verified: true });
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/webauthn/login/options', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        const userResult = await db.query('SELECT * FROM auth.users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            res.status(400).json({ error: 'User not found' });
            return;
        }
        const user = userResult.rows[0];

        const passkeysResult = await db.query('SELECT credential_id FROM auth.passkeys WHERE user_id = $1', [user.id]);
        
        const options = await generateAuthenticationOptions({
            rpID: RP_ID,
            allowCredentials: passkeysResult.rows.map(pk => ({
                id: Uint8Array.from(Buffer.from(pk.credential_id, 'base64')),
                type: 'public-key'
            })),
            userVerification: 'preferred'
        });

        challengesStore[user.id] = options.challenge;
        res.json({ options, userId: user.id });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/webauthn/login/verify', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, authenticationResponse } = req.body;
        const expectedChallenge = challengesStore[userId];
        
        const passkeyResult = await db.query('SELECT * FROM auth.passkeys WHERE user_id = $1 AND credential_id = $2', [userId, authenticationResponse.id]);
        if (passkeyResult.rows.length === 0) {
            res.status(400).json({ error: 'Passkey not found' });
            return;
        }
        const passkey = passkeyResult.rows[0];

        const verification = await verifyAuthenticationResponse({
            response: authenticationResponse,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            authenticator: {
                credentialID: Uint8Array.from(Buffer.from(passkey.credential_id, 'base64')),
                credentialPublicKey: passkey.public_key,
                counter: Number(passkey.counter),
                transports: passkey.transports
            }
        });

        if (verification.verified) {
            await db.query('UPDATE auth.passkeys SET counter = $1 WHERE id = $2', [verification.authenticationInfo.newCounter, passkey.id]);
            
            const userResult = await db.query('SELECT id, email, first_name, last_name FROM auth.users WHERE id = $1', [userId]);
            const user = userResult.rows[0];
            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });
            
            res.json({ verified: true, user, token });
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// OAuth 2.0 / OpenID Connect
import { Issuer, generators } from 'openid-client';

let oidcClient: any;
async function initOidc() {
    try {
        const issuerUrl = process.env.OIDC_ISSUER || 'https://accounts.google.com';
        const issuer = await Issuer.discover(issuerUrl);
        oidcClient = new issuer.Client({
            client_id: process.env.OAUTH_CLIENT_ID || 'dummy_client_id',
            client_secret: process.env.OAUTH_CLIENT_SECRET || 'dummy_client_secret',
            redirect_uris: [`${ORIGIN}/api/auth/oauth/callback`],
            response_types: ['code'],
        });
        console.log(`OIDC Client initialized for issuer: ${issuerUrl}`);
    } catch (e) {
        console.warn('OIDC initialization failed (mock credentials). Skipping OIDC.');
    }
}
initOidc();

const codeVerifierStore: Record<string, string> = {}; // Use Redis in prod

router.get('/oauth/login', (req: Request, res: Response): void => {
    if (!oidcClient) {
        res.status(500).json({ error: 'OIDC client not initialized' });
        return;
    }
    const code_verifier = generators.codeVerifier();
    const code_challenge = generators.codeChallenge(code_verifier);
    
    // Simple state param as key
    const state = generators.state();
    codeVerifierStore[state] = code_verifier;

    const authUrl = oidcClient.authorizationUrl({
        scope: 'openid email profile',
        code_challenge,
        code_challenge_method: 'S256',
        state,
    });
    
    res.redirect(authUrl);
});

router.get('/oauth/callback', async (req: Request, res: Response): Promise<void> => {
    try {
        const state = req.query.state as string;
        const code_verifier = codeVerifierStore[state];
        
        if (!code_verifier) {
             res.status(400).json({ error: 'Invalid state' });
             return;
        }
        delete codeVerifierStore[state];

        const params = oidcClient.callbackParams(req);
        const tokenSet = await oidcClient.callback(`${ORIGIN}/api/auth/oauth/callback`, params, { code_verifier, state });
        
        const claims = tokenSet.claims();
        const email = claims.email;
        const providerId = claims.sub;

        if (!email) {
             res.status(400).json({ error: 'Email not provided by OIDC provider' });
             return;
        }

        // 1. Find or create user
        let userResult = await db.query('SELECT * FROM auth.users WHERE email = $1', [email]);
        let user;
        if (userResult.rows.length === 0) {
             userResult = await db.query(
                 'INSERT INTO auth.users (email, first_name, last_name) VALUES ($1, $2, $3) RETURNING id, email, first_name, last_name',
                 [email, claims.given_name || '', claims.family_name || '']
             );
        }
        user = userResult.rows[0];

        // 2. Upsert OAuth account link
        await db.query(
            `INSERT INTO auth.oauth_accounts (user_id, provider, provider_user_id) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (provider, provider_user_id) DO NOTHING`,
            [user.id, oidcClient.issuer.metadata.issuer, providerId]
        );

        const device = getDeviceBinding(req);
        const session = await createSession(user.id, device);
        
        res.json({ user, ...session });
    } catch (error) {
        console.error('OIDC callback error:', error);
        res.status(500).json({ error: 'OIDC callback failed' });
    }
});

// Refresh token route with device binding validation
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            res.status(400).json({ error: 'Refresh token is required' });
            return;
        }

        const device = getDeviceBinding(req);
        const session = await rotateSession(refreshToken, device);
        res.json(session);
    } catch (error: any) {
        console.error('Token refresh error:', error.message);
        res.status(401).json({ error: error.message });
    }
});

// Logout / revoke session route
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            res.status(400).json({ error: 'Refresh token is required' });
            return;
        }

        await revokeSession(refreshToken);
        res.json({ success: true, message: 'Session revoked successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

export default router;

