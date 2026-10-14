import { queueWebhook } from '../platform/webhooks';
import { registerRoomTools } from '../platform/room-tools';
import { candidatePayload } from '../platform/questions';
import { Server, Socket } from 'socket.io';
import prisma from '../prisma';
import { triggerInterviewAI } from '../ai/trigger';
import { latestUIResults } from '../ai/results';
import { executeCode, Judge0Result } from '../services/judge0';
import {
  INTERVIEW_EVENTS,
  SocketUser,
  JoinInterviewPayload,
  UpdateCodePayload,
  ExecuteCodePayload,
  SubmitCodePayload,
  AddNotePayload,
  ChangeQuestionPayload,
} from './types';

// In-memory debouncer cache for code autosaving to avoid hammering PostgreSQL
interface DebounceCache {
  code: string;
  languageId: number;
  timer: NodeJS.Timeout | null;
}

const codeDebounceMap = new Map<number, DebounceCache>();

// Track connected participants per interview room: interviewId -> Set of socket IDs
const roomSocketsMap = new Map<number, Set<string>>();

export function getInterviewRoom(interviewId: number): string {
  return `room:interview:${interviewId}`;
}

/**
 * Flush any pending debounced code to PostgreSQL database
 */
export async function flushCodeToDb(_interviewId: number) {
  // Code updates are committed before acknowledging, so no process-local flush is needed.
}

