import { reminderQueue } from '../src/queue';

const userMedicationId = process.argv[2];

async function main() {
  if (!userMedicationId) {
    console.error('Usage: tsx delete-jobs-for-medication.ts <userMedicationId>');
    process.exit(1);
  }

  const delayedJobs = await reminderQueue.getJobs(['delayed']);
  const matching = delayedJobs.filter((job) => job.id?.startsWith(`${userMedicationId}_`));

  console.log(`Removing ${matching.length} orphaned jobs for ${userMedicationId}`);
  for (const job of matching) {
    await job.remove();
  }

  const remaining = await reminderQueue.getJobs(['delayed']);
  const stillMatching = remaining.filter((job) => job.id?.startsWith(`${userMedicationId}_`));
  console.log(`Remaining: ${stillMatching.length}`);

  await reminderQueue.close();
  process.exit(0);
}

main();
