import prisma from '../prisma';

/**
 * Background grading inside the API process, used when no dedicated grading worker is
 * configured (ASYNC_GRADING unset). Submit answers immediately and grade a few attempts
 * at a time, so a cohort submitting at the deadline never waits on an HTTP request.
 */
type Grader = (sessionId: number) => Promise<unknown>;
const queue: number[] = [];
const queued = new Set<number>();
let active = 0;
const concurrency = () => Math.max(1, Number(process.env.GRADING_CONCURRENCY || 4));

const idleWaiters: (() => void)[] = [];
export function inlineGradingStats() {
  return { active, waiting: queue.length };
}
/** Resolves once every queued attempt has been graded (used by tests and shutdown). */
export function whenInlineGradingIdle(): Promise<void> {
  if (!active && !queue.length) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

export function enqueueInlineGrading(sessionId: number, grade: Grader) {
  if (queued.has(sessionId)) return;
  queued.add(sessionId);
  queue.push(sessionId);
  pump(grade);
}

function pump(grade: Grader) {
  while (active < concurrency() && queue.length) {
    const sessionId = queue.shift()!;
    active++;
    void grade(sessionId)
      .catch((error: any) => {
        // 409 = another process claimed it; anything else is logged and left as "failed"
        // so the startup sweep or an admin regrade can pick it up again.
        if (error?.status !== 409)
          console.error(
            `Grading attempt ${sessionId} failed:`,
            error instanceof Error ? error.message : error,
          );
      })
      .finally(() => {
        active--;
        queued.delete(sessionId);
        pump(grade);
        if (!active && !queue.length) idleWaiters.splice(0).forEach((resolve) => resolve());
      });
  }
}

/** Re-queue attempts that were submitted but never graded (e.g. the API restarted mid-run). */
export async function sweepUngradedAttempts(grade: Grader) {
  const stale = await prisma.assessmentSession.findMany({
    where: {
      finishedAt: { not: null },
      OR: [
        { gradingStatus: { in: ['pending', 'failed'] } },
        { gradingStatus: 'grading', gradingStartedAt: { lt: new Date(Date.now() - 15 * 60000) } },
      ],
    },
    select: { id: true },
    orderBy: { finishedAt: 'asc' },
    take: 5000,
  });
  for (const row of stale) enqueueInlineGrading(row.id, grade);
  return stale.length;
}
