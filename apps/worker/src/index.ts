import './worker';
import { scheduleDailyTopup } from './topup';

async function main() {
  await scheduleDailyTopup();
  console.log('Worker process up: reminder consumer + topup scheduler/worker running');
}

main().catch((err) => {
  console.error('Fatal error starting worker process', err);
  process.exit(1);
});
