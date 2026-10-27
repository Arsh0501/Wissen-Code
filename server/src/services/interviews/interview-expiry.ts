import type { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';

let notifyEnded: ((id: number, endedAt: string) => void) | undefined;
export function setInterviewDeadlineNotifier(notifier: (id: number, endedAt: string) => void) {
  notifyEnded = notifier;
}

export async function enforceInterviewDeadlines(
  where: Prisma.InterviewWhereInput = {},
  now = new Date(),
) {
  const scheduled = await prisma.interview.findMany({
    where: { AND: [where, { status: 'scheduled', startedAt: null, scheduledAt: { lte: now } }] },
    select: { id: true, scheduledAt: true, timeLimitMinutes: true },
  });
  for (const interview of scheduled) {
    const deadline = new Date(
      interview.scheduledAt!.getTime() + interview.timeLimitMinutes * 60000,
    );
    if (deadline > now) continue;
    await prisma.interview.updateMany({
      where: {
        id: interview.id,
        status: 'scheduled',
        startedAt: null,
        scheduledAt: interview.scheduledAt,
        timeLimitMinutes: interview.timeLimitMinutes,
      },
      data: { status: 'expired', endedAt: deadline },
    });
  }
  const live = await prisma.interview.findMany({
    where: { AND: [where, { status: 'in_progress' }] },
    select: {
      id: true,
      startedAt: true,
      scheduledAt: true,
      createdAt: true,
      timeLimitMinutes: true,
    },
  });
  for (const interview of live) {
    // Extensions already increase timeLimitMinutes; do not add extendedMinutes again.
    const start = interview.startedAt ?? interview.scheduledAt ?? interview.createdAt;
    const deadline = new Date(start.getTime() + interview.timeLimitMinutes * 60000);
    if (deadline > now) continue;
    const changed = await prisma.$transaction(async (tx) => {
      const update = await tx.interview.updateMany({
        where: {
          id: interview.id,
          status: 'in_progress',
          startedAt: interview.startedAt,
          timeLimitMinutes: interview.timeLimitMinutes,
        },
        data: { status: 'completed', endedAt: deadline },
      });
      if (update.count)
        await tx.interviewEvent.create({
          data: {
            interviewId: interview.id,
            eventType: 'INTERVIEW_ENDED',
            actorRole: 'system',
            payload: JSON.stringify({
              endedAt: deadline.toISOString(),
              reason: 'duration_elapsed',
            }),
          },
        });
      return update.count;
    });
    if (changed) notifyEnded?.(interview.id, deadline.toISOString());
  }
}
