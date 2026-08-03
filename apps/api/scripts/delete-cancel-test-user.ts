import { pool } from '../src/db';

async function main() {
  const result = await pool.query(
    "DELETE FROM users WHERE email = 'cancel-test@example.com' RETURNING id"
  );
  console.log('Deleted:', result.rows);
  await pool.end();
}

main();
