import { asynchronousGrading, enqueueGrading } from '../platform/grading-jobs';
import { queueWebhook } from '../platform/webhooks';
import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { gradeAnswer, computeEvaluation } from '../services/grading';
import { canAccessAssessment } from '../services/guest-access';
import { WorkflowError } from '../services/structured-ai';

const router = Router();

// Reaching this many tab switches auto-submits the test (earlier switches only warn)
export const MAX_TAB_SWITCHES = 3;

// Drafts arriving shortly after the deadline (network lag, auto-submit) are still accepted
const GRACE_PERIOD_MS = 30 * 1000;

function remainingSeconds(startedAt: Date, timeLimitMinutes: number): number {
  const remainingMs =
    timeLimitMinutes * 60 * 1000 - (Date.now() - startedAt.getTime());
  return Math.max(0, Math.floor(remainingMs / 1000));
}

function isPastDeadline(startedAt: Date, timeLimitMinutes: number): boolean {
  return (
    Date.now() >
    startedAt.getTime() + timeLimitMinutes * 60 * 1000 + GRACE_PERIOD_MS
  );
}

function sessionResponse(
  session: {
    id: number;
    startedAt: Date;
    finishedAt: Date | null;
    drafts: any[];
    _count?: { tabSwitches: number };
  },
  timeLimitMinutes: number,
) {
  return {
    sessionId: session.id,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() || null,
    timeLimitMinutes,
    remainingSeconds: session.finishedAt
      ? 0
      : remainingSeconds(session.startedAt, timeLimitMinutes),
    isFinished: !!session.finishedAt,
    drafts: session.drafts,
    tabSwitchCount: session._count?.tabSwitches ?? 0,
    tabSwitchLimit: MAX_TAB_SWITCHES,
  };
}

// Returns an error message if the assessment can't be started right now
export function availabilityError(a: {
  status: string;
  startAt: Date | null;
  endAt: Date | null;
}): string | null {
  if (a.status !== 'published')
    return 'This assessment is not open for candidates';
  const now = new Date();
  if (a.startAt && now < a.startAt)
    return `This assessment opens on ${a.startAt.toISOString()}`;
  if (a.endAt && now > a.endAt) return 'This assessment has closed';
  return null;
}

// GET /api/sessions/status/:assessmentId — Existing session for the current candidate (never creates one)
router.get('/status/:assessmentId', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(req.params.assessmentId);
    const candidateName = req.user?.name || 'Anonymous';

    const session = await prisma.assessmentSession.findFirst({
      where: {
        assessmentId,
        candidateName,
        ...(req.user?.role === 'candidate'
          ? { candidateUserId: req.user.id }
          : {}),
        ...(req.user?.role === 'admin' ? { finishedAt: null } : {}),
      },
      orderBy: { startedAt: 'desc' },
      include: {
        drafts: true,
        _count: { select: { tabSwitches: true } },
        assessment: { select: { timeLimitMinutes: true } },
      },
    });

    if (!session) return res.json({ exists: false });
    res.json({
      exists: true,
      ...sessionResponse(
        session,
        session.durationMinutes ?? session.assessment.timeLimitMinutes,
      ),
    });
  } catch (error: any) {
    console.error('Error fetching session status:', error);
    res.status(500).json({ error: 'Failed to fetch session status' });
  }
});

// Removed: POST /sessions/start is now POST /assessments/:id/start in assessments router

// GET /api/attempts/:id — Get session with drafts + remaining time
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);

    const session = await prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      include: {
        drafts: true,
        _count: { select: { tabSwitches: true } },
        assessment: { select: { timeLimitMinutes: true } },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (
      req.user!.role !== 'admin' &&
      (session.candidateUserId
        ? session.candidateUserId !== req.user!.id
        : session.candidateName !== req.user!.name)
    )
      return res
        .status(403)
        .json({ error: 'This session belongs to another candidate' });
    if (!(await canAccessAssessment(req, session.assessmentId)))
      return res.status(403).json({ error: 'Assessment access denied' });
    res.json({
      ...sessionResponse(
        session,
        session.durationMinutes ?? session.assessment.timeLimitMinutes,
      ),
      assessmentId: session.assessmentId,
      candidateName: session.candidateName,
    });
  } catch (error: any) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Loads a session that is still accepting answers, or sends the error response
