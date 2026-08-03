import { reminderQueue } from '../src/queue';

const userMedicationId = process.argv[2];

async function main() {
  const delayedJobs = await reminderQueue.getJobs(['delayed']);
  const matching = delayedJobs.filter((job) => job.id?.startsWith(`${userMedicationId}_`));
  console.log(`Jobs matching ${userMedicationId}:`, matching.length);
  await reminderQueue.close();
  process.exit(0);
}

main();
