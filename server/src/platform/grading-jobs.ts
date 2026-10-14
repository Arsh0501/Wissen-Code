import { Queue } from 'bullmq';
import { redisConnection } from '../ai/queue';
let queue: Queue | undefined;
let connection: ReturnType<typeof redisConnection> | undefined;
export function asynchronousGrading() {
  return process.env.ASYNC_GRADING === '1';
}
export function gradingQueue() {
  return (queue ??= new Queue(
    process.env.GRADING_QUEUE_NAME || 'wissen-grading',
    {
      connection: (connection ??= redisConnection()) as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    },
  ));
}
export async function enqueueGrading(sessionId: number) {
  const queue = gradingQueue();
  const id = `attempt-${sessionId}`;
  const existing = await queue.getJob(id);
  if (existing && ['completed', 'failed'].includes(await existing.getState()))
    await existing.remove();
  await queue.add('grade', { sessionId }, { jobId: id });
}
export async function closeGradingQueue() {
  if (queue) {
    await queue.close();
    queue = undefined;
    connection?.disconnect();
    connection = undefined;
  }
}