async function getWritableSession(req: Request, res: Response) {
  const sessionId = parseInt(req.params.id);
  const session = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      assessmentId: true,
      candidateName: true,
      candidateUserId: true,
      durationMinutes: true,
      startedAt: true,
      finishedAt: true,
      assessment: {
        select: { timeLimitMinutes: true, allowedLanguages: true },
      },
    },
  });

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  if (
    session.candidateUserId
      ? session.candidateUserId !== req.user?.id
      : session.candidateName !== req.user?.name
  ) {
    res
      .status(403)
      .json({ error: 'This session belongs to another candidate' });
    return null;
  }
  if (session.finishedAt) {
    res.status(400).json({ error: 'Session is already finished' });
    return null;
  }
  if (
    isPastDeadline(
      session.startedAt,
      session.durationMinutes ?? session.assessment.timeLimitMinutes,
    )
  ) {
    res.status(400).json({ error: 'Time is up for this session' });
    return null;
  }
  return session;
}

async function checkDraft(
  session: { assessmentId: number; assessment: { allowedLanguages: string } },
  draft: any,
) {
  if (typeof draft.code !== 'string' || draft.code.length > 100000)
    throw new WorkflowError('Answer must contain at most 100000 characters');
  const link = await prisma.assessmentQuestion.findUnique({
    where: {
      assessmentId_questionId: {
        assessmentId: session.assessmentId,
        questionId: Number(draft.questionId),
      },
    },
    include: { question: true },
  });
  const allowed: number[] = JSON.parse(session.assessment.allowedLanguages);
  if (
    !link ||
    !Number.isInteger(draft.languageId) ||
    ![71, 62, 54, 63, 82].includes(draft.languageId) ||
    (link?.question.questionType === 'sql'
      ? draft.languageId !== 82
      : !['mcq', 'written', 'project'].includes(
          link?.question.questionType ?? '',
        ) &&
        allowed.length > 0 &&
        !allowed.includes(draft.languageId))
  )
    throw new WorkflowError(
      'Question or language is not allowed in this assessment',
    );
}

function draftData(d: any) {
  return {
    languageId: d.languageId,
    languageName: d.languageName,
    code: d.code || '',
    isFlagged: d.isFlagged ?? false,
    isAnswered: d.isAnswered ?? false,
  };
}

