import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key} — check apps/api/.env`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

export const config = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: '15m' as const,
  jwtRefreshExpiresInDays: 7,
  redisUrl: requireEnv('REDIS_URL'),
  bullPrefix: isProduction ? 'bull' : 'bull-dev',
  nodeEnv,
  // Local dev: frontend (localhost:3000) and backend (localhost:4000) are
  // different ports but the same registrable site, so SameSite=Lax works
  // over plain http. Deployed: Vercel + Render are genuinely different
  // sites, which requires SameSite=None - and browsers refuse SameSite=None
  // without Secure, so Secure must be true there. Not a free choice; this
  // pairing is a browser requirement, not a preference.
  cookieSecure: isProduction,
  cookieSameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax'
};
