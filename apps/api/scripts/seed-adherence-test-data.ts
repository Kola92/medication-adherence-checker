import { pool } from '../src/db';
import bcrypt from 'bcrypt';

async function main() {
  const email = 'adherence-test@example.com';
  const passwordHash = await bcrypt.hash('testpass123', 12);

  const userResult = await pool.query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, 'Adherence Test')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [email, passwordHash]
  );
  const userId = userResult.rows[0].id;

  const medResult = await pool.query(`SELECT id FROM medications WHERE name = 'ibuprofen'`);
  const medicationId = medResult.rows[0].id;

  // started_at 7 days ago, so we have a full 7-day window to test
  const umResult = await pool.query(
    `INSERT INTO user_medications
      (user_id, medication_id, dosage_amount, dosage_unit, frequency, reminder_times, started_at)
     VALUES ($1, $2, 200, 'mg', 'twice daily', ARRAY['08:00','20:00'], CURRENT_DATE - 7)
     RETURNING id`,
    [userId, medicationId]
  );
  const userMedicationId = umResult.rows[0].id;

  // Seed a deliberately imperfect history over the past 6 days (yesterday back to 6 days ago):
  // - Day -1 (yesterday): both taken
  // - Day -2: 08:00 taken, 20:00 explicitly missed
  // - Day -3: both taken
  // - Day -4: no logs at all (should count as 2 missed via the LEFT JOIN)
  // - Day -5: 08:00 skipped, 20:00 taken
  // - Day -6: both taken
  // Expected: 12 total slots, 8 taken -> 66.7%
  const logs = [
    { daysAgo: 1, time: '08:00', status: 'taken' },
    { daysAgo: 1, time: '20:00', status: 'taken' },
    { daysAgo: 2, time: '08:00', status: 'taken' },
    { daysAgo: 2, time: '20:00', status: 'missed' },
    { daysAgo: 3, time: '08:00', status: 'taken' },
    { daysAgo: 3, time: '20:00', status: 'taken' },
    // day -4 intentionally has no logs
    { daysAgo: 5, time: '08:00', status: 'skipped' },
    { daysAgo: 5, time: '20:00', status: 'taken' },
    { daysAgo: 6, time: '08:00', status: 'taken' },
    { daysAgo: 6, time: '20:00', status: 'taken' }
  ];

  for (const log of logs) {
    await pool.query(
      `INSERT INTO dose_logs (user_medication_id, scheduled_date, scheduled_time, status)
       VALUES ($1, CURRENT_DATE - $2::int, $3, $4)`,
      [userMedicationId, log.daysAgo, log.time, log.status]
    );
  }

  console.log('Seeded:', { userId, userMedicationId, medicationId });
  await pool.end();
}

main();
