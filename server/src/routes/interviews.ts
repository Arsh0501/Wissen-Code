import { candidatePayload } from '../platform/questions';
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';
import { adminOnly, adminOrInterviewer } from '../middleware/adminOnly';
import { executeCode, Judge0Result } from '../services/judge0';
import { getIO } from '../socket';
import {
  getInterviewRoom,
  flushCodeToDb,
  recordInterviewEvent,
} from '../socket/interview-handler';
import { INTERVIEW_EVENTS } from '../socket/types';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { enforceInterviewDeadlines } from '../services/interview-expiry';
import { questionNoteData } from '../services/question-feedback';
import { candidateRoomState } from '../services/candidate-room-state';
import { WorkflowError } from '../services/structured-ai';
import { criteriaFeedbackSchema, finalInterviewFeedbackSchema } from '../services/interview-feedback';
import { feedbackReportMetadata, generateInterviewFeedbackReport } from '../services/interview-feedback-report';
import interviewFollowUpRoutes from './interview-follow-ups';
import interviewTranscriptRoutes from './interview-transcript';
import interviewConversationRoutes from './interview-conversation';

const router = Router();

function schedulingAdminOnly(req: Request, res: Response, next: NextFunction) {
  if ((req.user?.accessRole ?? req.user?.role) !== 'admin') {
    return res.status(403).json({ error: 'Only admins can modify or cancel scheduled interviews.' });
  }
  next();
}

// GET /api/interviews/my-interviews — Retrieve interviews assigned to the authenticated candidate
router.get('/my-interviews', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const candidateId = req.user.id;
    const candidateEmail = req.user.email?.toLowerCase();
    await enforceInterviewDeadlines({ OR: [{ candidateId }, ...(candidateEmail ? [{ candidateEmail: { equals: candidateEmail, mode: 'insensitive' as const } }] : [])] });

    // Passively associate any interviews scheduled by email before registration
    if (candidateEmail) {
      await prisma.interview.updateMany({
        where: {
          candidateEmail: { equals: candidateEmail, mode: 'insensitive' },
          candidateId: null,
        },
        data: { candidateId },
      });
    }

    const interviews = await prisma.interview.findMany({
      where: {
        OR: [
          { candidateId },
          ...(candidateEmail
            ? [{ candidateEmail: { equals: candidateEmail, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      orderBy: [
        { scheduledAt: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        interviewer: { select: { id: true, name: true, email: true } },
        _count: { select: { questions: true } },
      },
    });

    const sanitized = interviews.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      status: i.status,
      scheduledAt: i.scheduledAt,
      startedAt: i.startedAt,
      endedAt: i.endedAt,
      timeLimitMinutes: i.timeLimitMinutes,
      extendedMinutes: i.extendedMinutes,
      roomToken: i.roomToken,
      candidateJoinUrl: `/interview/${i.roomToken}`,
      interviewer: {
        name: i.interviewer.name,
        email: i.interviewer.email,
      },
      questionCount: i._count?.questions ?? 0,
      createdAt: i.createdAt,
    }));

    res.json(sanitized);
  } catch (error: any) {
    console.error('Error fetching candidate interviews:', error);
    res.status(500).json({ error: 'Failed to fetch candidate interviews' });
  }
});

router.use('/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: 'Invalid interview ID' });
  try {
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { interviewerId: true, candidateId: true, status: true },
    });
    if (!interview)
      return res.status(404).json({ error: 'Interview not found' });
    
    const role = req.user?.accessRole ?? req.user?.role;
    const userId = req.user?.id;
    const isAllowed =
      role === 'admin' ||
      (role === 'interviewer' && interview.interviewerId === userId) ||
      (role === 'candidate' && interview.candidateId === userId);

    if (!isAllowed) {
      return res
        .status(403)
        .json({ error: 'You are not assigned to this interview' });
    }
    await enforceInterviewDeadlines({ id });
    const state = await prisma.interview.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (['POST', 'PUT', 'DELETE'].includes(req.method) &&
      /\/(questions(?:\/\d+)?)$/.test(req.originalUrl.split('?')[0].replace(/\/+$/, '')) &&
      !['scheduled', 'in_progress'].includes(state.status)) {
      return res.status(409).json({ error: 'Question preparation is disabled because this interview has ended.' });
    }

    if (
      ['POST', 'PUT'].includes(req.method) &&
      /\/(execute|submit|current-question)$/.test(
        req.originalUrl.split('?')[0],
      ) &&
      state.status !== 'in_progress'
    )
      return res.status(409).json({ error: 'This interview is not active' });
    next();
  } catch (error) {
    next(error);
  }
});

router.use('/:id/questions/:questionId/follow-ups', interviewFollowUpRoutes);
router.use('/:id/questions/:questionId/transcript', interviewTranscriptRoutes);
router.use('/:id/questions/:questionId/conversation', interviewConversationRoutes);

// Helper to broadcast socket event if Socket.IO is initialized
function broadcastToInterviewRoom(
  interviewId: number,
  event: string,
  payload: any,
) {
  try {
    const io = getIO();
    const room = getInterviewRoom(interviewId);
    io.to(room).emit(event, payload);
  } catch {
    // Socket server may not have connected clients or uninitialized in test
  }
}

// 1. PUBLIC: GET /api/interviews/room/:roomToken
router.get('/:id/events', adminOrInterviewer, async (req, res, next) => {
  try {
    const events = await prisma.interviewEvent.findMany({ where: { interviewId: Number(req.params.id) }, orderBy: { id: 'desc' }, take: 100,
      select: { id: true, interviewId: true, eventType: true, actorRole: true, createdAt: true } });
    res.json(events);
  } catch (error) { next(error); }
});

async function notifyQuestionListChanged(id: number, previousActiveId: number | null, eventType: string) {
  const interview = await prisma.interview.findUniqueOrThrow({ where: { id }, select: { status: true, interviewerId: true, currentQuestionId: true, currentCode: true, currentLanguageId: true, codeRevision: true } });
  const question = interview.currentQuestionId ? await prisma.question.findUnique({ where: { id: interview.currentQuestionId }, include: { starterCodes: true, testCases: { where: { isSample: true } } } }) : null;
  const link = interview.currentQuestionId ? await prisma.interviewQuestion.findUnique({ where: { interviewId_questionId: { interviewId: id, questionId: interview.currentQuestionId } } }) : null;
  const payload = { questionId: interview.currentQuestionId, question: candidatePayload(question), code: interview.currentCode, languageId: interview.currentLanguageId, codeRevision: interview.codeRevision, candidateAnswer: link?.candidateAnswer ?? '' };
  if (interview.status === 'in_progress') {
    if (previousActiveId !== interview.currentQuestionId) broadcastToInterviewRoom(id, INTERVIEW_EVENTS.QUESTION_CHANGED, payload);
    broadcastToInterviewRoom(id, 'QUESTIONS_UPDATED', payload);
  } else {
    try { getIO().to(`private:interview:${id}:user:${interview.interviewerId}`).emit('QUESTIONS_UPDATED', payload); } catch {}
  }
  await recordInterviewEvent(id, eventType, 'interviewer', { activeQuestionId: interview.currentQuestionId });
}

