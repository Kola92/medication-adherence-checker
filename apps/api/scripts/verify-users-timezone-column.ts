import { pool } from '../src/db';

async function main() {
  const columns = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'timezone'
  `);
  console.log('Column:', columns.rows);

  const sample = await pool.query(`SELECT id, email, timezone FROM users LIMIT 3`);
  console.log('Sample existing rows (should all default to Africa/Lagos):', sample.rows);

  await pool.end();
}

main();
