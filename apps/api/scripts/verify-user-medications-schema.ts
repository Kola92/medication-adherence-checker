import { pool } from '../src/db';

async function main() {
  const columns = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'user_medications'
    ORDER BY ordinal_position
  `);
  console.log('Columns:', columns.rows);

  const indexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'user_medications'
  `);
  console.log('Indexes:', indexes.rows);

  const fks = await pool.query(`
    SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS references_table, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'user_medications' AND tc.constraint_type = 'FOREIGN KEY'
  `);
  console.log('Foreign keys:', fks.rows);

  await pool.end();
}

main();
