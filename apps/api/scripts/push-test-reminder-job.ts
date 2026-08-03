import { reminderQueue } from '../src/queue';
import { REMINDER_QUEUE_NAME } from 'shared';

async function main() {
  await reminderQueue.add(
    REMINDER_QUEUE_NAME,
    {
      userMedicationId: '00334b74-f31b-4426-a6c8-40beb85569fb',
      userId: '105b225a-1ce9-452e-90a9-5e96fad80dae',
      userEmail: 'rolawale92@gmail.com',
      medicationName: 'ibuprofen',
      dosageAmount: '200',
      dosageUnit: 'mg',
      scheduledDate: '2026-08-03',
      scheduledTime: 'TEST'
    },
    { jobId: 'manual-test-job-1', delay: 3000 }
  );
  console.log('Test job enqueued, firing in ~3 seconds');
  await reminderQueue.close();
  process.exit(0);
}

main();
