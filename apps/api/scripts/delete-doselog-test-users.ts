import { pool } from '../src/db';

async function main() {
  const result = await pool.query(
    "DELETE FROM users WHERE email IN ('doselog-test@example.com', 'doselog-test-c@example.com') RETURNING id, email"
  );
  console.log('Deleted:', result.rows);
  await pool.end();
}

main();
