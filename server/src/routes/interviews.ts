import { candidatePayload } from '../platform/questions';
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { executeCode, Judge0Result } from '../services/judge0';
import { getIO } from '../socket';
import {
  getInterviewRoom,
  flushCodeToDb,
  recordInterviewEvent,
} from '../socket/interview-handler';
import { INTERVIEW_EVENTS } from '../socket/types';
import { queueInterviewInvitation } from '../platform/notifications';

const router = Router();
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
    if (
      req.user?.role === 'admin'
        ? req.user.id !== interview.interviewerId
        : req.user?.id !== interview.candidateId
    )
      return res
        .status(403)
        .json({ error: 'You are not assigned to this interview' });
    if (
      ['POST', 'PUT'].includes(req.method) &&
      /\/(execute|submit|current-question)$/.test(
        req.originalUrl.split('?')[0],
      ) &&
      interview.status !== 'in_progress'
    )
      return res.status(409).json({ error: 'This interview is not active' });
    next();
  } catch (error) {
    next(error);
  }
});

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
// Candidate room resolver (no JWT required; protected by roomToken)
export const handleJoinRoom = async (req: Request, res: Response) => {
  try {
    const { roomToken } = req.params;
    if (!roomToken) {
      return res.status(400).json({ error: 'roomToken is required' });
    }

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

    // Return sanitized candidate-safe payload
    res.json({
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
      questions: interview.questions,
      interviewer: {
        name: interview.interviewer.name,
      },
    });
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
    res.json({ saved: true });
  } catch {
    res.status(500).json({ error: 'Could not save candidate answer' });
  }
};

// 2. POST /api/interviews — Create a new interview
router.post('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      candidateName,
      candidateEmail,
      scheduledAt,
      timeLimitMinutes,
      questionIds,
      currentLanguageId = 71,
    } = req.body;

    if (!title?.trim() || !candidateName?.trim() || !candidateEmail?.trim()) {
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
    const interviewerId = req.user!.id;
    const roomToken = crypto.randomBytes(16).toString('hex');

    // Parse and validate questions if provided
    const ids: number[] = Array.isArray(questionIds)
      ? questionIds.map(Number).filter((n) => !isNaN(n) && n > 0)
      : [];

    let firstQuestionId: number | null = null;
    let starterCode = '';
    let initialLanguageId = Number(currentLanguageId) || 71;

    if (ids.length > 0) {
      // Verify all requested questions exist in the database
      const existingQuestions = await prisma.question.findMany({
        where: { id: { in: ids } },
        include: { starterCodes: true },
      });

      const existingIdsSet = new Set(existingQuestions.map((q) => q.id));
      const invalidIds = ids.filter((id) => !existingIdsSet.has(id));

      if (invalidIds.length > 0) {
        return res.status(400).json({
          error: `Question ID(s) not found: [${invalidIds.join(', ')}]. Please provide valid IDs from the question bank (e.g. GET /api/questions).`,
        });
      }

      // Order questions matching the input array
      const firstQ =
        existingQuestions.find((q) => q.id === ids[0]) || existingQuestions[0];
      firstQuestionId = firstQ.id;
      if (firstQ.questionType === 'sql') initialLanguageId = 82;
      const sc = firstQ.starterCodes.find(
        (s) => s.languageId === initialLanguageId,
      );
      starterCode = sc ? sc.code : '';
    } else if (req.body.currentQuestionId) {
      // If caller provided currentQuestionId directly without questionIds array
      const checkQ = await prisma.question.findUnique({
        where: { id: Number(req.body.currentQuestionId) },
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

    const registeredCandidate = await prisma.user.findFirst({
      where: { email: candidateEmail.trim().toLowerCase(), role: 'candidate' },
      select: { id: true },
    });
    const interview = await prisma.interview.create({
      data: {
        title: title.trim(),
        description: description ? String(description) : '',
        interviewerId,
        candidateName: candidateName.trim(),
        candidateEmail: candidateEmail.trim().toLowerCase(),
        candidateId: registeredCandidate?.id,
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
        questions: {
          include: {
            question: { select: { id: true, title: true, difficulty: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    // Scheduling is what notifies the candidate; mail failures must not undo the interview.
    const invitationQueued = interview.scheduledAt
      ? await queueInterviewInvitation(interview, interviewerId).catch((error) => {
          console.error('Interview invitation failed:', error instanceof Error ? error.message : error);
          return false;
        })
      : false;
    res.status(201).json({
      success: true,
      interview,
      invitationQueued,
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
router.get('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const interviews = await prisma.interview.findMany({
      where: { interviewerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: {
        interviewer: { select: { id: true, name: true, email: true } },
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

    res.json(interviews);
  } catch (error: any) {
    console.error('Error listing interviews:', error);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// 4. GET /api/interviews/:id — Full interview details
router.get('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id))
      return res.status(400).json({ error: 'Invalid interview ID' });

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        interviewer: { select: { id: true, name: true, email: true } },
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

    res.json(interview);
  } catch (error: any) {
    console.error('Error fetching interview:', error);
    res.status(500).json({ error: 'Failed to fetch interview' });
  }
});

// 5. POST /api/interviews/:id/start — Start the interview
router.post('/:id/start', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const transition = await prisma.interview.updateMany({
      where: { id, status: 'scheduled' },
      data: { status: 'in_progress', startedAt: new Date() },
    });
    if (!transition.count)
      return res
        .status(409)
        .json({ error: 'Only scheduled interviews can be started' });
    const current = await prisma.interview.findUniqueOrThrow({ where: { id } });
    const startedAt = current.startedAt!;

    const interview = current;
    await recordInterviewEvent(
      id,
      INTERVIEW_EVENTS.INTERVIEW_STARTED,
      'interviewer',
      {
        startedAt: startedAt.toISOString(),
        code: current.currentCode,
        languageId: current.currentLanguageId,
        questionId: current.currentQuestionId,
      },
    );

    broadcastToInterviewRoom(id, INTERVIEW_EVENTS.INTERVIEW_STARTED, {
      startedAt: startedAt.toISOString(),
      timeLimitMinutes: interview.timeLimitMinutes,
    });

    res.json({ success: true, interview });
  } catch (error: any) {
    console.error('Error starting interview:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// 6. POST /api/interviews/:id/end — End the interview
router.post('/:id/end', adminOnly, async (req: Request, res: Response) => {
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
  adminOnly,
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
        where: { interviewId: id },
        data: { status: 'pending' },
      });

      await prisma.interviewQuestion.updateMany({
        where: { interviewId: id, questionId: question.id },
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

// 10. POST /api/interviews/:id/notes — Add note (Interviewer only)
router.post('/:id/notes', adminOnly, async (req: Request, res: Response) => {
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

// 11. GET /api/interviews/:id/notes — Get all evaluation notes
router.get('/:id/notes', adminOnly, async (req: Request, res: Response) => {
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

// 12. DELETE /api/interviews/:id — Delete interview
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
