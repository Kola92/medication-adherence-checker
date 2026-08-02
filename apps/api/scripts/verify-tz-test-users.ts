import { pool } from '../src/db';

async function main() {
  const result = await pool.query(
    `SELECT email, timezone FROM users WHERE email LIKE 'tz-test-%@example.com' ORDER BY email`
  );
  console.log('Rows:', result.rows);
  await pool.end();
}

main();