async function scheduleCodeSave(
  interviewId: number,
  code: string,
  languageId: number,
  baseRevision: number,
  actorRole: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${interviewId} FOR UPDATE`;
    const interview = await tx.interview.findUniqueOrThrow({
      where: { id: interviewId },
    });
    if (interview.status !== 'in_progress')
      throw new Error('Interview is not active');
    if (interview.codeRevision !== baseRevision)
      throw new Error(
        'Code changed on another device. Resolve the conflicting draft.',
      );
    const updated = await tx.interview.update({
      where: { id: interviewId },
      data: {
        currentCode: code,
        currentLanguageId: languageId,
        codeRevision: { increment: 1 },
      },
    });
    await tx.interviewEvent.create({
      data: {
        interviewId,
        eventType: 'CODE_CHANGED',
        actorRole,
        payload: JSON.stringify({
          code,
          languageId,
          revision: updated.codeRevision,
          questionId: interview.currentQuestionId,
        }),
      },
    });
    return updated.codeRevision;
  });
}

/**
 * Helper to log interview event to DB
 */
export async function recordInterviewEvent(
  interviewId: number,
  eventType: string,
  actorRole: 'interviewer' | 'candidate' | 'system',
  payload: Record<string, any>,
) {
  try {
    await prisma.interviewEvent.create({
      data: {
        interviewId,
        eventType,
        actorRole,
        payload: JSON.stringify(payload),
      },
    });
    if (['CODE_EXECUTED', 'CODE_SUBMITTED'].includes(eventType))
      void triggerInterviewAI(interviewId, 'interview-assistant').catch(
        () => {},
      );
    if (eventType === 'INTERVIEW_ENDED') {
      void queueWebhook('interview.completed', interviewId).catch((error) =>
        console.error('Webhook enqueue failed:', error.message),
      );
      void triggerInterviewAI(interviewId, 'note-writer').catch(() => {});
      void triggerInterviewAI(interviewId, 'evaluation').catch(() => {});
    }
  } catch (err) {
    console.error(`[Socket] Error logging event ${eventType}:`, err);
  }
}

export function registerInterviewHandlers(io: Server, socket: Socket) {
  if (socket.data.user?.role === 'candidate') {
    const original = socket.emit.bind(socket);
    socket.emit = ((event: string, ...args: any[]) =>
      original(event, ...args.map(candidatePayload))) as typeof socket.emit;
  }
  const user = socket.data.user as SocketUser | undefined;
  socket.use(async ([event, raw], next) => {
    if (event === INTERVIEW_EVENTS.JOIN_INTERVIEW) return next();
    try {
      const payload = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
      const current = socket.data.user as SocketUser;
      const id = payload.interviewId || current.interviewId;
      if (!current.interviewId || id !== current.interviewId)
        return next(new Error('Interview access denied'));
      const interview = await prisma.interview.findUnique({
        where: { id },
        select: {
          interviewerId: true,
          candidateId: true,
          roomToken: true,
          status: true,
        },
      });
      if (
        !interview ||
        (current.role === 'interviewer'
          ? current.userId !== interview.interviewerId
          : current.roomToken !== interview.roomToken &&
            current.userId !== interview.candidateId)
      )
        return next(new Error('Interview access denied'));
      if (['completed', 'cancelled'].includes(interview.status))
        return next(new Error('Interview has ended'));
      if (
        [
          'UPDATE_CODE',
          'EXECUTE_CODE',
          'SUBMIT_CODE',
          'CODE_CHANGED',
          'CODE_EXECUTED',
          'CODE_SUBMITTED',
        ].includes(event) &&
        interview.status !== 'in_progress'
      )
        return next(new Error('Interview has not started'));
      next();
    } catch {
      next(new Error('Invalid interview event'));
    }
  });
  socket.on('error', (error) =>
    socket.emit(INTERVIEW_EVENTS.ERROR, { message: error.message }),
  );

  registerRoomTools(io, socket);
  // 1. JOIN_INTERVIEW
  const joinInterview = async (rawPayload: any, callback?: any) => {
    try {
      const payload: JoinInterviewPayload =
        typeof rawPayload === 'string'
          ? (() => {
              try {
                return JSON.parse(rawPayload);
              } catch {
                return {};
              }
            })()
          : rawPayload || {};

      let interviewId = payload?.interviewId || user?.interviewId;
      const roomToken = payload?.roomToken || user?.roomToken;

      let interview = null;
      if (roomToken) {
        interview = await prisma.interview.findUnique({
          where: { roomToken },
          include: {
            currentQuestion: {
              include: {
                starterCodes: true,
                testCases: { where: { isSample: true } },
              },
            },
            questions: {
              include: {
                question: {
                  select: { id: true, title: true, difficulty: true },
                },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        });
      } else if (interviewId) {
        interview = await prisma.interview.findUnique({
          where: { id: interviewId },
          include: {
            currentQuestion: {
              include: {
                starterCodes: true,
                testCases: { where: { isSample: true } },
              },
            },
            questions: {
              include: {
                question: {
                  select: { id: true, title: true, difficulty: true },
                },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        });
      }

      if (!interview) {
        socket.emit(INTERVIEW_EVENTS.ERROR, {
          message: 'Interview room not found',
        });
        return;
      }

      if (
        !user ||
        (user.role === 'candidate' &&
          user.roomToken !== interview.roomToken &&
          user.userId !== interview.candidateId) ||
        (user.role === 'interviewer' && user.userId !== interview.interviewerId)
      ) {
        socket.emit(INTERVIEW_EVENTS.ERROR, {
          message: 'You are not assigned to this interview room',
        });
        return;
      }
      if (['completed', 'cancelled'].includes(interview.status)) {
        socket.emit(INTERVIEW_EVENTS.ERROR, {
          message: 'This interview room is closed',
        });
        return;
      }
      interviewId = interview.id;
      const role = user?.role || 'candidate';
      const participantName =
        payload?.candidateName ||
        user?.name ||
        (role === 'candidate' ? interview.candidateName : 'Interviewer');

      // Update socket metadata
      socket.data.user = {
        role,
        name: participantName,
        userId: user?.userId,
        email: user?.email,
        interviewId,
        roomToken: interview.roomToken,
      };

      const room = getInterviewRoom(interviewId);
      socket.join(room);
      if (role === 'interviewer')
        socket.join(`private:interview:${interviewId}:user:${user?.userId}`);

      // Track connection in memory
      if (!roomSocketsMap.has(interviewId)) {
        roomSocketsMap.set(interviewId, new Set());
      }
      roomSocketsMap.get(interviewId)!.add(socket.id);

      if (
        socket.data.joinedInterviewId !== interview.id ||
        !socket.data.sessionId
      ) {
        // Record session in database
        const ipAddress =
          (socket.handshake.headers['x-forwarded-for'] as string) ||
          socket.handshake.address;
        const userAgent = socket.handshake.headers['user-agent'] || '';

        const session = await prisma.interviewSession.create({
          data: {
            interviewId,
            participantRole: role,
            participantName,
            socketId: socket.id,
            ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
            userAgent,
          },
        });

        socket.data.sessionId = session.id;
        socket.data.joinedInterviewId = interview.id;

        // Broadcast join event
        const joinEventName =
          role === 'candidate'
            ? INTERVIEW_EVENTS.CANDIDATE_JOINED
            : INTERVIEWER_JOINED_EVENT(role);

        io.to(room).emit(joinEventName, {
          participantName,
          role,
          timestamp: new Date().toISOString(),
        });

        await recordInterviewEvent(interviewId, joinEventName, role, {
          participantName,
          socketId: socket.id,
          code: interview.currentCode,
          languageId: interview.currentLanguageId,
          questionId: interview.currentQuestionId,
        });
      }

      // Send initial state back to the connected user
      // If there is an in-memory cached code, serve that; otherwise serve DB code
      const cached = undefined as DebounceCache | undefined;
      const activeCode =
        cached?.code !== undefined ? cached.code : interview.currentCode;
      const activeLangId = cached?.languageId || interview.currentLanguageId;

      const syncState = {
        interviewId: interview.id,
        title: interview.title,
        status: interview.status,
        startedAt: interview.startedAt?.toISOString() || null,
        endedAt: interview.endedAt?.toISOString() || null,
        currentQuestionId: interview.currentQuestionId,
        currentQuestion: interview.currentQuestion,
        currentCandidateAnswer:
          interview.questions.find(
            (q) => q.questionId === interview.currentQuestionId,
          )?.candidateAnswer ?? '',
        questions: interview.questions,
        codeRevision: interview.codeRevision,
        currentCode: activeCode,
        currentLanguageId: activeLangId,
        timeLimitMinutes: interview.timeLimitMinutes,
        role,
        participantName,
      };

      if (role === 'interviewer') {
        (syncState as any).aiResults = await latestUIResults(
          interviewId,
          user!.userId!,
        );
      }
      socket.emit(INTERVIEW_EVENTS.SYNC_STATE, syncState);

      if (typeof callback === 'function') {
        callback({
          success: true,
          event: 'JOIN_INTERVIEW',
          syncState:
            role === 'candidate' ? candidatePayload(syncState) : syncState,
        });
      }

      console.log(`[Socket] ${participantName} (${role}) joined ${room}`);
    } catch (err: any) {
      console.error('[Socket] JOIN_INTERVIEW error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, {
        message: err.message || 'Failed to join interview',
      });
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: err.message || 'Failed to join interview',
        });
      }
    }
  };
  let joinQueue = Promise.resolve();
  socket.on(INTERVIEW_EVENTS.JOIN_INTERVIEW, (payload, callback) => {
    joinQueue = joinQueue
      .then(() => joinInterview(payload, callback))
      .catch((error) =>
        console.error('Room synchronization failed:', error.message),
      );
  });

  // 2. START_INTERVIEW
  socket.on(INTERVIEW_EVENTS.START_INTERVIEW, async (callback?: any) => {
    try {
      const interviewId = socket.data.user?.interviewId;
      if (!interviewId) return;

      if (socket.data.user?.role !== 'interviewer') {
        socket.emit(INTERVIEW_EVENTS.ERROR, {
          message: 'Only interviewers can start the interview',
        });
        if (typeof callback === 'function')
          callback({
            success: false,
            error: 'Only interviewers can start the interview',
          });
        return;
      }

      const changed = await prisma.interview.updateMany({
        where: { id: interviewId, status: 'scheduled' },
        data: { status: 'in_progress', startedAt: new Date() },
      });
      if (!changed.count)
        throw new Error('Only scheduled interviews can be started');
      const startedAt = (
        await prisma.interview.findUniqueOrThrow({ where: { id: interviewId } })
      ).startedAt!;
      const updated = await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: 'in_progress',
          startedAt,
        },
      });

      const room = getInterviewRoom(interviewId);
      io.to(room).emit(INTERVIEW_EVENTS.INTERVIEW_STARTED, {
        startedAt: startedAt.toISOString(),
        timeLimitMinutes: updated.timeLimitMinutes,
      });

      await recordInterviewEvent(
        interviewId,
        INTERVIEW_EVENTS.INTERVIEW_STARTED,
        'interviewer',
        {
          startedAt: startedAt.toISOString(),
        },
      );

      if (typeof callback === 'function') {
        callback({
          success: true,
          status: 'in_progress',
          startedAt: startedAt.toISOString(),
        });
      }
    } catch (err: any) {
      console.error('[Socket] START_INTERVIEW error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message });
      if (typeof callback === 'function')
        callback({ success: false, error: err.message });
    }
  });

  // 3. CHANGE_QUESTION
  socket.on(
    INTERVIEW_EVENTS.CHANGE_QUESTION,
    async (payload: ChangeQuestionPayload, callback?: any) => {
      try {
        const interviewId = socket.data.user?.interviewId;
        if (!interviewId || !payload?.questionId) return;

        if (socket.data.user?.role !== 'interviewer') {
          socket.emit(INTERVIEW_EVENTS.ERROR, {
            message: 'Only interviewers can switch the active question',
          });
          if (typeof callback === 'function')
            callback({
              success: false,
              error: 'Only interviewers can switch question',
            });
          return;
        }

        const question = await prisma.question.findUnique({
          where: { id: payload.questionId },
          include: {
            starterCodes: true,
            testCases: { where: { isSample: true } },
          },
        });

        if (!question) {
          socket.emit(INTERVIEW_EVENTS.ERROR, {
            message: 'Question not found',
          });
          if (typeof callback === 'function')
            callback({ success: false, error: 'Question not found' });
          return;
        }

        if (
          !(await prisma.interviewQuestion.findUnique({
            where: {
              interviewId_questionId: { interviewId, questionId: question.id },
            },
          }))
        )
          throw new Error('Question is not assigned to this interview');
        // Update question status in InterviewQuestion junction table
        await prisma.interviewQuestion.updateMany({
          where: { interviewId },
          data: { status: 'pending' },
        });

        await prisma.interviewQuestion.updateMany({
          where: { interviewId, questionId: question.id },
          data: { status: 'active' },
        });

        // Get appropriate starter code
        const interview = await prisma.interview.findUnique({
          where: { id: interviewId },
          select: { currentLanguageId: true },
        });

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

        // Update currentQuestionId and starter code in DB
        await prisma.interview.update({
          where: { id: interviewId },
          data: {
            currentQuestionId: question.id,
            currentCode: starterCode,
            currentLanguageId: langId,
            codeRevision: { increment: 1 },
          },
        });

        // Update cache
        codeDebounceMap.set(interviewId, {
          code: starterCode,
          languageId: langId,
          timer: null,
        });

        const room = getInterviewRoom(interviewId);
        io.to(room).emit(INTERVIEW_EVENTS.QUESTION_CHANGED, {
          questionId: question.id,
          question: candidatePayload(question),
          starterCode,
          languageId: langId,
          timestamp: new Date().toISOString(),
        });

        await recordInterviewEvent(
          interviewId,
          INTERVIEW_EVENTS.QUESTION_CHANGED,
          'interviewer',
          {
            questionId: question.id,
            questionTitle: question.title,
            code: starterCode,
            languageId: langId,
          },
        );

        if (typeof callback === 'function') {
          callback({
            success: true,
            questionId: question.id,
            question,
            starterCode,
          });
        }
      } catch (err: any) {
        console.error('[Socket] CHANGE_QUESTION error:', err);
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message });
        if (typeof callback === 'function')
          callback({ success: false, error: err.message });
      }
    },
  );

  // 4. UPDATE_CODE (Collaborative Dual-Editing)
  const handleUpdateCode = async (rawPayload: any, callback?: any) => {
    try {
      const payload: UpdateCodePayload & { interviewId?: number } =
        typeof rawPayload === 'string'
          ? (() => {
              try {
                return JSON.parse(rawPayload);
              } catch {
                return { code: rawPayload };
              }
            })()
          : rawPayload || {};

      const interviewId = payload?.interviewId || socket.data.user?.interviewId;
      if (!interviewId || typeof payload?.code !== 'string') {
        if (typeof callback === 'function')
          callback({
            success: false,
            error: 'Missing interviewId or code string',
          });
        return;
      }

      if (
        payload.code.length > 50000 ||
        ![71, 62, 54, 63, 82].includes(payload.languageId || 71)
      )
        throw new Error('Invalid code or language');
      const baseRevision = (payload as any).baseRevision;
      if (!Number.isInteger(baseRevision))
        throw new Error('A code revision is required. Reconnect your editor.');
      const revision = await scheduleCodeSave(
        interviewId,
        payload.code,
        payload.languageId || 71,
        baseRevision,
        socket.data.user?.role || 'candidate',
      );
      const role = socket.data.user?.role || 'candidate';
      const name = socket.data.user?.name || 'Anonymous';
      const languageId = payload.languageId || 71;

      // Ensure socket is in the interview room
      const room = getInterviewRoom(interviewId);
      socket.join(room);

      const broadcastData = {
        code: payload.code,
        languageId,
        revision,
        authorRole: role,
        authorName: name,
        cursorPosition: payload.cursorPosition,
        timestamp: Date.now(),
      };

      // Broadcast to everyone else in the room (emits both event names for convenience)
      socket.to(room).emit(INTERVIEW_EVENTS.CODE_CHANGED, broadcastData);
      socket.to(room).emit('UPDATE_CODE', broadcastData);

      // Schedule debounced database update (throttled to 2 seconds)

      if (typeof callback === 'function') {
        callback({
          success: true,
          revision,
          broadcasted: true,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      console.error('[Socket] UPDATE_CODE error:', err);
      if (typeof callback === 'function')
        callback({
          success: false,
          error: err.message,
          state: await prisma.interview.findUnique({
            where: { id: socket.data.user?.interviewId },
            select: {
              currentCode: true,
              currentLanguageId: true,
              codeRevision: true,
            },
          }),
        });
    }
  };

  socket.on(INTERVIEW_EVENTS.UPDATE_CODE, handleUpdateCode);
  socket.on('CODE_CHANGED', handleUpdateCode);

  // 5. EXECUTE_CODE (Judge0 Test / Run)
  const handleExecuteCode = async (rawPayload: any, callback?: any) => {
    try {
      const payload: ExecuteCodePayload & { interviewId?: number } =
        typeof rawPayload === 'string'
          ? (() => {
              try {
                return JSON.parse(rawPayload);
              } catch {
                return {};
              }
            })()
          : rawPayload || {};

      const interviewId = payload?.interviewId || socket.data.user?.interviewId;
      if (!interviewId) {
        if (typeof callback === 'function')
          callback({ success: false, error: 'Missing interviewId' });
        return;
      }

      const room = getInterviewRoom(interviewId);
      socket.join(room);

      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        include: {
          currentQuestion: {
            include: { testCases: { where: { isSample: true } } },
          },
        },
      });

      if (!interview) {
        if (typeof callback === 'function')
          callback({ success: false, error: 'Interview not found' });
        return;
      }

      if (
        ['mcq', 'written', 'project'].includes(
          interview.currentQuestion?.questionType ?? '',
        )
      )
        throw new Error(
          'Use the candidate answer and human evaluation for this question format',
        );
      const code = payload?.code || interview.currentCode;
      const languageId =
        interview.currentQuestion?.questionType === 'sql'
          ? 82
          : payload?.languageId || interview.currentLanguageId;
      const stdin =
        payload?.stdin || interview.currentQuestion?.testCases[0]?.input || '';
      const expectedOutput =
        interview.currentQuestion?.testCases[0]?.expectedOutput || undefined;

      const role = socket.data.user?.role || 'candidate';

      // Notify room that execution started
      io.to(room).emit('CODE_EXECUTING', {
        triggeredBy: socket.data.user?.name || role,
      });

      // Execute through Judge0
      const result: Judge0Result = await executeCode({
        sourceCode:
          interview.currentQuestion?.questionType === 'sql'
            ? `${stdin}\n${code}`
            : code,
        languageId,
        stdin: interview.currentQuestion?.questionType === 'sql' ? '' : stdin,
        expectedOutput,
        cpuTimeLimit: interview.currentQuestion?.timeLimit || 2,
        memoryLimit: interview.currentQuestion?.memoryLimit || 256000,
      });

      const broadcastData = {
        result,
        triggeredBy: socket.data.user?.name || role,
        timestamp: new Date().toISOString(),
      };

      // Broadcast result to both candidate and interviewer (emits both event names)
      io.to(room).emit(INTERVIEW_EVENTS.CODE_EXECUTED, broadcastData);
      io.to(room).emit('EXECUTE_CODE', broadcastData);

      await recordInterviewEvent(
        interviewId,
        INTERVIEW_EVENTS.CODE_EXECUTED,
        role,
        {
          status: result.status.description,
          time: result.time,
        },
      );

      if (typeof callback === 'function') {
        callback({ success: true, result });
      }
    } catch (err: any) {
      console.error('[Socket] EXECUTE_CODE error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, {
        message: err.message || 'Execution failed',
      });
      if (typeof callback === 'function')
        callback({ success: false, error: err.message });
    }
  };

  socket.on(INTERVIEW_EVENTS.EXECUTE_CODE, handleExecuteCode);
  socket.on('CODE_EXECUTED', handleExecuteCode);

  // 6. SUBMIT_CODE (Full grading against all test cases)
  const handleSubmitCode = async (rawPayload: any, callback?: any) => {
    try {
      const payload: SubmitCodePayload & { interviewId?: number } =
        typeof rawPayload === 'string'
          ? (() => {
              try {
                return JSON.parse(rawPayload);
              } catch {
                return {};
              }
            })()
          : rawPayload || {};

      const interviewId = payload?.interviewId || socket.data.user?.interviewId;
      if (!interviewId) {
        if (typeof callback === 'function')
          callback({ success: false, error: 'Missing interviewId' });
        return;
      }

      const room = getInterviewRoom(interviewId);
      socket.join(room);

      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        select: {
          id: true,
          currentQuestionId: true,
          currentCode: true,
          currentLanguageId: true,
        },
      });

      if (!interview) {
        if (typeof callback === 'function')
          callback({ success: false, error: 'Interview not found' });
        return;
      }

      const questionId = payload?.questionId || interview.currentQuestionId;
      if (questionId !== interview.currentQuestionId)
        throw new Error('Only the active interview question can be submitted');
      if (!questionId) {
        socket.emit(INTERVIEW_EVENTS.ERROR, {
          message: 'No active question to submit for',
        });
        if (typeof callback === 'function')
          callback({ success: false, error: 'No active question' });
        return;
      }

      const code = payload?.code || interview.currentCode || '';
      const languageId =
        payload?.languageId || interview.currentLanguageId || 71;

      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: { testCases: true },
      });

      if (!question) {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Question not found' });
        if (typeof callback === 'function')
          callback({ success: false, error: 'Question not found' });
        return;
      }

      const role = socket.data.user?.role || 'candidate';

      io.to(room).emit('CODE_SUBMITTING', {
        submittedBy: socket.data.user?.name || role,
      });

      // Grade against ALL test cases
      if (['mcq', 'written', 'project'].includes(question.questionType))
        throw new Error('This question requires human evaluation');
      let infrastructureFailed = false;
      let passedCount = 0;
      const testCaseResults = [];

      for (const tc of question.testCases) {
        try {
          const res = await executeCode({
            sourceCode:
              question.questionType === 'sql' ? `${tc.input}\n${code}` : code,
            languageId: question.questionType === 'sql' ? 82 : languageId,
            stdin: question.questionType === 'sql' ? '' : tc.input,
            expectedOutput: tc.expectedOutput,
            cpuTimeLimit: question.timeLimit,
            memoryLimit: question.memoryLimit,
          });

          const actual = (res.stdout || '').trim();
          const passed =
            res.status.id === 3 && actual === tc.expectedOutput.trim();
          if (passed) passedCount++;

          testCaseResults.push({
            testCaseId: tc.id,
            isSample: tc.isSample,
            passed,
            statusDesc: passed
              ? 'Accepted'
              : res.status.id === 3
                ? 'Wrong Answer'
                : res.status.description,
            executionTime: res.time ? parseFloat(res.time) : null,
          });
        } catch (execErr: any) {
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

      // Save submission record
      const submission = await prisma.interviewSubmission.create({
        data: {
          interviewId,
          questionId,
          submittedBy: role,
          languageId,
          languageName: `Language ${languageId}`,
          code,
          score,
          status: infrastructureFailed ? 'execution_failed' : 'graded',
          results: JSON.stringify(testCaseResults),
        },
      });

      if (infrastructureFailed)
        throw new Error(
          'Execution provider unavailable. Code saved; retry grading after recovery.',
        );
      // Update question junction status to completed
      await prisma.interviewQuestion.updateMany({
        where: { interviewId, questionId },
        data: { status: 'completed' },
      });

      const broadcastData = {
        submissionId: submission.id,
        questionId,
        score,
        passedCount,
        totalCount: question.testCases.length,
        results: testCaseResults,
        submittedBy: socket.data.user?.name || role,
      };

      // Broadcast to both candidate and interviewer (emits both event names)
      io.to(room).emit(INTERVIEW_EVENTS.CODE_SUBMITTED, broadcastData);
      io.to(room).emit('SUBMIT_CODE', broadcastData);

      await recordInterviewEvent(
        interviewId,
        INTERVIEW_EVENTS.CODE_SUBMITTED,
        role,
        {
          submissionId: submission.id,
          score,
        },
      );

      if (typeof callback === 'function') {
        callback({
          success: true,
          submissionId: submission.id,
          score,
          passedCount,
          totalCount: question.testCases.length,
          results: testCaseResults,
        });
      }
    } catch (err: any) {
      console.error('[Socket] SUBMIT_CODE error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, {
        message: err.message || 'Submission failed',
      });
      if (typeof callback === 'function')
        callback({ success: false, error: err.message });
    }
  };

  socket.on(INTERVIEW_EVENTS.SUBMIT_CODE, handleSubmitCode);
  socket.on('CODE_SUBMITTED', handleSubmitCode);

  // 7. ADD_NOTE (Interviewer Evaluation)
  socket.on(
    INTERVIEW_EVENTS.ADD_NOTE,
    async (payload: AddNotePayload, callback?: any) => {
      try {
        const interviewId = socket.data.user?.interviewId;
        const authorId = socket.data.user?.userId;

        if (!interviewId) return;

        if (socket.data.user?.role !== 'interviewer' || !authorId) {
          socket.emit(INTERVIEW_EVENTS.ERROR, {
            message: 'Only interviewers can record interview notes',
          });
          if (typeof callback === 'function')
            callback({
              success: false,
              error: 'Only interviewers can record notes',
            });
          return;
        }

        if (!payload?.content?.trim()) {
          socket.emit(INTERVIEW_EVENTS.ERROR, {
            message: 'Note content cannot be empty',
          });
          if (typeof callback === 'function')
            callback({ success: false, error: 'Note content cannot be empty' });
          return;
        }

        const note = await prisma.interviewNote.create({
          data: {
            interviewId,
            authorId,
            category: payload.category || 'general',
            rating:
              payload.rating !== undefined ? Number(payload.rating) : null,
            content: payload.content.trim(),
            isPrivate: payload.isPrivate ?? true,
          },
          include: {
            author: { select: { id: true, name: true } },
          },
        });

        const room = getInterviewRoom(interviewId);

        // If private, broadcast only to other interviewer sockets in the room
        if (note.isPrivate) {
          io.to(`private:interview:${interviewId}:user:${authorId}`).emit(
            INTERVIEW_EVENTS.NOTE_ADDED,
            note,
          );
        } else {
          io.to(room).emit(INTERVIEW_EVENTS.NOTE_ADDED, note);
        }

        await recordInterviewEvent(
          interviewId,
          INTERVIEW_EVENTS.NOTE_ADDED,
          'interviewer',
          {
            noteId: note.id,
            category: note.category,
          },
        );

        if (typeof callback === 'function') {
          callback({ success: true, note });
        }
      } catch (err: any) {
        console.error('[Socket] ADD_NOTE error:', err);
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message });
        if (typeof callback === 'function')
          callback({ success: false, error: err.message });
      }
    },
  );

  // 8. END_INTERVIEW
  socket.on(INTERVIEW_EVENTS.END_INTERVIEW, async (callback?: any) => {
    try {
      const interviewId = socket.data.user?.interviewId;
      if (!interviewId) return;

      if (socket.data.user?.role !== 'interviewer') {
        socket.emit(INTERVIEW_EVENTS.ERROR, {
          message: 'Only interviewers can conclude the interview',
        });
        if (typeof callback === 'function')
          callback({
            success: false,
            error: 'Only interviewers can conclude interview',
          });
        return;
      }

      // Flush any pending code to DB
      await flushCodeToDb(interviewId);

      const state = await prisma.interview.findUniqueOrThrow({
        where: { id: interviewId },
      });
      if (state.status !== 'in_progress')
        throw new Error('Only active interviews can be ended');
      const endedAt = new Date();
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: 'completed',
          endedAt,
        },
      });

      const room = getInterviewRoom(interviewId);
      io.to(room).emit(INTERVIEW_EVENTS.INTERVIEW_ENDED, {
        endedAt: endedAt.toISOString(),
      });

      await recordInterviewEvent(
        interviewId,
        INTERVIEW_EVENTS.INTERVIEW_ENDED,
        'interviewer',
        {
          endedAt: endedAt.toISOString(),
        },
      );

      if (typeof callback === 'function') {
        callback({
          success: true,
          status: 'completed',
          endedAt: endedAt.toISOString(),
        });
      }
    } catch (err: any) {
      console.error('[Socket] END_INTERVIEW error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message });
      if (typeof callback === 'function')
        callback({ success: false, error: err.message });
    }
  });

  // 9. Disconnect cleanup
  socket.on('disconnect', async () => {
    try {
      const interviewId = socket.data.user?.interviewId;
      const sessionId = socket.data.sessionId;

      if (sessionId) {
        await prisma.interviewSession.updateMany({
          where: { id: sessionId },
          data: { disconnectedAt: new Date() },
        });
      }

      if (interviewId) {
        const socketIds = roomSocketsMap.get(interviewId);
        if (socketIds) {
          socketIds.delete(socket.id);
          if (socketIds.size === 0) {
            // Flush code if last user left
            await flushCodeToDb(interviewId);
            roomSocketsMap.delete(interviewId);
          }
        }
      }
    } catch (err) {
      console.error('[Socket] Disconnect cleanup error:', err);
    }
  });
}

function INTERVIEWER_JOINED_EVENT(role: string): string {
  return role === 'interviewer'
    ? INTERVIEW_EVENTS.INTERVIEWER_JOINED
    : 'PARTICIPANT_JOINED';
}
