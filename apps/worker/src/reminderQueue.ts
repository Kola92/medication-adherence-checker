import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';
import { REMINDER_QUEUE_NAME, ReminderJobData } from 'shared';

const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null
});

connection.on('error', (err) => {
  console.error('Unexpected error on Redis connection (reminderQueue)', err);
});

export const reminderQueue = new Queue<ReminderJobData>(REMINDER_QUEUE_NAME, {
  connection
});
