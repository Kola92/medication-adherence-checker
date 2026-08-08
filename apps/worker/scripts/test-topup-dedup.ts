import { scheduleDailyTopup, topupQueue } from './topup';

async function main() {
  await scheduleDailyTopup();
  const firstCheck = await topupQueue.getRepeatableJobs();
  console.log('After 1st call:', firstCheck.length, firstCheck);

  await scheduleDailyTopup();
  const secondCheck = await topupQueue.getRepeatableJobs();
  console.log('After 2nd call:', secondCheck.length, secondCheck);

  // cleanup
  for (const job of secondCheck) {
    await topupQueue.removeRepeatableByKey(job.key);
  }
  const afterCleanup = await topupQueue.getRepeatableJobs();
  console.log('After cleanup:', afterCleanup.length);

  process.exit(0);
}

main();
