import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { scheduleReminderJobs } from 'shared';
import { config } from './config';
import { pool } from './db';
import { reminderQueue } from './reminderQueue';

export const TOPUP_QUEUE_NAME = 'reminder-topup';

const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null
});

connection.on('error', (err) => {
  console.error('Unexpected error on Redis connection (topup)', err);
});

export const topupQueue = new Queue(TOPUP_QUEUE_NAME, { connection });

export async function runTopup(): Promise<void> {
  const result = await pool.query(`
    SELECT
      um.id AS "userMedicationId",
      um.user_id AS "userId",
      um.dosage_amount AS "dosageAmount",
      um.dosage_unit AS "dosageUnit",
      um.reminder_times AS "reminderTimes",
      m.name AS "medicationName",
      u.email AS "userEmail",
      u.timezone AS "userTimezone"
    FROM user_medications um
    JOIN medications m ON m.id = um.medication_id
    JOIN users u ON u.id = um.user_id
  `);

  console.log(`Top-up: processing ${result.rows.length} active user_medications rows`);

  let totalJobsAdded = 0;
  for (const row of result.rows) {
    try {
      const added = await scheduleReminderJobs(reminderQueue, {
        userMedicationId: row.userMedicationId,
        userId: row.userId,
        userEmail: row.userEmail,
        userTimezone: row.userTimezone,
        medicationName: row.medicationName,
        dosageAmount: row.dosageAmount,
        dosageUnit: row.dosageUnit,
        reminderTimes: row.reminderTimes
      });
      totalJobsAdded += added;
    } catch (err) {
      console.error(`Top-up failed for user_medications ${row.userMedicationId}:`, err);
    }
  }

  console.log(`Top-up complete: ${totalJobsAdded} job-add calls processed across ${result.rows.length} medications (most will be no-ops due to jobId dedup)`);
}

export const topupWorker = new Worker(
  TOPUP_QUEUE_NAME,
  async () => {
    await runTopup();
  },
  { connection }
);

topupWorker.on('completed', () => {
  console.log('Top-up job completed');
});

topupWorker.on('failed', (job, err) => {
  console.error('Top-up job failed:', err.message);
});

export async function scheduleDailyTopup(): Promise<void> {
  await topupQueue.add(
    'daily-topup',
    {},
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'daily-topup-repeatable'
    }
  );
  console.log('Daily top-up scheduled (runs at 03:00 UTC daily)');
}
