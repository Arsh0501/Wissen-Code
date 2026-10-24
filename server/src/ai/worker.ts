import '../config/environment';
import { Worker } from 'bullmq';
import prisma from '../prisma';
import { publishAIResults } from './realtime';
import { redisConnection } from './queue';
import { executeAgent, AgentKind } from './agents';
async function processJob(id: string) {
  const job = await prisma.aIJob.findUniqueOrThrow({ where: { id } });
  if (job.status === 'completed') return job.output;
  await prisma.aIJob.update({
    where: { id },
    data: { status: 'running', error: null },
  });
  try {
    const output = await executeAgent(
      job.kind as AgentKind,
      job.input,
      job.authorId,
      job.interviewId ?? undefined,
    );
    await prisma.aIJob.update({
      where: { id },
      data: { status: 'completed', output: output as any },
    });
    try {
      await publishAIResults(id);
    } catch (error: any) {
      console.error(
        'AI notification failed; results available by polling:',
        error.message,
      );
    }
    return output;
  } catch (error: any) {
    await prisma.aIJob.update({
      where: { id },
      data: { status: 'failed', error: 'AI generation failed. Retry the job.' },
    });
    throw error;
  }
}
const connection = redisConnection(true);
const worker = new Worker('wissen-ai', (job) => processJob(job.data.id), {
  connection: connection as any,
  concurrency: 2,
  limiter: { max: 10, duration: 60000 },
});
worker.on('failed', (_job, error) =>
  console.error('AI job failed:', error.message),
);
async function close() {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
