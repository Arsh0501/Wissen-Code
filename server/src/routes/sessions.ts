import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { executeCode } from '../services/judge0';

const router = Router();

// POST /api/sessions/start — Start or resume an assessment session
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.body;
    const candidateName = (req as any).candidateName || 'Anonymous';

    if (!assessmentId) {
      return res.status(400).json({ error: 'assessmentId is required' });
    }

    // Check if assessment exists
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, timeLimitMinutes: true, name: true },
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    // Upsert session — create if new, return existing if already started
    let session = await prisma.assessmentSession.findUnique({
      where: {
        assessmentId_candidateName: { assessmentId, candidateName },
      },
      include: {
        drafts: true,
      },
    });

    if (!session) {
      session = await prisma.assessmentSession.create({
        data: {
          assessmentId,
          candidateName,
        },
        include: {
          drafts: true,
        },
      });
    }

    // Check if already finished
    if (session.finishedAt) {
      return res.json({
        sessionId: session.id,
        startedAt: session.startedAt.toISOString(),
        finishedAt: session.finishedAt.toISOString(),
        timeLimitMinutes: assessment.timeLimitMinutes,
        remainingSeconds: 0,
        isFinished: true,
        drafts: session.drafts,
      });
    }

    // Compute remaining time
    const nowMs = Date.now();
    const startMs = session.startedAt.getTime();
    const limitMs = assessment.timeLimitMinutes * 60 * 1000;
    const elapsedMs = nowMs - startMs;
    const remainingMs = Math.max(0, limitMs - elapsedMs);
    const remainingSeconds = Math.floor(remainingMs / 1000);

    res.json({
      sessionId: session.id,
      startedAt: session.startedAt.toISOString(),
      finishedAt: null,
      timeLimitMinutes: assessment.timeLimitMinutes,
      remainingSeconds,
      isFinished: false,
      drafts: session.drafts,
    });
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
        assessment: {
          select: { timeLimitMinutes: true },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Compute remaining time
    const nowMs = Date.now();
    const startMs = session.startedAt.getTime();
    const limitMs = session.assessment.timeLimitMinutes * 60 * 1000;
    const elapsedMs = nowMs - startMs;
    const remainingMs = Math.max(0, limitMs - elapsedMs);
    const remainingSeconds = Math.floor(remainingMs / 1000);

    res.json({
      sessionId: session.id,
      assessmentId: session.assessmentId,
      candidateName: session.candidateName,
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt?.toISOString() || null,
      timeLimitMinutes: session.assessment.timeLimitMinutes,
      remainingSeconds: session.finishedAt ? 0 : remainingSeconds,
      isFinished: !!session.finishedAt,
      drafts: session.drafts,
    });
  } catch (error: any) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST /api/sessions/:sessionId/save-draft — Upsert a draft answer for a question
router.post('/:sessionId/save-draft', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const { questionId, languageId, languageName, code, isFlagged, isAnswered } = req.body;

    if (!questionId || !languageId || !languageName) {
      return res.status(400).json({ error: 'questionId, languageId, and languageName are required' });
    }

    // Verify session exists and isn't finished
    const session = await prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { finishedAt: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.finishedAt) {
      return res.status(400).json({ error: 'Session is already finished' });
    }

    const draft = await prisma.draftAnswer.upsert({
      where: {
        sessionId_questionId: { sessionId, questionId },
      },
      update: {
        languageId,
        languageName,
        code: code || '',
        isFlagged: isFlagged ?? false,
        isAnswered: isAnswered ?? false,
      },
      create: {
        sessionId,
        questionId,
        languageId,
        languageName,
        code: code || '',
        isFlagged: isFlagged ?? false,
        isAnswered: isAnswered ?? false,
      },
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
    const sessionId = parseInt(req.params.sessionId);
    const { drafts } = req.body;
    // drafts: Array of { questionId, languageId, languageName, code, isFlagged, isAnswered }

    if (!drafts || !Array.isArray(drafts)) {
      return res.status(400).json({ error: 'drafts array is required' });
    }

    // Verify session exists and isn't finished
    const session = await prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { finishedAt: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.finishedAt) {
      return res.status(400).json({ error: 'Session is already finished' });
    }

    // Upsert each draft
    const results = [];
    for (const d of drafts) {
      const draft = await prisma.draftAnswer.upsert({
        where: {
          sessionId_questionId: { sessionId, questionId: d.questionId },
        },
        update: {
          languageId: d.languageId,
          languageName: d.languageName,
          code: d.code || '',
          isFlagged: d.isFlagged ?? false,
          isAnswered: d.isAnswered ?? false,
        },
        create: {
          sessionId,
          questionId: d.questionId,
          languageId: d.languageId,
          languageName: d.languageName,
          code: d.code || '',
          isFlagged: d.isFlagged ?? false,
          isAnswered: d.isAnswered ?? false,
        },
      });
      results.push(draft);
    }

    res.json({ saved: results.length });
  } catch (error: any) {
    console.error('Error saving drafts:', error);
    res.status(500).json({ error: 'Failed to save drafts' });
  }
});

