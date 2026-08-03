import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key} — check apps/worker/.env`);
  }
  return value;
}

export const config = {
  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: requireEnv('REDIS_URL'),
  resendApiKey: requireEnv('RESEND_API_KEY')
};
