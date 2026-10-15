import { aiConfigured } from './config';
import prisma from '../prisma';
import { aiQueue } from './queue';
import { AgentKind } from './agents';
export async function triggerInterviewAI(interviewId: number, kind: AgentKind) {
  if (!process.env.REDIS_URL || !aiConfigured()) return;
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
  });
  if (!interview) return;
  const pending = await prisma.aIJob.findFirst({
    where: { interviewId, kind, status: { in: ['queued', 'running'] } },
  });
  if (pending) return;
  const job = await prisma.aIJob.create({
    data: { authorId: interview.interviewerId, interviewId, kind, input: {} },
  });
  try {
    await aiQueue().add(kind, { id: job.id }, { jobId: job.id });
  } catch {
    await prisma.aIJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: 'Queue unavailable' },
    });
  }
}
