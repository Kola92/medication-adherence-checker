import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — check apps/api/.env');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
  process.exit(1);
});
