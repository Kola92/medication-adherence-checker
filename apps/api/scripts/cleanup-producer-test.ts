import { pool } from '../src/db';
import { reminderQueue } from '../src/queue';

async function main() {
  const userResult = await pool.query(
    "DELETE FROM users WHERE email = 'producer-test@example.com' RETURNING id"
  );
  console.log('Deleted user:', userResult.rows);

  const jobs = await reminderQueue.getJobs(['delayed']);
  let removed = 0;
  for (const job of jobs) {
    if (job.id?.startsWith('256fe4a9-fe61-4726-b887-14e66733b719')) {
      await job.remove();
      removed++;
    }
  }
  console.log('Removed queued jobs:', removed);

  await pool.end();
  await reminderQueue.close();
  process.exit(0);
}

main();
