import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { fromZonedTime } from 'date-fns-tz';
import { config } from './config';
import { REMINDER_QUEUE_NAME, ReminderJobData } from 'shared';

export const redisConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null
});

redisConnection.on('error', (err) => {
  console.error('Unexpected error on Redis connection', err);
});

export const reminderQueue = new Queue(REMINDER_QUEUE_NAME, {
  connection: redisConnection
});

const SCHEDULING_WINDOW_DAYS = 14;

interface ScheduleParams {
  userMedicationId: string;
  userId: string;
  userEmail: string;
  userTimezone: string;
  medicationName: string;
  dosageAmount: string;
  dosageUnit: string;
  reminderTimes: string[];
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function scheduleReminderJobs(params: ScheduleParams): Promise<number> {
  const {
    userMedicationId,
    userId,
    userEmail,
    userTimezone,
    medicationName,
    dosageAmount,
    dosageUnit,
    reminderTimes
  } = params;

  const jobs: { name: string; data: ReminderJobData; opts: { jobId: string; delay: number } }[] = [];
  const now = Date.now();

  for (let dayOffset = 0; dayOffset < SCHEDULING_WINDOW_DAYS; dayOffset++) {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + dayOffset);
    const scheduledDate = toDateString(targetDay);

    for (const scheduledTime of reminderTimes) {
      const localDateTimeString = `${scheduledDate}T${scheduledTime}:00`;
      const utcInstant = fromZonedTime(localDateTimeString, userTimezone);
      const delay = utcInstant.getTime() - now;

      if (delay < 0) {
        continue;
      }

      const jobId = `${userMedicationId}_${scheduledDate}_${scheduledTime.replace(':', '-')}`;

      jobs.push({
        name: REMINDER_QUEUE_NAME,
        data: {
          userMedicationId,
          userId,
          userEmail,
          medicationName,
          dosageAmount,
          dosageUnit,
          scheduledDate,
          scheduledTime
        },
        opts: { jobId, delay }
      });
    }
  }

  await reminderQueue.addBulk(jobs);
  return jobs.length;
}

export async function cancelReminderJobs(userMedicationId: string): Promise<number> {
  const delayedJobs = await reminderQueue.getJobs(['delayed']);
  const matchingJobs = delayedJobs.filter((job) => job.id?.startsWith(`${userMedicationId}_`));

  let removed = 0;
  for (const job of matchingJobs) {
    await job.remove();
    removed++;
  }

  return removed;
}
