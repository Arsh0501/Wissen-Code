import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';
import { signToken } from '../middleware/auth';

const router = Router();

// GET /api/interview-sessions/validate/:token
// Validates an interview invite token and returns session details
router.get('/validate/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const session = await prisma.interviewSession.findUnique({
      where: { token },
      include: {
        snapshots: {
          orderBy: { submittedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found or invalid token' });
    }

    if (session.status === 'ended') {
      return res.status(410).json({ error: 'This interview has already ended', session });
    }

    // Generate JWT auth token for candidate to interact with judge/run APIs
    const authToken = signToken({
      id: session.id,
      email: `${session.candidateName.toLowerCase().replace(/\s+/g, '')}@interview.wissen`,
      name: session.candidateName,
      role: 'candidate',
    });

    res.json({
      valid: true,
      authToken,
      session: {
        id: session.id,
        token: session.token,
        candidateName: session.candidateName,
        candidateEmail: session.candidateEmail,
        interviewerName: session.interviewerName,
        meetingUrl: session.meetingUrl,
        status: session.status,
        durationMinutes: session.durationMinutes,
        currentQuestionId: session.currentQuestionId,
        startedAt: session.startedAt?.toISOString() || null,
        endedAt: session.endedAt?.toISOString() || null,
      },
    });
  } catch (error: any) {
    console.error('Error validating interview token:', error);
    res.status(500).json({ error: 'Failed to validate interview token' });
  }
});

// GET /api/interview-sessions/:sessionId/question/:questionId
// Returns question details, starter codes, and sample test cases for the interview room
router.get('/:sessionId/question/:questionId', async (req: Request, res: Response) => {
  try {
    const questionId = parseInt(req.params.questionId);
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        starterCodes: true,
        testCases: { where: { isSample: true } },
      },
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json(question);
  } catch (error: any) {
    console.error('Error fetching interview question:', error);
    res.status(500).json({ error: 'Failed to fetch interview question' });
  }
});

// GET /api/interview-sessions/available-questions
// List questions from question bank so interviewer can pick or search
router.get('/available-questions', async (_req: Request, res: Response) => {
  try {
    const questions = await prisma.question.findMany({
      select: {
        id: true,
        title: true,
        difficulty: true,
        tags: true,
        timeLimit: true,
        statement: true,
      },
      orderBy: { id: 'asc' },
    });
    res.json({ questions });
  } catch (error: any) {
    console.error('Error listing available questions:', error);
    res.status(500).json({ error: 'Failed to list questions' });
  }
});

// GET /api/interview-sessions/:sessionId/snapshots
// Retrieves code snapshots submitted by candidate for this interview
router.get('/:sessionId/snapshots', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const snapshots = await prisma.interviewSnapshot.findMany({
      where: { sessionId },
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ snapshots });
  } catch (error: any) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// POST /api/interview-sessions/:sessionId/end
// End interview session
router.post('/:sessionId/end', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const session = await prisma.interviewSession.update({
      where: { id: sessionId },
      data: { status: 'ended', endedAt: new Date() },
    });
    res.json({ session });
  } catch (error: any) {
    console.error('Error ending interview session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// POST /api/interview-sessions/:sessionId/start
// Marks interview session as active if currently waiting
router.post('/:sessionId/start', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'waiting') {
      const updated = await prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          status: 'active',
          startedAt: new Date(),
        },
      });
      return res.json({ session: updated });
    }

    res.json({ session });
  } catch (error: any) {
    console.error('Error starting interview session:', error);
    res.status(500).json({ error: 'Failed to start interview session' });
  }
});

// POST /api/interview-sessions/:sessionId/submit-code
// Snapshot and finalize candidate's code for a question (save without grading/scoring)
router.post('/:sessionId/submit-code', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const { questionId, language, sourceCode } = req.body;

    if (!questionId || !language || sourceCode === undefined) {
      return res.status(400).json({ error: 'questionId, language, and sourceCode are required' });
    }

    const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    const snapshot = await prisma.interviewSnapshot.create({
      data: {
        sessionId,
        questionId: Number(questionId),
        language: String(language),
        sourceCode: String(sourceCode),
      },
    });

    // Also update draft to keep in sync
    await prisma.interviewDraft.upsert({
      where: { sessionId_questionId: { sessionId, questionId: Number(questionId) } },
      create: {
        sessionId,
        questionId: Number(questionId),
        languageId: 0,
        languageName: String(language),
        code: String(sourceCode),
      },
      update: {
        languageName: String(language),
        code: String(sourceCode),
      },
    });

    res.json({
      success: true,
      message: 'Code snapshot saved successfully',
      snapshotId: snapshot.id,
      savedAt: snapshot.submittedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Error saving code snapshot:', error);
    res.status(500).json({ error: 'Failed to save code snapshot' });
  }
});

