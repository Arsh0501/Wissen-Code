import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { gradeAnswer, computeEvaluation } from '../services/grading';

const router = Router();

// Reaching this many tab switches auto-submits the test (earlier switches only warn)
export const MAX_TAB_SWITCHES = 3;

// Drafts arriving shortly after the deadline (network lag, auto-submit) are still accepted
const GRACE_PERIOD_MS = 30 * 1000;

function remainingSeconds(startedAt: Date, timeLimitMinutes: number): number {
  const remainingMs = timeLimitMinutes * 60 * 1000 - (Date.now() - startedAt.getTime());
  return Math.max(0, Math.floor(remainingMs / 1000));
}

function isPastDeadline(startedAt: Date, timeLimitMinutes: number): boolean {
  return Date.now() > startedAt.getTime() + timeLimitMinutes * 60 * 1000 + GRACE_PERIOD_MS;
}

function sessionResponse(
  session: { id: number; startedAt: Date; finishedAt: Date | null; drafts: any[]; _count?: { tabSwitches: number } },
  timeLimitMinutes: number
) {
  return {
    sessionId: session.id,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() || null,
    timeLimitMinutes,
    remainingSeconds: session.finishedAt ? 0 : remainingSeconds(session.startedAt, timeLimitMinutes),
    isFinished: !!session.finishedAt,
    drafts: session.drafts,
    tabSwitchCount: session._count?.tabSwitches ?? 0,
    tabSwitchLimit: MAX_TAB_SWITCHES,
  };
}

// Returns an error message if the assessment can't be started right now
export function availabilityError(a: { status: string; startAt: Date | null; endAt: Date | null }): string | null {
  if (a.status !== 'published') return 'This assessment is not open for candidates';
  const now = new Date();
  if (a.startAt && now < a.startAt) return `This assessment opens on ${a.startAt.toISOString()}`;
  if (a.endAt && now > a.endAt) return 'This assessment has closed';
  return null;
}

// GET /api/sessions/status/:assessmentId — Existing session for the current candidate (never creates one)
router.get('/status/:assessmentId', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(req.params.assessmentId);
    const candidateName = req.user?.name || 'Anonymous';

    const session = await prisma.assessmentSession.findUnique({
      where: { assessmentId_candidateName: { assessmentId, candidateName } },
      include: { drafts: true, _count: { select: { tabSwitches: true } }, assessment: { select: { timeLimitMinutes: true } } },
    });

    if (!session) return res.json({ exists: false });
    res.json({ exists: true, ...sessionResponse(session, session.assessment.timeLimitMinutes) });
  } catch (error: any) {
    console.error('Error fetching session status:', error);
    res.status(500).json({ error: 'Failed to fetch session status' });
  }
});

// POST /api/sessions/start — Start or resume an assessment session (starts the timer)
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.body;
    const candidateName = req.user?.name || 'Anonymous';

    if (!assessmentId) {
      return res.status(400).json({ error: 'assessmentId is required' });
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, timeLimitMinutes: true, status: true, startAt: true, endAt: true },
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    let session = await prisma.assessmentSession.findUnique({
      where: { assessmentId_candidateName: { assessmentId, candidateName } },
      include: { drafts: true, _count: { select: { tabSwitches: true } } },
    });

    if (!session) {
      // Only new sessions are gated — a candidate mid-test can always resume
      const blocked = availabilityError(assessment);
      if (blocked) return res.status(403).json({ error: blocked });

      session = await prisma.assessmentSession.create({
        data: { assessmentId, candidateName },
        include: { drafts: true, _count: { select: { tabSwitches: true } } },
      });
    }

    res.json(sessionResponse(session, assessment.timeLimitMinutes));
  } catch (error: any) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// GET /api/sessions/:sessionId — Get session with drafts + remaining time
router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);

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

    res.json({
      ...sessionResponse(session, session.assessment.timeLimitMinutes),
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
  const sessionId = parseInt(req.params.sessionId);
  const session = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      candidateName: true,
      startedAt: true,
      finishedAt: true,
      assessment: { select: { timeLimitMinutes: true } },
    },
  });

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  if (session.candidateName !== req.user?.name) {
    res.status(403).json({ error: 'This session belongs to another candidate' });
    return null;
  }
  if (session.finishedAt) {
    res.status(400).json({ error: 'Session is already finished' });
    return null;
  }
  if (isPastDeadline(session.startedAt, session.assessment.timeLimitMinutes)) {
    res.status(400).json({ error: 'Time is up for this session' });
    return null;
  }
  return session;
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

