import { pool } from '../src/db';

async function main() {
  const result = await pool.query(
    "DELETE FROM users WHERE email IN ('crud-test-a@example.com', 'crud-test-b@example.com') RETURNING id, email"
  );
  console.log('Deleted:', result.rows);
  await pool.end();
}

main();
