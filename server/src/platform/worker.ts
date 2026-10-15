import 'dotenv/config';
import { deliverWebhooks } from './webhooks';
import prisma from '../prisma';
import { deliverOutbox } from './communication';
let stopping = false;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function run() {
  while (!stopping) {
    try {
      await deliverOutbox();
      await deliverWebhooks();
    } catch (error) {
      console.error(
        'Outbox processing failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
    if (!stopping) await pause(5000);
  }
  await prisma.$disconnect();
}
process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});
void run();