// Candidate room resolver (no JWT required; protected by roomToken)
export const handleJoinRoom = async (req: Request, res: Response) => {
  try {
    const { roomToken } = req.params;
    if (!roomToken) {
      return res.status(400).json({ error: 'roomToken is required' });
    }
    await enforceInterviewDeadlines({ roomToken });

    const interview = await prisma.interview.findUnique({
      where: { roomToken },
      include: {
        interviewer: { select: { id: true, name: true, email: true } },
        currentQuestion: {
          include: {
            starterCodes: true,
            testCases: { where: { isSample: true } },
            _count: { select: { testCases: true } },
          },
        },
        questions: {
          include: {
            question: {
              select: { id: true, title: true, difficulty: true, tags: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!interview) {
      return res
        .status(404)
        .json({ error: 'Interview room not found or token has expired' });
    }
    if (interview.status === 'cancelled') {
      return res.status(410).json({ error: 'This interview has been cancelled.' });
    }
    if (interview.status === 'expired') {
      return res.status(410).json({ error: 'This interview has ended. The scheduled duration passed without the interviewer starting it.' });
    }

    // Return sanitized candidate-safe payload
    res.json(candidateRoomState({
      id: interview.id,
      title: interview.title,
      description: interview.description,
      status: interview.status,
      candidateName: interview.candidateName,
      candidateEmail: interview.candidateEmail,
      roomToken: interview.roomToken,
      scheduledAt: interview.scheduledAt,
      startedAt: interview.startedAt,
      endedAt: interview.endedAt,
      timeLimitMinutes: interview.timeLimitMinutes,
      currentQuestionId: interview.currentQuestionId,
      currentQuestion: candidatePayload(interview.currentQuestion),
      currentCandidateAnswer:
        interview.questions.find(
          (q) => q.questionId === interview.currentQuestionId,
        )?.candidateAnswer || '',
      currentCode: interview.currentCode,
      codeRevision: interview.codeRevision,
      currentLanguageId: interview.currentLanguageId,
      questions: interview.questions.map(({ notes: _notes, referenceAnswer: _answer, ...question }) => question),
      interviewer: {
        name: interview.interviewer.name,
      },
    }));
  } catch (error: any) {
    console.error('Error resolving interview room:', error);
    res.status(500).json({ error: 'Failed to resolve interview room' });
  }
};

export const handleSaveRoomAnswer = async (req: Request, res: Response) => {
  try {
    const interview = await prisma.interview.findUnique({
      where: { roomToken: req.params.roomToken },
    });
    if (!interview || interview.status !== 'in_progress')
      return res
        .status(403)
        .json({ error: 'Interview is not accepting answers' });
    if (
      Number(req.body.questionId) !== interview.currentQuestionId ||
      typeof req.body.answer !== 'string' ||
      req.body.answer.length > 100000
    )
      return res
        .status(400)
        .json({ error: 'Provide an answer to the active question' });
    await prisma.interviewQuestion.update({
      where: {
        interviewId_questionId: {
          interviewId: interview.id,
          questionId: interview.currentQuestionId!,
        },
      },
      data: { candidateAnswer: req.body.answer },
    });
    await recordInterviewEvent(interview.id, 'ANSWER_UPDATED', 'candidate', { questionId: interview.currentQuestionId });
    res.json({ saved: true });
  } catch {
    res.status(500).json({ error: 'Could not save candidate answer' });
  }
};

// 2. POST /api/interviews — Create a new interview
router.post('/', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    // PostgreSQL text columns cannot store NUL characters, including those in pasted resumes.
    const input = { ...req.body };
    for (const field of ['title', 'description', 'candidateName', 'candidateEmail', 'candidateResume', 'candidateResumeUrl']) {
      if (typeof input[field] === 'string') input[field] = input[field].replace(/\u0000/g, '');
    }
    const {
      title,
      description,
      candidateName,
      candidateEmail,
      candidateId: rawCandidateId,
      interviewerId: rawInterviewerId,
      candidateResume,
      candidateResumeUrl,
      scheduledAt,
      timeLimitMinutes,
      questionIds,
      currentLanguageId = 71,
    } = input;

    if (candidateResumeUrl) {
      if (typeof candidateResumeUrl !== 'string' || !/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(candidateResumeUrl)) {
        return res.status(400).json({ error: 'Upload a valid PDF resume.' });
      }
      const pdf = Buffer.from(candidateResumeUrl.split(',')[1], 'base64');
      if (pdf.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'PDF resumes must be 5 MB or smaller.' });
      }
      if (pdf.subarray(0, 5).toString() !== '%PDF-' || !pdf.subarray(-1024).includes(Buffer.from('%%EOF'))) {
        return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
      }
    }

    if (typeof title !== 'string' || typeof candidateName !== 'string' || typeof candidateEmail !== 'string' || !title.trim() || !candidateName.trim() || !candidateEmail.trim()) {
      return res.status(400).json({
        error: 'title, candidateName, and candidateEmail are required',
      });
    }

    if (
      !Number.isInteger(Number(timeLimitMinutes)) ||
      Number(timeLimitMinutes) < 5 ||
      Number(timeLimitMinutes) > 240 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)
    )
      return res
        .status(400)
        .json({ error: 'Provide a valid email and duration of 5–240 minutes' });

    if ((req.user?.accessRole ?? req.user?.role) === 'admin' && !rawInterviewerId) {
      return res.status(400).json({ error: 'Select an interviewer so the interview appears on their dashboard.' });
    }

    // Resolve interviewer: if provided, validate role is not candidate
    let interviewerId = req.user!.id;
    if (rawInterviewerId) {
      const assignedInterviewer = await prisma.user.findUnique({
        where: { id: Number(rawInterviewerId) },
        select: { id: true, role: true, name: true, email: true },
      });
      if (!assignedInterviewer) {
        return res.status(400).json({ error: 'Selected interviewer does not exist' });
      }
      if (assignedInterviewer.role === 'candidate') {
        return res.status(400).json({
          error: 'Interviewer cannot have candidate role. Selected user must be an interviewer or admin.',
        });
      }
      interviewerId = assignedInterviewer.id;
    }

    // Resolve candidate: if candidateId provided, validate role is candidate
    let candidateId: number | null = null;
    if (rawCandidateId) {
      const assignedCandidate = await prisma.user.findUnique({
        where: { id: Number(rawCandidateId) },
        select: { id: true, role: true, name: true, email: true },
      });
      if (!assignedCandidate) {
        return res.status(400).json({ error: 'Selected candidate does not exist' });
      }
      if (assignedCandidate.role !== 'candidate') {
        return res.status(400).json({
          error: 'Selected candidate must have candidate role.',
        });
      }
      candidateId = assignedCandidate.id;
    } else {
      const registeredCandidate = await prisma.user.findFirst({
        where: { email: { equals: candidateEmail.trim(), mode: 'insensitive' }, role: 'candidate' },
        select: { id: true },
      });
      candidateId = registeredCandidate?.id ?? null;
    }

    const roomToken = crypto.randomBytes(16).toString('hex');

    // Parse and validate questions if provided
    const ids: number[] = Array.isArray(questionIds)
      ? questionIds.map(Number).filter((n) => !isNaN(n) && n > 0)
      : [];

    let firstQuestionId: number | null = null;
    let starterCode = '';
    let initialLanguageId = Number(currentLanguageId) || 71;

    if (ids.length > 0) {
      const existingQuestions = await prisma.question.findMany({
        where: { id: { in: ids }, ownerInterviewId: null },
        include: { starterCodes: true },
      });

      const existingIdsSet = new Set(existingQuestions.map((q) => q.id));
      const invalidIds = ids.filter((id) => !existingIdsSet.has(id));

      if (invalidIds.length > 0) {
        return res.status(400).json({
          error: `Question ID(s) not found: [${invalidIds.join(', ')}]. Please provide valid IDs from the question bank.`,
        });
      }

      const firstQ =
        existingQuestions.find((q) => q.id === ids[0]) || existingQuestions[0];
      firstQuestionId = firstQ.id;
      if (firstQ.questionType === 'sql') initialLanguageId = 82;
      const sc = firstQ.starterCodes.find(
        (s) => s.languageId === initialLanguageId,
      );
      starterCode = sc ? sc.code : '';
    } else if (req.body.currentQuestionId) {
      const checkQ = await prisma.question.findUnique({
        where: { id: Number(req.body.currentQuestionId), ownerInterviewId: null },
        include: { starterCodes: true },
      });
      if (!checkQ) {
        return res.status(400).json({
          error: `Question with ID ${req.body.currentQuestionId} does not exist in the question bank.`,
        });
      }
      firstQuestionId = checkQ.id;
      if (checkQ.questionType === 'sql') initialLanguageId = 82;
      ids.push(checkQ.id);
      const sc = checkQ.starterCodes.find(
        (s) => s.languageId === initialLanguageId,
      );
      starterCode = sc ? sc.code : '';
    }

    const interview = await prisma.interview.create({
      data: {
        title: title.trim(),
        description: description ? String(description) : '',
        interviewerId,
        candidateName: candidateName.trim(),
        candidateEmail: candidateEmail.trim().toLowerCase(),
        candidateId,
        candidateResume: candidateResume ? String(candidateResume).trim() : null,
        candidateResumeUrl: candidateResumeUrl ? String(candidateResumeUrl).trim() : null,
        roomToken,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : 60,
        currentLanguageId: initialLanguageId,
        currentQuestionId: firstQuestionId,
        currentCode: starterCode,
        codeRevision: 0,
        questions:
          ids.length > 0
            ? {
                create: ids.map((qId, index) => ({
                  questionId: qId,
                  orderIndex: index,
                  status: index === 0 ? 'active' : 'pending',
                })),
              }
            : undefined,
      },
      include: {
        interviewer: { select: { id: true, name: true, email: true, role: true } },
        candidate: { select: { id: true, name: true, email: true, role: true } },
        questions: {
          include: {
            question: { select: { id: true, title: true, difficulty: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    res.status(201).json({
      success: true,
      interview: { ...interview, candidateResumeUrl: interview.candidateResumeUrl ? `/api/interviews/${interview.id}/resume` : null },
      candidateJoinUrl: `/interview/${interview.roomToken}`,
    });
  } catch (error: any) {
    console.error('Error creating interview:', error);
    if (error.code === 'P2003') {
      return res.status(400).json({
        error:
          'Foreign key constraint violated: referenced questionId or interviewerId does not exist in the database.',
      });
    }
    res
      .status(500)
      .json({ error: error.message || 'Failed to create interview' });
  }
});

// 3. GET /api/interviews — List interviews (for interviewers/admins)
router.get('/', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.accessRole ?? req.user?.role;
    const userId = req.user!.id;

    // Admin sees all interviews; Interviewer sees their assigned interviews
    const where = userRole === 'admin' ? {} : { interviewerId: userId };
    await enforceInterviewDeadlines(where);

    const interviews = await prisma.interview.findMany({
      where,
      orderBy: [
        { scheduledAt: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        interviewer: { select: { id: true, name: true, email: true, role: true } },
        candidate: { select: { id: true, name: true, email: true } },
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { question: { select: { id: true, title: true, statement: true, difficulty: true, tags: true, questionType: true } } },
        },
        _count: {
          select: {
            questions: true,
            submissions: true,
            notes: true,
            sessions: true,
          },
        },
      },
    });

    res.json(interviews.map((interview) => ({
      ...interview,
      candidateResumeUrl: interview.candidateResumeUrl ? `/api/interviews/${interview.id}/resume` : null,
    })));
  } catch (error: any) {
    console.error('Error listing interviews:', error);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// 4. GET /api/interviews/:id — Full interview details
router.put('/:id', schedulingAdminOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.interview.findUniqueOrThrow({ where: { id } });
    if (current.status !== 'scheduled') {
      return res.status(409).json({ error: 'Only scheduled interviews can be modified.' });
    }
    const input = { ...req.body };
    for (const field of ['title', 'candidateName', 'candidateEmail']) {
      if (typeof input[field] === 'string') input[field] = input[field].replace(/\u0000/g, '').trim();
    }
    const title = input.title ?? current.title;
    const candidateName = input.candidateName ?? current.candidateName;
    const candidateEmail = input.candidateEmail ?? current.candidateEmail;
    const timeLimitMinutes = input.timeLimitMinutes ?? current.timeLimitMinutes;
    const interviewerId = input.interviewerId ?? current.interviewerId;
    if (input.scheduledAt !== undefined && input.scheduledAt !== null && typeof input.scheduledAt !== 'string') {
      return res.status(400).json({ error: 'Provide a valid scheduled time.' });
    }
    const scheduledAt = input.scheduledAt === undefined ? current.scheduledAt
      : input.scheduledAt === null ? null : new Date(input.scheduledAt);
    if (typeof title !== 'string' || !title || typeof candidateName !== 'string' || !candidateName ||
      typeof candidateEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail) ||
      !Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 5 || timeLimitMinutes > 240 ||
      !Number.isInteger(interviewerId) || interviewerId < 1 ||
      (scheduledAt && !Number.isFinite(scheduledAt.getTime()))) {
      return res.status(400).json({ error: 'Provide a title, candidate name, valid email, interviewer, date, and duration of 5–240 minutes.' });
    }
    const interviewer = await prisma.user.findUnique({ where: { id: interviewerId }, select: { role: true } });
    if (!interviewer || !['admin', 'interviewer'].includes(interviewer.role)) {
      return res.status(400).json({ error: 'Select a valid interviewer.' });
    }
    const candidate = await prisma.user.findFirst({
      where: { email: { equals: candidateEmail, mode: 'insensitive' }, role: 'candidate' },
      select: { id: true },
    });
    // The status condition also prevents edits if the interviewer starts while the form is open.
    const result = await prisma.interview.updateMany({
      where: { id, status: 'scheduled' },
      data: { title, candidateName, candidateEmail: candidateEmail.toLowerCase(),
        candidateId: candidate?.id ?? null, interviewerId, scheduledAt, timeLimitMinutes },
    });
    if (!result.count) return res.status(409).json({ error: 'Only scheduled interviews can be modified.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error modifying scheduled interview:', error);
    res.status(500).json({ error: 'Could not modify the interview.' });
  }
});

router.post('/:id/cancel', schedulingAdminOnly, async (req: Request, res: Response) => {
  try {
    const result = await prisma.interview.updateMany({
      where: { id: Number(req.params.id), status: 'scheduled' },
      data: { status: 'cancelled' },
    });
    if (!result.count) return res.status(409).json({ error: 'Only scheduled interviews can be cancelled.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling scheduled interview:', error);
    res.status(500).json({ error: 'Could not cancel the interview.' });
  }
});

router.get('/:id/resume', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const interview = await prisma.interview.findUnique({
      where: { id: Number(req.params.id) }, select: { candidateResumeUrl: true },
    });
    if (!interview?.candidateResumeUrl?.startsWith('data:application/pdf;base64,')) {
      return res.status(404).json({ error: 'No PDF resume attached.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="candidate-resume.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(interview.candidateResumeUrl.split(',')[1], 'base64'));
  } catch {
    res.status(500).json({ error: 'Could not load the PDF resume.' });
  }
});

router.get('/:id', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id))
      return res.status(400).json({ error: 'Invalid interview ID' });

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        interviewer: { select: { id: true, name: true, email: true, role: true } },
        candidate: { select: { id: true, name: true, email: true, role: true } },
        currentQuestion: {
          include: { starterCodes: true, testCases: true },
        },
        questions: {
          include: {
            question: {
              include: { starterCodes: true, testCases: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        submissions: {
          orderBy: { createdAt: 'desc' },
          include: { question: { select: { id: true, title: true } } },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, name: true } } },
        },
        sessions: {
          orderBy: { connectedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    res.json({ ...interview, candidateResumeUrl: interview.candidateResumeUrl ? `/api/interviews/${interview.id}/resume` : null });
  } catch (error: any) {
    console.error('Error fetching interview:', error);
    res.status(500).json({ error: 'Failed to fetch interview' });
  }
});

// 5. POST /api/interviews/:id/start — Start the interview
router.post('/:id/start', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const current = await prisma.interview.findUnique({ where: { id } });
    if (!current) {
      return res.status(404).json({ error: 'Interview not found' });
    }
    if (current.status !== 'scheduled') {
      return res
        .status(409)
        .json({ error: 'Only scheduled interviews can be started' });
    }

    // Schedule window enforcement
    if (current.scheduledAt) {
      const now = Date.now();
      const scheduledTime = new Date(current.scheduledAt).getTime();
      const earliestStart = scheduledTime - 15 * 60 * 1000; // 15 mins before
      const latestStart = scheduledTime + current.timeLimitMinutes * 60 * 1000;

      if (now < earliestStart) {
        const waitMinutes = Math.ceil((earliestStart - now) / 60000);
        return res.status(400).json({
          error: `Interview cannot be started yet. Scheduled for ${new Date(current.scheduledAt).toLocaleString()}. You can start it up to 15 minutes before the scheduled time (available in ${waitMinutes} min).`,
        });
      }

      if (now >= latestStart) {
        return res.status(400).json({
          error: `Scheduled interview window has passed. It was scheduled for ${new Date(current.scheduledAt).toLocaleString()}. Please reschedule the interview to proceed.`,
        });
      }
    }

    const transition = await prisma.interview.updateMany({
      where: { id, status: 'scheduled' },
      data: { status: 'in_progress', startedAt: new Date() },
    });
    if (!transition.count)
      return res
        .status(409)
        .json({ error: 'Only scheduled interviews can be started' });
    const updated = await prisma.interview.findUniqueOrThrow({ where: { id } });
    const startedAt = updated.startedAt!;

    await recordInterviewEvent(
      id,
      INTERVIEW_EVENTS.INTERVIEW_STARTED,
      'interviewer',
      {
        startedAt: startedAt.toISOString(),
        code: updated.currentCode,
        languageId: updated.currentLanguageId,
        questionId: updated.currentQuestionId,
      },
    );

    broadcastToInterviewRoom(id, INTERVIEW_EVENTS.INTERVIEW_STARTED, {
      startedAt: startedAt.toISOString(),
      timeLimitMinutes: updated.timeLimitMinutes,
    });

    res.json({ success: true, interview: updated });
  } catch (error: any) {
    console.error('Error starting interview:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// 6. POST /api/interviews/:id/end — End the interview
router.post('/:id/end', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await flushCodeToDb(id);

    const current = await prisma.interview.findUniqueOrThrow({ where: { id } });
    if (current.status !== 'in_progress')
      return res
        .status(409)
        .json({ error: 'Only active interviews can be ended' });
    const endedAt = new Date();
    const transition = await prisma.interview.updateMany({
      where: { id, status: 'in_progress' },
      data: { status: 'completed', endedAt },
    });
    if (!transition.count)
      return res.status(409).json({ error: 'Interview already ended' });
    const interview = await prisma.interview.findUniqueOrThrow({
      where: { id },
    });
    await recordInterviewEvent(
      id,
      INTERVIEW_EVENTS.INTERVIEW_ENDED,
      'interviewer',
      { endedAt: endedAt.toISOString() },
    );

    broadcastToInterviewRoom(id, INTERVIEW_EVENTS.INTERVIEW_ENDED, {
      endedAt: endedAt.toISOString(),
    });

    res.json({ success: true, interview });
  } catch (error: any) {
    console.error('Error ending interview:', error);
    res.status(500).json({ error: 'Failed to end interview' });
  }
});

// 7. PUT /api/interviews/:id/current-question — Change active question
router.put(
  '/:id/current-question',
  adminOrInterviewer,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { questionId } = req.body;

      if (!questionId)
        return res.status(400).json({ error: 'questionId is required' });

      const question = await prisma.question.findUnique({
        where: { id: Number(questionId) },
        include: {
          starterCodes: true,
          testCases: { where: { isSample: true } },
        },
      });

      if (!question)
        return res.status(404).json({ error: 'Question not found' });

      const interview = await prisma.interview.findUnique({
        where: { id },
        select: { currentLanguageId: true },
      });

      if (
        !(await prisma.interviewQuestion.findUnique({
          where: {
            interviewId_questionId: {
              interviewId: id,
              questionId: Number(questionId),
            },
          },
        }))
      )
        return res
          .status(400)
          .json({ error: 'Choose a question assigned to this interview' });
      const langId =
        question.questionType === 'sql'
          ? 82
          : interview?.currentLanguageId === 82
            ? 71
            : interview?.currentLanguageId || 71;
      const starter = question.starterCodes.find(
        (sc) => sc.languageId === langId,
      );
      const starterCode = starter ? starter.code : '';

      await prisma.interviewQuestion.updateMany({
        where: { interviewId: id, status: 'active' },
        data: { status: 'pending' },
      });

      await prisma.interviewQuestion.updateMany({
        where: { interviewId: id, questionId: question.id, status: { in: ['pending', 'active'] } },
        data: { status: 'active' },
      });

      const updated = await prisma.interview.update({
        where: { id },
        data: {
          currentQuestionId: question.id,
          currentCode: starterCode,
          currentLanguageId: langId,
          codeRevision: { increment: 1 },
        },
      });

      await recordInterviewEvent(
        id,
        INTERVIEW_EVENTS.QUESTION_CHANGED,
        'interviewer',
        {
          questionId: question.id,
          questionTitle: question.title,
          code: starterCode,
          languageId: langId,
        },
      );
      broadcastToInterviewRoom(id, INTERVIEW_EVENTS.QUESTION_CHANGED, {
        questionId: question.id,
        question: candidatePayload(question),
        starterCode,
        languageId: langId,
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, interview: updated, question, starterCode });
    } catch (error: any) {
      console.error('Error changing current question:', error);
      res.status(500).json({ error: 'Failed to change question' });
    }
  },
);

// 8. POST /api/interviews/:id/execute — Run code via Judge0
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { code, languageId, stdin } = req.body;

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { currentQuestion: { include: { testCases: true } } },
    });

    if (!interview)
      return res.status(404).json({ error: 'Interview not found' });

    if (
      ['mcq', 'written', 'project'].includes(
        interview.currentQuestion?.questionType ?? '',
      )
    )
      return res
        .status(400)
        .json({
          error:
            'Use the candidate answer and human evaluation for this question format',
        });
    const sourceCode = code || interview.currentCode;
    const langId =
      interview.currentQuestion?.questionType === 'sql'
        ? 82
        : languageId || interview.currentLanguageId;
    const input = stdin || interview.currentQuestion?.testCases[0]?.input || '';
    const expected =
      interview.currentQuestion?.testCases[0]?.expectedOutput || undefined;

    const result: Judge0Result = await executeCode({
      sourceCode:
        interview.currentQuestion?.questionType === 'sql'
          ? `${input}\n${sourceCode}`
          : sourceCode,
      languageId: langId,
      stdin: interview.currentQuestion?.questionType === 'sql' ? '' : input,
      expectedOutput: expected,
      cpuTimeLimit: interview.currentQuestion?.timeLimit || 2,
      memoryLimit: interview.currentQuestion?.memoryLimit || 256000,
    });

    await recordInterviewEvent(
      id,
      INTERVIEW_EVENTS.CODE_EXECUTED,
      req.user?.role === 'admin' ? 'interviewer' : 'candidate',
      {
        status: result.status.description,
        time: result.time,
        code: sourceCode,
        languageId: langId,
      },
    );
    broadcastToInterviewRoom(id, INTERVIEW_EVENTS.CODE_EXECUTED, {
      result,
      triggeredBy: req.user?.name || 'API',
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Error executing interview code:', error);
    res.status(500).json({ error: 'Code execution failed' });
  }
});

// 9. POST /api/interviews/:id/submit — Grade and record submission
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { code, languageId, questionId } = req.body;

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: {
        currentQuestionId: true,
        currentCode: true,
        currentLanguageId: true,
      },
    });

    if (!interview)
      return res.status(404).json({ error: 'Interview not found' });

    const targetQId = questionId || interview.currentQuestionId;
    if (targetQId !== interview.currentQuestionId)
      return res
        .status(400)
        .json({ error: 'Only the active interview question can be submitted' });
    if (!targetQId)
      return res
        .status(400)
        .json({ error: 'No active question for submission' });

    const question = await prisma.question.findUnique({
      where: { id: targetQId },
      include: { testCases: true },
    });

    if (!question) return res.status(404).json({ error: 'Question not found' });

    const sourceCode = code || interview.currentCode;
    const langId = languageId || interview.currentLanguageId;
    const role = req.user?.role === 'admin' ? 'interviewer' : 'candidate';

    if (['mcq', 'written', 'project'].includes(question.questionType))
      return res
        .status(400)
        .json({ error: 'This question requires human evaluation' });
    let infrastructureFailed = false;
    let passedCount = 0;
    const testCaseResults = [];

    for (const tc of question.testCases) {
      try {
        const resGraded = await executeCode({
          sourceCode:
            question.questionType === 'sql'
              ? `${tc.input}\n${sourceCode}`
              : sourceCode,
          languageId: question.questionType === 'sql' ? 82 : langId,
          stdin: question.questionType === 'sql' ? '' : tc.input,
          expectedOutput: tc.expectedOutput,
          cpuTimeLimit: question.timeLimit,
          memoryLimit: question.memoryLimit,
        });

        const actual = (resGraded.stdout || '').trim();
        const passed =
          resGraded.status.id === 3 && actual === tc.expectedOutput.trim();
        if (passed) passedCount++;

        testCaseResults.push({
          testCaseId: tc.id,
          isSample: tc.isSample,
          passed,
          statusDesc: passed
            ? 'Accepted'
            : resGraded.status.id === 3
              ? 'Wrong Answer'
              : resGraded.status.description,
          executionTime: resGraded.time ? parseFloat(resGraded.time) : null,
        });
      } catch {
        infrastructureFailed = true;
        testCaseResults.push({
          testCaseId: tc.id,
          isSample: tc.isSample,
          passed: false,
          statusDesc: 'Execution Error',
        });
      }
    }

    const score =
      question.testCases.length > 0
        ? (passedCount / question.testCases.length) * 100
        : 0;

    const submission = await prisma.interviewSubmission.create({
      data: {
        interviewId: id,
        questionId: targetQId,
        submittedBy: role,
        languageId: langId,
        languageName: `Language ${langId}`,
        code: sourceCode,
        score,
        status: infrastructureFailed ? 'execution_failed' : 'graded',
        results: JSON.stringify(testCaseResults),
      },
    });

    if (infrastructureFailed)
      return res
        .status(503)
        .json({
          error:
            'Execution provider unavailable. Your code was saved; retry grading when the service recovers.',
          submissionId: submission.id,
        });
    await prisma.interviewQuestion.updateMany({
      where: { interviewId: id, questionId: targetQId },
      data: { status: 'completed' },
    });

    await recordInterviewEvent(id, INTERVIEW_EVENTS.CODE_SUBMITTED, role, {
      submissionId: submission.id,
      score,
      questionId: targetQId,
      code: sourceCode,
      languageId: langId,
    });
    broadcastToInterviewRoom(id, INTERVIEW_EVENTS.CODE_SUBMITTED, {
      submissionId: submission.id,
      questionId: targetQId,
      score,
      passedCount,
      totalCount: question.testCases.length,
      results: testCaseResults,
      submittedBy: req.user?.name || role,
    });

    res.json({
      success: true,
      submission,
      score,
      passedCount,
      totalCount: question.testCases.length,
      results: testCaseResults,
    });
  } catch (error: any) {
    console.error('Error submitting interview code:', error);
    res.status(500).json({ error: 'Code submission failed' });
  }
});

