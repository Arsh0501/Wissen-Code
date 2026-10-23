import prisma from '../prisma';
import { executeAgent, AgentKind } from './agents';

/** Run a persisted job in the request when no background queue is configured. */
export async function runInlineJob(id: string, execute = executeAgent) {
  const claimed = await prisma.aIJob.updateMany({
    where: { id, status: { in: ['queued', 'failed'] } },
    data: { status: 'running', error: null },
  });
  if (!claimed.count) throw Object.assign(new Error('This AI job is already running or completed'), { status: 409 });
  const job = await prisma.aIJob.findUniqueOrThrow({ where: { id } });
  try {
    const output = await execute(job.kind as AgentKind, job.input, job.authorId, job.interviewId ?? undefined);
    return await prisma.aIJob.update({ where: { id }, data: { status: 'completed', output: output as any } });
  } catch (error) {
    await prisma.aIJob.update({ where: { id }, data: { status: 'failed', error: 'AI generation failed. Retry the job.' } });
    throw error;
  }
}