// POST /api/sessions/:sessionId/save-draft — Upsert a draft answer for a question
router.post('/:sessionId/save-draft', async (req: Request, res: Response) => {
  try {
    const { questionId, languageId, languageName } = req.body;

    if (!questionId || !languageId || !languageName) {
      return res.status(400).json({ error: 'questionId, languageId, and languageName are required' });
    }

    const session = await getWritableSession(req, res);
    if (!session) return;

    const draft = await prisma.draftAnswer.upsert({
      where: { sessionId_questionId: { sessionId: session.id, questionId } },
      update: draftData(req.body),
      create: { sessionId: session.id, questionId, ...draftData(req.body) },
    });

    res.json(draft);
  } catch (error: any) {
    console.error('Error saving draft:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// POST /api/sessions/:sessionId/save-all-drafts — Batch save all drafts at once
router.post('/:sessionId/save-all-drafts', async (req: Request, res: Response) => {
  try {
    const { drafts } = req.body;

    if (!drafts || !Array.isArray(drafts)) {
      return res.status(400).json({ error: 'drafts array is required' });
    }

    const session = await getWritableSession(req, res);
    if (!session) return;

    await prisma.$transaction(
      drafts.map((d: any) =>
        prisma.draftAnswer.upsert({
          where: { sessionId_questionId: { sessionId: session.id, questionId: d.questionId } },
          update: draftData(d),
          create: { sessionId: session.id, questionId: d.questionId, ...draftData(d) },
        })
      )
    );

    res.json({ saved: drafts.length });
  } catch (error: any) {
    console.error('Error saving drafts:', error);
    res.status(500).json({ error: 'Failed to save drafts' });
  }
});

// POST /api/sessions/:sessionId/tab-switch — Record the candidate leaving and returning to the exam tab
router.post('/:sessionId/tab-switch', async (req: Request, res: Response) => {
  try {
    const leftAt = new Date(req.body.leftAt);
    const durationMs = Math.round(Number(req.body.durationMs));

    if (isNaN(leftAt.getTime()) || !Number.isFinite(durationMs) || durationMs < 0) {
      return res.status(400).json({ error: 'leftAt (ISO date) and durationMs (>= 0) are required' });
    }

    const session = await getWritableSession(req, res);
    if (!session) return;

    await prisma.tabSwitchEvent.create({
      data: { sessionId: session.id, leftAt, durationMs },
    });
    const count = await prisma.tabSwitchEvent.count({ where: { sessionId: session.id } });

    // Reaching the limit ends the test — enforced here so it can't be bypassed client-side
    if (count >= MAX_TAB_SWITCHES) {
      await finalizeSession(session.id);
      return res.json({ count, limit: MAX_TAB_SWITCHES, autoSubmitted: true });
    }

    res.json({ count, limit: MAX_TAB_SWITCHES, autoSubmitted: false });
  } catch (error: any) {
    console.error('Error recording tab switch:', error);
    res.status(500).json({ error: 'Failed to record tab switch' });
  }
});

type FinalizeResult =
  | { status: 'finished'; body: Record<string, unknown> }
  | { status: 'already-finished' }
  | { status: 'not-found' };

// Mark a session finished (once, atomically) and grade every saved draft against all test cases
async function finalizeSession(sessionId: number): Promise<FinalizeResult> {
  const updateResult = await prisma.assessmentSession.updateMany({
    where: { id: sessionId, finishedAt: null },
    data: { finishedAt: new Date() },
  });

  if (updateResult.count === 0) {
    const existing = await prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { finishedAt: true },
    });
    return existing?.finishedAt ? { status: 'already-finished' } : { status: 'not-found' };
  }

  const session = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
    include: { drafts: true },
  });
  if (!session) return { status: 'not-found' };

  // Grade each draft answer against ALL test cases (sample + hidden)
  for (const draft of session.drafts) {
    await gradeAnswer(session.assessmentId, session.candidateName, draft);
  }

  const evaluation = await computeEvaluation(session.assessmentId, session.candidateName);
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
}

// POST /api/sessions/:sessionId/finish — Finalize session, grade all answers
router.post('/:sessionId/finish', async (req: Request, res: Response) => {
  try {
    const result = await finalizeSession(parseInt(req.params.sessionId));
    if (result.status === 'already-finished') return res.json({ message: 'Session is already finished' });
    if (result.status === 'not-found') return res.status(404).json({ error: 'Session not found' });
    res.json(result.body);
  } catch (error: any) {
    console.error('Error finishing session:', error);
    res.status(500).json({ error: 'Failed to finish session' });
  }
});

export default router;
