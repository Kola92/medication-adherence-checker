import { Queue } from 'bullmq';
import { fromZonedTime } from 'date-fns-tz';
import { REMINDER_QUEUE_NAME, ReminderJobData } from './queues';

const SCHEDULING_WINDOW_DAYS = 14;

export interface ScheduleParams {
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

export async function scheduleReminderJobs(
  queue: Queue<ReminderJobData>,
  params: ScheduleParams
): Promise<number> {
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

  await queue.addBulk(jobs);
  return jobs.length;
}

export async function cancelReminderJobs(
  queue: Queue<ReminderJobData>,
  userMedicationId: string
): Promise<number> {
  const delayedJobs = await queue.getJobs(['delayed']);
  const matchingJobs = delayedJobs.filter((job) => job.id?.startsWith(`${userMedicationId}_`));

  let removed = 0;
  for (const job of matchingJobs) {
    await job.remove();
    removed++;
  }

  return removed;
}