// 10. POST /api/interviews/:id/extend — Extend duration when ongoing
router.post('/:id/extend', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const extensionMinutes = Math.min(Math.max(Number(req.body.extensionMinutes) || 15, 5), 60);

    const current = await prisma.interview.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Interview not found' });
    if (current.status !== 'in_progress') {
      return res.status(409).json({
        error: 'Duration can only be extended while interview is in progress',
      });
    }

    const extended = await prisma.interview.updateMany({
      where: { id, status: 'in_progress', timeLimitMinutes: current.timeLimitMinutes, startedAt: current.startedAt },
      data: {
        timeLimitMinutes: { increment: extensionMinutes },
        extendedMinutes: { increment: extensionMinutes },
      },
    });
    if (!extended.count) return res.status(409).json({ error: 'The interview ended or changed. Refresh before extending it.' });
    const updated = await prisma.interview.findUniqueOrThrow({ where: { id } });

    await recordInterviewEvent(
      id,
      'INTERVIEW_EXTENDED',
      'interviewer',
      {
        addedMinutes: extensionMinutes,
        newTotalMinutes: updated.timeLimitMinutes,
        extendedMinutes: updated.extendedMinutes,
      },
    );

    broadcastToInterviewRoom(id, 'INTERVIEW_EXTENDED', {
      addedMinutes: extensionMinutes,
      newTimeLimitMinutes: updated.timeLimitMinutes,
      extendedMinutes: updated.extendedMinutes,
    });

    res.json({ success: true, interview: updated, addedMinutes: extensionMinutes });
  } catch (error: any) {
    console.error('Error extending interview:', error);
    res.status(500).json({ error: 'Failed to extend interview duration' });
  }
});

