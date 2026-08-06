import { reminderQueue } from '../src/queue';

async function main() {
  const testJobId = 'dedup-test-job-1';

  const firstAdd = await reminderQueue.addBulk([
    {
      name: 'medication-reminders',
      data: { test: 'first' } as any,
      opts: { jobId: testJobId, delay: 3600000 }
    }
  ]);
  console.log('First addBulk result:', firstAdd.map(j => ({ id: j.id, data: j.data })));

  const secondAdd = await reminderQueue.addBulk([
    {
      name: 'medication-reminders',
      data: { test: 'second' } as any,
      opts: { jobId: testJobId, delay: 3600000 }
    }
  ]);
  console.log('Second addBulk result:', secondAdd.map(j => ({ id: j.id, data: j.data })));

  const allDelayed = await reminderQueue.getJobs(['delayed']);
  const matching = allDelayed.filter(j => j.id === testJobId);
  console.log('Total jobs in Redis with this exact ID:', matching.length);
  console.log('Their data:', matching.map(j => j.data));

  for (const job of matching) {
    await job.remove();
  }

  await reminderQueue.close();
  process.exit(0);
}

main();
