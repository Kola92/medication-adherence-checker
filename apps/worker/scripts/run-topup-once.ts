import { runTopup } from '../src/topup';
import { pool } from '../src/db';
import { reminderQueue } from '../src/reminderQueue';

async function main() {
  console.log('Invoking runTopup() directly...');
  await runTopup();
  console.log('runTopup() finished.');

  await pool.end();
  await reminderQueue.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('runTopup() threw:', err);
  process.exit(1);
});