// PUT /api/attempts/:id/answer — Upsert a draft answer for a question
router.put('/:id/answer', async (req: Request, res: Response) => {
  try {
    const { questionId, languageId, languageName } = req.body;

    if (!questionId || !languageId || !languageName) {
      return res.status(400).json({
        error: 'questionId, languageId, and languageName are required',
      });
    }

    const session = await getWritableSession(req, res);
    if (!session) return;

    await checkDraft(session, req.body);
    const draft = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AssessmentSession" WHERE id = ${session.id} FOR UPDATE`;
      if (
        (
          await tx.assessmentSession.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).finishedAt
      )
        throw new WorkflowError('Session already submitted', 409);
      return tx.draftAnswer.upsert({
        where: { sessionId_questionId: { sessionId: session.id, questionId } },
        update: draftData(req.body),
        create: { sessionId: session.id, questionId, ...draftData(req.body) },
      });
    });

    res.json(draft);
  } catch (error: any) {
    if (error instanceof WorkflowError)
      return res.status(error.status).json({ error: error.message });
    console.error('Error saving draft:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// POST /api/attempts/:id/save-all-drafts — Batch save all drafts at once
router.post('/:id/save-all-drafts', async (req: Request, res: Response) => {
  try {
    const { drafts } = req.body;

    if (!drafts || !Array.isArray(drafts)) {
      return res.status(400).json({ error: 'drafts array is required' });
    }

    const session = await getWritableSession(req, res);
    if (!session) return;

    for (const draft of drafts) await checkDraft(session, draft);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AssessmentSession" WHERE id = ${session.id} FOR UPDATE`;
      if (
        (
          await tx.assessmentSession.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).finishedAt
      )
        throw new WorkflowError('Session already submitted', 409);
      for (const d of drafts)
        await tx.draftAnswer.upsert({
          where: {
            sessionId_questionId: {
              sessionId: session.id,
              questionId: d.questionId,
            },
          },
          update: draftData(d),
          create: {
            sessionId: session.id,
            questionId: d.questionId,
            ...draftData(d),
          },
        });
    });

    res.json({ saved: drafts.length });
  } catch (error: any) {
    if (error instanceof WorkflowError)
      return res.status(error.status).json({ error: error.message });
    console.error('Error saving drafts:', error);
    res.status(500).json({ error: 'Failed to save drafts' });
  }
});

// POST /api/attempts/:id/tab-switch — Record the candidate leaving and returning to the exam tab
router.post('/:id/tab-switch', async (req: Request, res: Response) => {
  try {
    const leftAt = new Date(req.body.leftAt);
    const durationMs = Math.round(Number(req.body.durationMs));

    if (
      isNaN(leftAt.getTime()) ||
      !Number.isFinite(durationMs) ||
      durationMs < 0
    ) {
      return res.status(400).json({
        error: 'leftAt (ISO date) and durationMs (>= 0) are required',
      });
    }

    const session = await getWritableSession(req, res);
    if (!session) return;

    await prisma.tabSwitchEvent.create({
      data: { sessionId: session.id, leftAt, durationMs },
    });
    const count = await prisma.tabSwitchEvent.count({
      where: { sessionId: session.id },
    });

    // Reaching the limit ends the test — enforced here so it can't be bypassed client-side
    if (count >= MAX_TAB_SWITCHES) {
      if (asynchronousGrading()) {
        await prisma.assessmentSession.updateMany({
          where: { id: session.id, finishedAt: null },
          data: { finishedAt: new Date() },
        });
        await enqueueGrading(session.id);
      } else await finalizeSession(session.id);
      return res.json({ count, limit: MAX_TAB_SWITCHES, autoSubmitted: true });
    }

    res.json({ count, limit: MAX_TAB_SWITCHES, autoSubmitted: false });
  } catch (error: any) {
    console.error('Error recording tab switch:', error);
    res.status(500).json({ error: 'Failed to record tab switch' });
  }
});

// POST /api/attempts/:id/paste — Record text pasted into the code editor
router.post('/:id/paste', async (req: Request, res: Response) => {
  try {
    const questionId = Number(req.body.questionId);
    const charCount = Math.round(Number(req.body.charCount));
    const lineCount = Math.round(Number(req.body.lineCount));

    if (
      !Number.isInteger(questionId) ||
      !Number.isFinite(charCount) ||
      charCount < 1 ||
      !Number.isFinite(lineCount) ||
      lineCount < 1
    ) {
      return res.status(400).json({
        error: 'questionId, charCount (>= 1) and lineCount (>= 1) are required',
      });
    }

    const session = await getWritableSession(req, res);
    if (!session) return;

    await prisma.pasteEvent.create({
      data: { sessionId: session.id, questionId, charCount, lineCount },
    });

    res.json({ recorded: true });
  } catch (error: any) {
    console.error('Error recording paste:', error);
    res.status(500).json({ error: 'Failed to record paste' });
  }
});

type FinalizeResult =
  | { status: 'finished'; body: Record<string, unknown> }
  | { status: 'already-finished' }
  | { status: 'not-found' };

