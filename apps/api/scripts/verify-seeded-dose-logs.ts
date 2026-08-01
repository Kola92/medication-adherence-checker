import { pool } from '../src/db';

async function main() {
  const result = await pool.query(
    `SELECT scheduled_date::text AS date, scheduled_time AS time, status
     FROM dose_logs
     WHERE user_medication_id = $1
     ORDER BY scheduled_date, scheduled_time`,
    ['4699c4d2-14a0-4e13-a4ba-b9aa0dfde6a5']
  );
  console.log('Row count:', result.rows.length);
  console.table(result.rows);
  await pool.end();
}

main();
