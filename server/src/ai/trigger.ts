import { aiConfigured } from './config';
import prisma from '../database/prisma';
import { aiQueue } from './queue';
import { AgentKind } from './agents';
export async function triggerInterviewAI(
  interviewId: number,
  kind: AgentKind,
  event?: { id: number; eventType: string; createdAt: Date; payload?: string },
) {
  if (!process.env.REDIS_URL || !aiConfigured()) return;
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
  });
  if (!interview) return;
  const questionId =
    kind === 'interview-assistant'
      ? event?.payload
        ? JSON.parse(event.payload).questionId
        : interview.currentQuestionId
      : undefined;
  const pending = await prisma.aIJob.findFirst({
    where: { interviewId, kind, status: { in: ['queued', 'running'] } },
  });
  if (pending) return;
  const job = await prisma.aIJob.create({
    data: {
      authorId: interview.interviewerId,
      interviewId,
      kind,
      input: {
        ...(questionId ? { questionId } : {}),
        ...(event
          ? {
              _trigger: {
                mode: 'automatic',
                eventId: event.id,
                eventType: event.eventType,
                createdAt: event.createdAt.toISOString(),
              },
            }
          : {}),
      },
    },
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