// Mark a session finished (once, atomically) and grade every saved draft against all test cases
export async function finalizeSession(
  sessionId: number,
): Promise<FinalizeResult> {
  const existing = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
  });
  if (!existing) return { status: 'not-found' };
  if (existing.gradingStatus === 'completed')
    return { status: 'already-finished' };
  const claimed = await prisma.assessmentSession.updateMany({
    where: {
      id: sessionId,
      OR: [
        { gradingStatus: { in: ['pending', 'failed'] } },
        {
          gradingStatus: 'grading',
          gradingStartedAt: { lt: new Date(Date.now() - 15 * 60000) },
        },
      ],
    },
    data: {
      finishedAt: existing.finishedAt ?? new Date(),
      gradingStatus: 'grading',
      gradingStartedAt: new Date(),
    },
  });
  if (!claimed.count)
    throw new WorkflowError('Submission is being graded. Retry shortly.', 409);
  try {
    const session = await prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      include: { drafts: true },
    });
    if (!session) return { status: 'not-found' };

    // Grade each draft answer against ALL test cases (sample + hidden)
    for (const draft of session.drafts) {
      await gradeAnswer(
        session.assessmentId,
        session.candidateName,
        draft,
        session.id,
        async () => {
          await prisma.assessmentSession.updateMany({
            where: { id: session.id, gradingStatus: 'grading' },
            data: { gradingStartedAt: new Date() },
          });
        },
      );
    }

    const evaluation = await computeEvaluation(
      session.assessmentId,
      session.candidateName,
      session.candidateUserId ?? undefined,
    );
    await prisma.assessmentSession.update({
      where: { id: sessionId },
      data: { gradingStatus: 'completed' },
    });
    void queueWebhook('assessment.completed', session.id).catch((error) =>
      console.error('Webhook enqueue failed:', error.message),
    );
    return {
      status: 'finished',
      body: {
        sessionId,
        assessmentId: session.assessmentId,
        candidateName: session.candidateName,
        finishedAt: session.finishedAt?.toISOString(),
        overallScore: evaluation?.percentage ?? 0,
        passed: evaluation?.passed ?? false,
      },
    };
  } catch (error) {
    await prisma.assessmentSession.update({
      where: { id: sessionId },
      data: { gradingStatus: 'failed' },
    });
    throw error;
  }
}

// POST /api/attempts/:id/submit — Finalize session, grade all answers
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const session = await prisma.assessmentSession.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (
      session.candidateUserId
        ? session.candidateUserId !== req.user!.id
        : session.candidateName !== req.user!.name
    )
      return res
        .status(403)
        .json({ error: 'This session belongs to another candidate' });
    if (!(await canAccessAssessment(req, session.assessmentId)))
      return res.status(403).json({ error: 'Assessment access denied' });
    if (asynchronousGrading()) {
      if (session.gradingStatus === 'completed')
        return res.json({
          sessionId: session.id,
          message: 'Session already graded',
        });
      await prisma.assessmentSession.updateMany({
        where: { id: session.id, finishedAt: null },
        data: { finishedAt: new Date() },
      });
      await enqueueGrading(session.id);
      return res.status(202).json({
        sessionId: session.id,
        assessmentId: session.assessmentId,
        gradingStatus: 'queued',
        message: 'Answers received. Grading is processing.',
      });
    }
    const result = await finalizeSession(session.id);
    if (result.status === 'already-finished')
      return res.json({ message: 'Session is already finished' });
    if (result.status === 'not-found')
      return res.status(404).json({ error: 'Session not found' });
    res.json(result.body);
  } catch (error: any) {
    if (error instanceof WorkflowError)
      return res.status(error.status).json({ error: error.message });
    console.error('Error finishing session:', error);
    res.status(500).json({ error: 'Failed to finish session' });
  }
});

export default router;
