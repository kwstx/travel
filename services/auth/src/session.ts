import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_travel_app_development';
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived JWT
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface DeviceBinding {
  deviceId: string;
  userAgent: string;
  ipAddress: string;
}

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * SHA-256 helper.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new session with device binding.
 */
export async function createSession(userId: string, device: DeviceBinding): Promise<SessionResult> {
  // Generate short-lived Access Token
  const accessToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

  // Generate cryptographically secure random refresh token
  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const refreshTokenHash = hashToken(rawRefreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // Store in database
  await db.query(
    `INSERT INTO auth.sessions (user_id, refresh_token_hash, device_id, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, refreshTokenHash, device.deviceId, device.userAgent, device.ipAddress, expiresAt]
  );

  return {
    accessToken,
    refreshToken: rawRefreshToken
  };
}

/**
 * Rotates the refresh token (implements Refresh Token Rotation) and validates device binding.
 * If device binding is violated, it revokes ALL sessions for the user (protection against hijacking).
 */
export async function rotateSession(
  rawRefreshToken: string,
  device: DeviceBinding
): Promise<SessionResult> {
  const tokenHash = hashToken(rawRefreshToken);

  // Find active session
  const res = await db.query(
    'SELECT * FROM auth.sessions WHERE refresh_token_hash = $1 AND is_revoked = FALSE',
    [tokenHash]
  );

  if (res.rows.length === 0) {
    throw new Error('Invalid refresh token');
  }

  const session = res.rows[0];

  // Check expiration
  if (new Date() > new Date(session.expires_at)) {
    throw new Error('Expired refresh token');
  }

  // VALIDATE DEVICE BINDING
  const bindingMatches =
    session.device_id === device.deviceId &&
    session.user_agent === device.userAgent &&
    session.ip_address === device.ipAddress;

  if (!bindingMatches) {
    // SECURITY ALERT: Suspected session hijacking! Revoke ALL sessions of this user.
    await db.query(
      'UPDATE auth.sessions SET is_revoked = TRUE WHERE user_id = $1',
      [session.user_id]
    );
    throw new Error('Security Breach: Device binding mismatch. Session revoked.');
  }

  // Revoke current refresh token (rotation)
  await db.query('UPDATE auth.sessions SET is_revoked = TRUE WHERE id = $1', [session.id]);

  // Create new session
  return createSession(session.user_id, device);
}

/**
 * Revokes a session (Logout).
 */
export async function revokeSession(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);
  await db.query('UPDATE auth.sessions SET is_revoked = TRUE WHERE refresh_token_hash = $1', [tokenHash]);
}
