import { pool } from '../db';
import { hashPassword, verifyPassword } from './password';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from './tokens';
import { config } from '../config';

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

interface AuthResult {
  user: { id: string; email: string; name: string; timezone: string };
  accessToken: string;
  refreshToken: string;
}

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));
const DEFAULT_TIMEZONE = 'Africa/Lagos';

function resolveTimezone(timezone?: string): string {
  if (timezone === undefined) {
    return DEFAULT_TIMEZONE;
  }
  if (VALID_TIMEZONES.has(timezone)) {
    return timezone;
  }
  throw new AuthError(`Invalid timezone: ${timezone}`, 400);
}

async function issueTokens(userId: string, email: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ userId, email });
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.jwtRefreshExpiresInDays);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, refreshTokenHash, expiresAt]
  );

  return { accessToken, refreshToken };
}

export async function registerUser(
  email: string,
  password: string,
  name: string,
  timezone?: string
): Promise<AuthResult> {
  if (password.length < 8) {
    throw new AuthError('Password must be at least 8 characters', 400);
  }

  const resolvedTimezone = resolveTimezone(timezone);
  const passwordHash = await hashPassword(password);

  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, timezone)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, name, timezone`,
    [email, passwordHash, name, resolvedTimezone]
  );

  if (result.rows.length === 0) {
    throw new AuthError('An account with this email already exists', 409);
  }

  const user = result.rows[0];
  const tokens = await issueTokens(user.id, user.email);

  return { user, ...tokens };
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const result = await pool.query(
    'SELECT id, email, name, password_hash, timezone FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    throw new AuthError('Invalid email or password');
  }

  const user = result.rows[0];
  const valid = await verifyPassword(password, user.password_hash);

  if (!valid) {
    throw new AuthError('Invalid email or password');
  }

  const tokens = await issueTokens(user.id, user.email);

  return {
    user: { id: user.id, email: user.email, name: user.name, timezone: user.timezone },
    ...tokens
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  const tokenHash = hashRefreshToken(refreshToken);

  const result = await pool.query(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    throw new AuthError('Invalid refresh token');
  }

  const row = result.rows[0];

  if (row.revoked_at) {
    throw new AuthError('Refresh token has been revoked');
  }

  if (new Date(row.expires_at) < new Date()) {
    throw new AuthError('Refresh token has expired');
  }

  const accessToken = signAccessToken({ userId: row.user_id, email: row.email });
  return { accessToken };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}
