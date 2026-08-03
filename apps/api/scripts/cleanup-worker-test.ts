import { pool } from '../src/db';
import { reminderQueue } from '../src/queue';

async function main() {
  const userResult = await pool.query(
    "DELETE FROM users WHERE email = 'rolawale92@gmail.com' RETURNING id"
  );
  console.log('Deleted user:', userResult.rows);

  const delayedJobs = await reminderQueue.getJobs(['delayed']);
  let removed = 0;
  for (const job of delayedJobs) {
    if (job.id?.startsWith('00334b74-f31b-4426-a6c8-40beb85569fb')) {
      await job.remove();
      removed++;
    }
  }
  console.log('Removed delayed jobs:', removed);

  const completedJob = await reminderQueue.getJob('manual-test-job-1');
  if (completedJob) {
    await completedJob.remove();
    console.log('Removed completed test job');
  }

  await pool.end();
  await reminderQueue.close();
  process.exit(0);
}

main();
