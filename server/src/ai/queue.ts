import { Queue } from 'bullmq';
import Redis from 'ioredis';
export function redisConnection(worker = false) {
  if (!process.env.REDIS_URL)
    throw Object.assign(new Error('Redis is not configured'), { status: 503 });
  const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: true,
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: worker ? undefined : 10000,
  });
  connection.on('error', (err) => console.error('Redis connection:', err.message));
  return connection;
}
let queue: Queue | undefined;
export function aiQueue() {
  return (queue ??= new Queue('wissen-ai', {
    connection: redisConnection() as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  }));
}
export async function closeQueue() {
  if (queue) await queue.close();
}
