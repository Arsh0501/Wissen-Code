import 'dotenv/config';
import { Worker, DelayedError } from 'bullmq';
import prisma from '../prisma';
import { redisConnection } from '../ai/queue';
import { finalizeSession } from '../routes/attempts';
import { closeGradingQueue } from './grading-jobs';
const connection = redisConnection(true);
const heartbeat = redisConnection();
const worker = new Worker(
  process.env.GRADING_QUEUE_NAME || 'wissen-grading',
  async (job, token) => {
    let result: Awaited<ReturnType<typeof finalizeSession>>;
    try {
      result = await finalizeSession(Number(job.data.sessionId));
    } catch (error: any) {
      if (error.status === 409) {
        await job.moveToDelayed(Date.now() + 16 * 60000, token);
        throw new DelayedError();
      }
      throw error;
    }
    if (result.status === 'not-found')
      throw new Error('Attempt no longer exists');
    return result;
  },
  {
    connection: connection as any,
    concurrency: Number(process.env.GRADING_CONCURRENCY || 2),
  },
);
worker.on('failed', (_job, error) =>
  console.error('Assessment grading failed:', error.message),
);
const timer = setInterval(
  () =>
    void heartbeat
      .set('wissen:grading:heartbeat', String(Date.now()), 'EX', 20)
      .catch((error) => console.error('Grading heartbeat:', error.message)),
  5000,
);
void heartbeat
  .set('wissen:grading:heartbeat', String(Date.now()), 'EX', 20)
  .catch(() => {});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  await worker.close();
  await closeGradingQueue();
  connection.disconnect();
  heartbeat.disconnect();
  await prisma.$disconnect();
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
