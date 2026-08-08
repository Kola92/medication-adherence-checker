import { pool } from '../src/db';

async function main() {
  const result = await pool.query(
    "DELETE FROM users WHERE email IN ('cookie-test@example.com', 'cookie-test2@example.com') RETURNING id, email"
  );
  console.log('Deleted:', result.rows);
  await pool.end();
}

main();
