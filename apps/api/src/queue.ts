import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';
import { REMINDER_QUEUE_NAME, ReminderJobData } from 'shared';

export const redisConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null
});

redisConnection.on('error', (err) => {
  console.error('Unexpected error on Redis connection', err);
});

export const reminderQueue = new Queue<ReminderJobData>(REMINDER_QUEUE_NAME, {
  connection: redisConnection
});
