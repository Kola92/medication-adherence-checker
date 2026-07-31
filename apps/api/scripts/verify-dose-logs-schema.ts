import { pool } from '../src/db';

async function main() {
  const columns = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'dose_logs'
    ORDER BY ordinal_position
  `);
  console.log('Columns:', columns.rows);

  const indexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'dose_logs'
  `);
  console.log('Indexes:', indexes.rows);

  const constraints = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'dose_logs'::regclass
  `);
  console.log('Constraints:', constraints.rows);

  await pool.end();
}

main();