// POST /api/sessions/:sessionId/finish — Finalize session, grade all answers
router.post('/:sessionId/finish', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);

    // Atomically claim and mark session as finished to prevent duplicate concurrent finishes
    const updateResult = await prisma.assessmentSession.updateMany({
      where: { id: sessionId, finishedAt: null },
      data: { finishedAt: new Date() },
    });

    if (updateResult.count === 0) {
      // Session does not exist or was already finished
      const existing = await prisma.assessmentSession.findUnique({
        where: { id: sessionId },
        select: { finishedAt: true },
      });
      if (existing?.finishedAt) {
        return res.json({ message: 'Session is already finished' });
      }
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get session with drafts
    const session = await prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      include: {
        drafts: true,
        assessment: {
          select: { id: true, timeLimitMinutes: true },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Grade each draft answer against ALL test cases (sample + hidden)
    const results = [];

    for (const draft of session.drafts) {
      // Remove any prior submission for this question to prevent duplicates
      await prisma.submission.deleteMany({
        where: {
          assessmentId: session.assessmentId,
          candidateName: session.candidateName,
          questionId: draft.questionId,
        },
      });

      // Create submission record
      const submission = await prisma.submission.create({
        data: {
          assessmentId: session.assessmentId,
          questionId: draft.questionId,
          candidateName: session.candidateName,
          languageId: draft.languageId,
          languageName: draft.languageName,
          code: draft.code,
          status: 'grading',
        },
      });

      // Get ALL test cases
      const testCases = await prisma.testCase.findMany({
        where: { questionId: draft.questionId },
      });

      let passedCount = 0;
      const testCaseResults = [];

      for (const tc of testCases) {
        try {
          const result = await executeCode({
            sourceCode: draft.code,
            languageId: draft.languageId,
            stdin: tc.input,
            cpuTimeLimit: 5,
            memoryLimit: 256000,
          });

          const actualOutput = (result.stdout || '').trim();
          const expectedOutput = tc.expectedOutput.trim();
          const passed = result.status.id === 3 && actualOutput === expectedOutput;

          if (passed) passedCount++;

          const tcResult = await prisma.testCaseResult.create({
            data: {
              submissionId: submission.id,
              testCaseId: tc.id,
              passed,
              actualOutput: actualOutput || result.compile_output || result.stderr || '',
              statusDesc: result.status.description,
              executionTime: result.time ? parseFloat(result.time) : null,
              memoryUsed: result.memory,
            },
          });

          testCaseResults.push({
            ...tcResult,
            isSample: tc.isSample,
          });
        } catch (execError: any) {
          const tcResult = await prisma.testCaseResult.create({
            data: {
              submissionId: submission.id,
              testCaseId: tc.id,
              passed: false,
              actualOutput: execError.message || 'Execution error',
              statusDesc: 'Internal Error',
            },
          });

          testCaseResults.push({
            ...tcResult,
            isSample: tc.isSample,
          });
        }
      }

      // Update submission with final score
      const score = testCases.length > 0 ? (passedCount / testCases.length) * 100 : 0;
      const updatedSubmission = await prisma.submission.update({
        where: { id: submission.id },
        data: {
          status: 'graded',
          score,
        },
      });

      results.push({
        ...updatedSubmission,
        totalTestCases: testCases.length,
        passedTestCases: passedCount,
        testCaseResults,
      });
    }

    res.json({
      sessionId,
      assessmentId: session.assessmentId,
      candidateName: session.candidateName,
      finishedAt: new Date().toISOString(),
      submissions: results,
      overallScore:
        results.length > 0
          ? results.reduce((acc, r) => acc + r.score, 0) / results.length
          : 0,
    });
  } catch (error: any) {
    console.error('Error finishing session:', error);
    res.status(500).json({ error: 'Failed to finish session' });
  }
});

export default router;
