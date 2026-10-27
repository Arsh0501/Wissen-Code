import { Server } from 'socket.io';
import { redisConnection } from './queue';
import prisma from '../database/prisma';
import { latestUIResults } from './results';
const channel = 'wissen:ai-results';
export function subscribeAIResults(io: Server) {
  if (!process.env.REDIS_URL) return;
  const sub = redisConnection(true);
  void sub
    .subscribe(channel)
    .catch((error) => console.error('AI results subscription:', error.message));
  sub.on('message', async (_channel, id) => {
    try {
      const job = await prisma.aIJob.findUnique({ where: { id } });
      if (job?.status === 'completed' && job.interviewId && job.output)
        io.to(`private:interview:${job.interviewId}:user:${job.authorId}`).emit('AI_RESULTS', {
          interviewId: job.interviewId,
          ...(await latestUIResults(job.interviewId, job.authorId)),
        });
    } catch (error: any) {
      console.error('AI delivery:', error.message);
    }
  });
}
export async function publishAIResults(id: string) {
  const pub = redisConnection();
  try {
    await pub.publish(channel, id);
  } finally {
    pub.disconnect();
  }
}