// POST /api/interview-sessions/:sessionId/draft
// Persists draft code for (sessionId, questionId)
router.post('/:sessionId/draft', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const { questionId, languageId, languageName, code } = req.body;

    if (!questionId || code === undefined) {
      return res.status(400).json({ error: 'questionId and code are required' });
    }

    const draft = await prisma.interviewDraft.upsert({
      where: { sessionId_questionId: { sessionId, questionId: Number(questionId) } },
      create: {
        sessionId,
        questionId: Number(questionId),
        languageId: Number(languageId) || 71,
        languageName: String(languageName || 'Python'),
        code: String(code),
      },
      update: {
        languageId: Number(languageId) || undefined,
        languageName: String(languageName) || undefined,
        code: String(code),
      },
    });

    res.json({ success: true, draft });
  } catch (error: any) {
    console.error('Error saving interview draft:', error);
    res.status(500).json({ error: 'Failed to save interview draft' });
  }
});

// GET /api/interview-sessions/:sessionId/draft/:questionId
// Retrieves persisted code draft for a question
router.get('/:sessionId/draft/:questionId', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const questionId = parseInt(req.params.questionId);

    const draft = await prisma.interviewDraft.findUnique({
      where: { sessionId_questionId: { sessionId, questionId } },
    });

    res.json({ draft: draft || null });
  } catch (error: any) {
    console.error('Error fetching interview draft:', error);
    res.status(500).json({ error: 'Failed to fetch interview draft' });
  }
});

// GET /api/interview-sessions
// List all interview sessions for admin management
router.get('/', async (_req: Request, res: Response) => {
  try {
    const sessions = await prisma.interviewSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            snapshots: true,
            drafts: true,
          },
        },
      },
    });
    res.json({ sessions });
  } catch (error: any) {
    console.error('Error fetching all interview sessions:', error);
    res.status(500).json({ error: 'Failed to fetch interview sessions' });
  }
});

// GET /api/interview-sessions/candidates
// Fetch candidate users from database so admin can select any candidate by email/name
router.get('/candidates', async (_req: Request, res: Response) => {
  try {
    const candidates = await prisma.user.findMany({
      where: { role: 'candidate' },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ candidates });
  } catch (error: any) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// POST /api/interview-sessions
// Create a new 1-on-1 interview session for a candidate
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      candidateName,
      candidateEmail,
      interviewerName,
      meetingUrl,
      durationMinutes,
      currentQuestionId,
    } = req.body;

    if (!candidateName || !candidateName.trim()) {
      return res.status(400).json({ error: 'Candidate name is required' });
    }

    if (!candidateEmail || !candidateEmail.trim()) {
      return res.status(400).json({ error: 'Candidate email is required' });
    }

    // Generate secure, unique URL-safe token
    const token = `wissen-${crypto.randomBytes(6).toString('hex')}`;

    const session = await prisma.interviewSession.create({
      data: {
        token,
        candidateName: candidateName.trim(),
        candidateEmail: candidateEmail.trim(),
        interviewerName: interviewerName?.trim() || 'Interviewer',
        meetingUrl: meetingUrl?.trim() || null,
        durationMinutes: Number(durationMinutes) || 60,
        currentQuestionId: currentQuestionId ? Number(currentQuestionId) : null,
        status: 'waiting',
      },
    });

    res.status(201).json({ success: true, session });
  } catch (error: any) {
    console.error('Error creating interview session:', error);
    res.status(500).json({ error: 'Failed to create interview session' });
  }
});

// PATCH /api/interview-sessions/:id
// Update session details (e.g., status, meetingUrl, questionId)
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const {
      candidateName,
      candidateEmail,
      interviewerName,
      meetingUrl,
      durationMinutes,
      currentQuestionId,
      status,
    } = req.body;

    const session = await prisma.interviewSession.update({
      where: { id },
      data: {
        ...(candidateName ? { candidateName: candidateName.trim() } : {}),
        ...(candidateEmail ? { candidateEmail: candidateEmail.trim() } : {}),
        ...(interviewerName ? { interviewerName: interviewerName.trim() } : {}),
        ...(meetingUrl !== undefined ? { meetingUrl: meetingUrl ? meetingUrl.trim() : null } : {}),
        ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
        ...(currentQuestionId !== undefined ? { currentQuestionId: currentQuestionId ? Number(currentQuestionId) : null } : {}),
        ...(status ? { status } : {}),
      },
    });

    res.json({ success: true, session });
  } catch (error: any) {
    console.error('Error updating interview session:', error);
    res.status(500).json({ error: 'Failed to update interview session' });
  }
});

// DELETE /api/interview-sessions/:id
// Delete an interview session
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.interviewSession.delete({
      where: { id },
    });
    res.json({ success: true, message: 'Interview session deleted' });
  } catch (error: any) {
    console.error('Error deleting interview session:', error);
    res.status(500).json({ error: 'Failed to delete interview session' });
  }
});

export default router;
