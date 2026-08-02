import { reminderQueue } from '../src/queue';

async function main() {
  const delayedCount = await reminderQueue.getDelayedCount();
  const delayedJobs = await reminderQueue.getJobs(['delayed'], 0, 5);

  console.log('Total delayed jobs in queue:', delayedCount);
  console.log('Sample jobs:', delayedJobs.map(j => ({
    id: j.id,
    data: j.data,
    delay: j.opts.delay
  })));

  await reminderQueue.close();
  process.exit(0);
}

main();