router.get('/:id/feedback/report', adminOrInterviewer, async (req, res, next) => {
  try { res.json(await feedbackReportMetadata(Number(req.params.id))); }
  catch (error) { next(error); }
});

router.get('/:id/feedback/report/download', adminOrInterviewer, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const report = await prisma.interviewFeedbackReport.findUnique({ where: { interviewId: id } });
    const metadata = await feedbackReportMetadata(id);
    if (!report || metadata?.status !== 'ready' || !report.pdf) {
      throw new WorkflowError('The PDF is not ready. Generate the report from the Feedback tab.', 409);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="interview-${id}-feedback-report.pdf"`);
    res.send(Buffer.from(report.pdf));
  } catch (error) { next(error); }
});

router.post('/:id/feedback/report', adminOrInterviewer, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const revision = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
      const interview = await tx.interview.findUniqueOrThrow({ where: { id } });
      if (interview.status !== 'completed' || !interview.finalFeedback) {
        throw new WorkflowError('Submit final interview feedback before generating a report.', 409);
      }
      criteriaFeedbackSchema.shape.criteria.parse(interview.feedbackCriteria);
      await tx.interviewFeedbackReport.upsert({
        where: { interviewId: id },
        create: { interviewId: id, feedbackRevision: interview.feedbackRevision },
        update: { status: 'pending', feedbackRevision: interview.feedbackRevision, pdf: null, error: null },
      });
      return interview.feedbackRevision;
    });
    res.json(await generateInterviewFeedbackReport(id, revision));
  } catch (error) { next(error); }
});

// Interview-wide criteria can be saved during the interview and after it ends.
// Final rating/recommendation/summary remain gated on completion.
for (const final of [false, true]) {
  router[final ? 'post' : 'put'](
    final ? '/:id/feedback' : '/:id/feedback/criteria',
    adminOrInterviewer,
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const updated = await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
          const interview = await tx.interview.findUniqueOrThrow({ where: { id } });
          if ((req.user?.accessRole ?? req.user?.role) !== 'interviewer' || interview.interviewerId !== req.user!.id) {
            throw new WorkflowError('Only the assigned interviewer can submit feedback.', 403);
          }
          if (final && interview.status !== 'completed') {
            throw new WorkflowError('Final feedback can only be submitted after the interview is completed.', 409);
          }
          if (!['in_progress', 'completed'].includes(interview.status)) {
            throw new WorkflowError('Feedback is available during and after the interview.', 409);
          }
          const input = final
            ? { kind: 'final' as const, ...finalInterviewFeedbackSchema.parse(req.body) }
            : { kind: 'criteria' as const, ...criteriaFeedbackSchema.parse(req.body) };
          if (input.revision !== interview.feedbackRevision) {
            throw new WorkflowError('Feedback changed in another window. Reload before saving.', 409);
          }
          const updated = await tx.interview.update({
            where: { id },
            data: {
              feedbackCriteria: input.criteria,
              feedbackRevision: { increment: 1 },
              ...(input.kind === 'final' ? {
                finalFeedback: input.finalFeedback,
                finalRating: input.finalRating,
                finalRecommendation: input.finalRecommendation,
              } : {}),
            },
          });
          if (final) {
            await tx.interviewFeedbackReport.upsert({
              where: { interviewId: id },
              create: { interviewId: id, feedbackRevision: updated.feedbackRevision },
              update: { status: 'pending', feedbackRevision: updated.feedbackRevision, pdf: null, error: null },
            });
          } else {
            await tx.interviewFeedbackReport.updateMany({
              where: { interviewId: id },
              data: { status: 'outdated', pdf: null, error: 'Feedback criteria changed. Generate an updated PDF report.' },
            });
          }
          return updated;
        });
        await recordInterviewEvent(id, final ? 'FEEDBACK_SUBMITTED' : 'FEEDBACK_CRITERIA_UPDATED', 'interviewer', {
          revision: updated.feedbackRevision,
          ...(final ? { finalRating: updated.finalRating, finalRecommendation: updated.finalRecommendation } : {}),
        });
        const report = final ? await generateInterviewFeedbackReport(id, updated.feedbackRevision) : null;
        res.json({ success: true, interview: updated, report });
      } catch (error) { next(error); }
    },
  );
}

// 13. POST /api/interviews/:id/questions — Add question to interview
const preparationQuestionSchema = z.object({
  title: z.string().transform((value) => value.replace(/\u0000/g, '').trim()).pipe(z.string().min(1).max(500)),
  statement: z.string().transform((value) => value.replace(/\u0000/g, '').trim()).pipe(z.string().min(1).max(50000)),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  tags: z.array(z.string().max(80)).max(20).default([]),
  keyDiscussionPoints: z.array(z.string().max(2000)).max(20).optional(),
  expectedSolution: z.string().max(20000).refine(s => !s.includes('\u0000')).optional(),
});
router.post('/:id/import-set-questions', adminOrInterviewer, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { itemIds } = z.object({ itemIds: z.array(z.number().int().positive()).min(1).max(100).refine(ids => new Set(ids).size === ids.length) }).parse(req.body);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
      const interview = await tx.interview.findUniqueOrThrow({ where: { id } });
      if ((req.user?.accessRole ?? req.user?.role) !== 'interviewer' || interview.interviewerId !== req.user!.id) return { status: 403, error: 'Only the assigned interviewer can import question-set questions.' };
      if (!['scheduled', 'in_progress'].includes(interview.status)) return { status: 409, error: 'This interview has ended.' };
      const items = await tx.interviewQuestionSetItem.findMany({ where: { id: { in: itemIds } }, include: { set: true } });
      if (items.length !== itemIds.length) return { status: 409, error: 'Some selected questions were deleted. Refresh the question sets.' };
      const assigned = await tx.interviewQuestion.findMany({ where: { interviewId: id }, select: { sourceSetItemId: true, orderIndex: true } });
      let orderIndex = Math.max(-1, ...assigned.map(q => q.orderIndex));
      let firstId: number | null = null, count = 0;
      for (const itemId of itemIds) {
        if (assigned.some(q => q.sourceSetItemId === itemId)) continue;
        const item = items.find(q => q.id === itemId)!;
        const question = await tx.question.create({ data: { title: item.title, statement: item.statement, questionType: 'written', difficulty: 'medium', ownerInterviewId: id } });
        await tx.interviewQuestion.create({ data: { interviewId: id, questionId: question.id, orderIndex: ++orderIndex, referenceAnswer: item.answer, sourceSetItemId: item.id, sourceSetTitle: item.set.title, status: !interview.currentQuestionId && !firstId ? 'active' : 'pending' } });
        firstId ??= question.id;
        count++;
      }
      if (!interview.currentQuestionId && firstId) await tx.interview.update({ where: { id }, data: { currentQuestionId: firstId, currentCode: '', codeRevision: { increment: 1 } } });
      return { status: 200, count, previousActiveId: interview.currentQuestionId };
    });
    if ('error' in result) return res.status(result.status).json({ error: result.error });
    await notifyQuestionListChanged(id, result.previousActiveId!, 'QUESTIONS_IMPORTED');
    res.json({ count: result.count });
  } catch (e) { next(e); }
});

router.put('/:id/question-order', adminOrInterviewer, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { questionIds } = z.object({ questionIds: z.array(z.number().int().positive()).max(500).refine(ids => new Set(ids).size === ids.length) }).parse(req.body);
    const previousActiveId = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
      const interview = await tx.interview.findUniqueOrThrow({ where: { id } });
      if (interview.interviewerId !== req.user!.id || !['scheduled', 'in_progress'].includes(interview.status)) throw new WorkflowError('Only the assigned interviewer can reorder an open interview.', 403);
      const links = await tx.interviewQuestion.findMany({ where: { interviewId: id } });
      if (links.length !== questionIds.length || links.some(q => !questionIds.includes(q.questionId))) throw new WorkflowError('Question list changed. Refresh and retry.', 409);
      for (const [orderIndex, questionId] of questionIds.entries()) await tx.interviewQuestion.update({ where: { interviewId_questionId: { interviewId: id, questionId } }, data: { orderIndex } });
      return interview.currentQuestionId;
    });
    await notifyQuestionListChanged(id, previousActiveId, 'QUESTIONS_REORDERED');
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/:id/questions', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = preparationQuestionSchema.safeParse(req.body);
    if (!req.body.questionId && !parsed.success) return res.status(400).json({ error: 'Provide a question title, statement, valid difficulty and tags.' });
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
      const interview = await tx.interview.findUniqueOrThrow({ where: { id } });
      if (!['scheduled', 'in_progress'].includes(interview.status)) return { error: 'Questions cannot be added to a closed interview.', status: 409 };
      let questionId = Number(req.body.questionId);
      if (req.body.questionId) {
        if (!Number.isInteger(questionId) || !(await tx.question.findFirst({ where: { id: questionId, OR: [{ ownerInterviewId: null }, { ownerInterviewId: id }] } }))) return { error: 'Question not found in the bank or this interview.', status: 404 };
        if (await tx.interviewQuestion.findUnique({ where: { interviewId_questionId: { interviewId: id, questionId } } })) return { error: 'Question is already added to this interview.', status: 409 };
      } else if (parsed.success) {
        const { title, statement, difficulty, tags } = parsed.data;
        const created = await tx.question.create({ data: {
          title, statement, difficulty, tags: JSON.stringify(tags), ownerInterviewId: id, questionType: req.body.starterCode ? 'coding' : 'written',
          starterCodes: typeof req.body.starterCode === 'string' && req.body.starterCode
            ? { create: [{ languageId: 71, languageName: 'Python', code: req.body.starterCode }] } : undefined,
        } });
        questionId = created.id;
      }
      const last = await tx.interviewQuestion.aggregate({ where: { interviewId: id }, _max: { orderIndex: true } });
      const link = await tx.interviewQuestion.create({ data: {
        interviewId: id, questionId, orderIndex: (last._max.orderIndex ?? -1) + 1,
        status: interview.currentQuestionId ? 'pending' : 'active',
        referenceAnswer: parsed.success ? parsed.data.expectedSolution : undefined,
        notes: parsed.success ? JSON.stringify({ keyDiscussionPoints: parsed.data.keyDiscussionPoints, expectedSolution: parsed.data.expectedSolution }) : '',
      }, include: { question: { include: { starterCodes: true, testCases: true } } } });
      if (!interview.currentQuestionId) {
        const languageId = link.question.questionType === 'sql' ? 82 : interview.currentLanguageId;
        await tx.interview.update({ where: { id }, data: {
          currentQuestionId: questionId, currentLanguageId: languageId,
          currentCode: link.question.starterCodes.find((starter) => starter.languageId === languageId)?.code || '',
        } });
      }
      return { question: link, previousActiveId: interview.currentQuestionId };
    });
    if ('error' in result) return res.status(result.status!).json({ error: result.error });
    await notifyQuestionListChanged(id, result.previousActiveId!, 'QUESTION_ADDED');
    res.status(201).json({ success: true, question: result.question });
  } catch (error: any) {
    console.error('Error adding question to interview:', error);
    res.status(500).json({ error: 'Failed to add question to interview' });
  }
});

// Editing makes an interview-specific copy, preserving shared question-bank content.
router.put('/:id/questions/:questionId', adminOrInterviewer, async (req: Request, res: Response) => {
  const parsed = preparationQuestionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide a question title, statement, valid difficulty and tags.' });
  try {
    const id = Number(req.params.id);
    const questionId = Number(req.params.questionId);
    if (!Number.isInteger(questionId) || questionId < 1) return res.status(400).json({ error: 'Invalid question ID.' });
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
      const interview = await tx.interview.findUniqueOrThrow({ where: { id } });
      if (!['scheduled', 'in_progress'].includes(interview.status)) return { error: 'Questions cannot be updated after the interview ends.', status: 409 };
      const link = await tx.interviewQuestion.findUnique({
        where: { interviewId_questionId: { interviewId: id, questionId } },
        include: { question: { include: { starterCodes: true, testCases: true } } },
      });
      if (!link) return { error: 'Question is not assigned to this interview.', status: 404 };
      const original = link.question;
      const { title, statement, difficulty, tags } = parsed.data;
      const question = interview.status === 'in_progress' && original.ownerInterviewId === id
        ? await tx.question.update({ where: { id: questionId }, data: { title, statement, difficulty, tags: JSON.stringify(tags) } })
        : await tx.question.create({ data: {
        title, statement, difficulty, tags: JSON.stringify(tags), ownerInterviewId: id, questionType: original.questionType,
        settings: original.settings as Prisma.InputJsonValue, timeLimit: original.timeLimit, memoryLimit: original.memoryLimit,
        starterCodes: { create: original.starterCodes.map(({ languageId, languageName, code }) => ({ languageId, languageName, code })) },
        testCases: { create: original.testCases.map(({ input, expectedOutput, isSample }) => ({ input, expectedOutput, isSample })) },
      } });
      await tx.interviewQuestion.update({ where: { id: link.id }, data: { questionId: question.id, referenceAnswer: parsed.data.expectedSolution ?? link.referenceAnswer } });
      if (interview.currentQuestionId === questionId && question.id !== questionId) await tx.interview.update({ where: { id }, data: { currentQuestionId: question.id, codeRevision: { increment: 1 } } });
      return { question, previousActiveId: interview.currentQuestionId };
    });
    if ('error' in result) return res.status(result.status!).json({ error: result.error });
    await notifyQuestionListChanged(id, result.previousActiveId!, 'QUESTION_UPDATED');
    res.json({ success: true, question: result.question });
  } catch (error) {
    console.error('Error updating interview question:', error);
    res.status(500).json({ error: 'Failed to update the interview question.' });
  }
});

// 14. DELETE /api/interviews/:id/questions/:questionId — Remove question from interview
router.delete(
  '/:id/questions/:questionId',
  adminOrInterviewer,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const qId = parseInt(req.params.questionId);

      if (!Number.isInteger(qId) || qId < 1) return res.status(400).json({ error: 'Invalid question ID' });
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
        const interview = await tx.interview.findUniqueOrThrow({ where: { id } });
        if (!['scheduled', 'in_progress'].includes(interview.status)) return { error: 'Questions cannot be removed after the interview ends.', status: 409 };
        const removed = await tx.interviewQuestion.deleteMany({ where: { interviewId: id, questionId: qId } });
        if (!removed.count) return { error: 'Question is not assigned to this interview.', status: 404 };
        if (interview.currentQuestionId === qId) {
          const next = await tx.interviewQuestion.findFirst({ where: { interviewId: id }, orderBy: { orderIndex: 'asc' }, include: { question: { include: { starterCodes: true } } } });
          const languageId = next?.question.questionType === 'sql' ? 82 : interview.currentLanguageId === 82 ? 71 : interview.currentLanguageId;
          await tx.interview.update({ where: { id }, data: { currentQuestionId: next?.questionId ?? null, currentCode: next?.question.starterCodes.find((s) => s.languageId === languageId)?.code ?? '', currentLanguageId: languageId, codeRevision: { increment: 1 } } });
          if (next && ['pending', 'active'].includes(next.status)) await tx.interviewQuestion.update({ where: { id: next.id }, data: { status: 'active' } });
        }
        return { previousActiveId: interview.currentQuestionId };
      });
      if ('error' in result) return res.status(result.status!).json({ error: result.error });
      await notifyQuestionListChanged(id, result.previousActiveId!, 'QUESTION_REMOVED');

      res.json({ success: true, message: 'Question removed from interview' });
    } catch (error: any) {
      console.error('Error removing question from interview:', error);
      res.status(500).json({ error: 'Failed to remove question' });
    }
  },
);

// Per-question interviewer feedback is private and kept with the interview question.
router.put('/:id/questions/:questionId/feedback', adminOrInterviewer, async (req: Request, res: Response) => {
  const parsed = z.object({ feedback: z.string().trim().min(1).max(10000).refine((value) => !value.includes('\u0000')) }).safeParse(req.body);
  const id = Number(req.params.id), questionId = Number(req.params.questionId);
  if (!parsed.success || !Number.isInteger(id) || !Number.isInteger(questionId)) return res.status(400).json({ error: 'Provide valid question feedback (1–10000 characters).' });
  try {
    await enforceInterviewDeadlines({ id });
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
      const interview = await tx.interview.findFirst({ where: { id, interviewerId: req.user!.id } });
      if (!interview) return { status: 404, error: 'Assigned interview not found.' };
      if (interview.status !== 'in_progress') return { status: 409, error: 'Question feedback can only be edited during the interview.' };
      const link = await tx.interviewQuestion.findUnique({ where: { interviewId_questionId: { interviewId: id, questionId } }, include: { question: true } });
      if (!link) return { status: 404, error: 'Question not assigned to this interview.' };
      if (!['written', 'mcq', 'project'].includes(link.question.questionType)) return { status: 400, error: 'Coding follow-ups use candidate submissions.' };
      const data = { ...questionNoteData(link.notes), interviewerFeedback: parsed.data.feedback };
      await tx.interviewQuestion.update({ where: { id: link.id }, data: { notes: JSON.stringify(data) } });
      return { status: 200, feedback: parsed.data.feedback };
    });
    if (result.status === 200) await recordInterviewEvent(id, 'QUESTION_FEEDBACK_UPDATED', 'interviewer', { questionId });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error('Error saving question feedback:', error);
    return res.status(500).json({ error: 'Failed to save question feedback.' });
  }
});

// 15. POST /api/interviews/:id/notes — Add note (Interviewer or Admin)
router.post('/:id/notes', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const interviewId = parseInt(req.params.id);
    const {
      category = 'general',
      rating,
      content,
      isPrivate = true,
    } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const note = await prisma.interviewNote.create({
      data: {
        interviewId,
        authorId: req.user!.id,
        category,
        rating: rating !== undefined ? Number(rating) : null,
        content: content.trim(),
        isPrivate: Boolean(isPrivate),
      },
      include: { author: { select: { id: true, name: true } } },
    });

    if (note.isPrivate) {
      try {
        getIO()
          .to(`private:user:${req.user!.id}`)
          .emit(INTERVIEW_EVENTS.NOTE_ADDED, note);
      } catch {}
    } else
      broadcastToInterviewRoom(interviewId, INTERVIEW_EVENTS.NOTE_ADDED, note);

    res.status(201).json(note);
  } catch (error: any) {
    console.error('Error adding interview note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// 16. GET /api/interviews/:id/notes — Get all evaluation notes
router.get('/:id/notes', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const interviewId = parseInt(req.params.id);
    const notes = await prisma.interviewNote.findMany({
      where: { interviewId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(notes);
  } catch (error: any) {
    console.error('Error fetching interview notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// 17. DELETE /api/interviews/:id — Delete interview
router.delete('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.interview.delete({ where: { id } });
    res.json({ success: true, message: 'Interview deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting interview:', error);
    res.status(500).json({ error: 'Failed to delete interview' });
  }
});

export default router;
