import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';
import { pool } from './db';
import { sendReminderEmail } from './email';
import { REMINDER_QUEUE_NAME, ReminderJobData } from 'shared';

const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null
});

connection.on('error', (err) => {
  console.error('Unexpected error on Redis connection', err);
});

async function processReminderJob(job: Job<ReminderJobData>): Promise<void> {
  const { userMedicationId, userEmail, medicationName, scheduledDate, scheduledTime } = job.data;

  const existsResult = await pool.query(
    'SELECT id FROM user_medications WHERE id = $1',
    [userMedicationId]
  );

  if (existsResult.rows.length === 0) {
    console.log(
      `Skipping reminder for ${userMedicationId} (${medicationName}, ${scheduledDate} ${scheduledTime}) - user_medications row no longer exists`
    );
    return;
  }

  await sendReminderEmail(job.data);
  console.log(
    `Sent reminder to ${userEmail} for ${medicationName} (${scheduledDate} ${scheduledTime})`
  );
}

const worker = new Worker<ReminderJobData>(REMINDER_QUEUE_NAME, processReminderJob, {
  connection,
  concurrency: 1,
  prefix: config.bullPrefix
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log('Reminder worker started, listening for jobs...');

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker gracefully...');
  await worker.close();
  await pool.end();
  await connection.quit();
  process.exit(0);
});
