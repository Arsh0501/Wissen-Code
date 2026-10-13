import { Server, Socket } from 'socket.io';
import prisma from '../prisma';
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
export async function flushCodeToDb(interviewId: number) {
  const cache = codeDebounceMap.get(interviewId);
  if (cache) {
    if (cache.timer) {
      clearTimeout(cache.timer);
      cache.timer = null;
    }
    try {
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          currentCode: cache.code,
          currentLanguageId: cache.languageId,
        },
      });
    } catch (err) {
      console.error(`[Socket] Failed to flush code for interview ${interviewId}:`, err);
    }
  }
}

/**
 * Schedule a debounced update to the database (2000ms)
 */
function scheduleCodeSave(interviewId: number, code: string, languageId: number) {
  let cache = codeDebounceMap.get(interviewId);
  if (!cache) {
    cache = { code, languageId, timer: null };
    codeDebounceMap.set(interviewId, cache);
  } else {
    cache.code = code;
    cache.languageId = languageId;
  }

  if (cache.timer) {
    clearTimeout(cache.timer);
  }

  cache.timer = setTimeout(async () => {
    cache!.timer = null;
    try {
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          currentCode: code,
          currentLanguageId: languageId,
        },
      });
    } catch (err) {
      console.error(`[Socket] Debounced code save error for interview ${interviewId}:`, err);
    }
  }, 2000);
}

/**
 * Helper to log interview event to DB
 */
async function recordInterviewEvent(
  interviewId: number,
  eventType: string,
  actorRole: 'interviewer' | 'candidate' | 'system',
  payload: Record<string, any>
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
  } catch (err) {
    console.error(`[Socket] Error logging event ${eventType}:`, err);
  }
}

export function registerInterviewHandlers(io: Server, socket: Socket) {
  const user = socket.data.user as SocketUser | undefined;

  // ─────────────────────────────────────────────────────────────────
  // 1. JOIN_INTERVIEW
  // ─────────────────────────────────────────────────────────────────
  socket.on(INTERVIEW_EVENTS.JOIN_INTERVIEW, async (rawPayload: any, callback?: any) => {
    try {
      const payload: JoinInterviewPayload =
        typeof rawPayload === 'string'
          ? (() => { try { return JSON.parse(rawPayload); } catch { return {}; } })()
          : rawPayload || {};

      let interviewId = payload?.interviewId || user?.interviewId;
      const roomToken = payload?.roomToken || user?.roomToken;

      let interview = null;
      if (roomToken) {
        interview = await prisma.interview.findUnique({
          where: { roomToken },
          include: {
            currentQuestion: {
              include: { starterCodes: true, testCases: { where: { isSample: true } } },
            },
            questions: {
              include: {
                question: { select: { id: true, title: true, difficulty: true } },
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
              include: { starterCodes: true, testCases: { where: { isSample: true } } },
            },
            questions: {
              include: {
                question: { select: { id: true, title: true, difficulty: true } },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        });
      }

      if (!interview) {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Interview room not found' });
        return;
      }

      interviewId = interview.id;
      const role = user?.role || 'candidate';
      const participantName =
        payload?.candidateName || user?.name || (role === 'candidate' ? interview.candidateName : 'Interviewer');

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

      // Track connection in memory
      if (!roomSocketsMap.has(interviewId)) {
        roomSocketsMap.set(interviewId, new Set());
      }
      roomSocketsMap.get(interviewId)!.add(socket.id);

      // Record session in database
      const ipAddress = (socket.handshake.headers['x-forwarded-for'] as string) || socket.handshake.address;
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

      // Broadcast join event
      const joinEventName =
        role === 'candidate' ? INTERVIEW_EVENTS.CANDIDATE_JOINED : INTERVIEWER_JOINED_EVENT(role);

      io.to(room).emit(joinEventName, {
        participantName,
        role,
        timestamp: new Date().toISOString(),
      });

      await recordInterviewEvent(interviewId, joinEventName, role, {
        participantName,
        socketId: socket.id,
      });

      // Send initial state back to the connected user
      // If there is an in-memory cached code, serve that; otherwise serve DB code
      const cached = codeDebounceMap.get(interviewId);
      const activeCode = cached?.code !== undefined ? cached.code : interview.currentCode;
      const activeLangId = cached?.languageId || interview.currentLanguageId;

      const syncState = {
        interviewId: interview.id,
        title: interview.title,
        status: interview.status,
        startedAt: interview.startedAt?.toISOString() || null,
        endedAt: interview.endedAt?.toISOString() || null,
        currentQuestionId: interview.currentQuestionId,
        currentQuestion: interview.currentQuestion,
        questions: interview.questions,
        currentCode: activeCode,
        currentLanguageId: activeLangId,
        timeLimitMinutes: interview.timeLimitMinutes,
        role,
        participantName,
      };

      socket.emit(INTERVIEW_EVENTS.SYNC_STATE, syncState);

      if (typeof callback === 'function') {
        callback({ success: true, event: 'JOIN_INTERVIEW', syncState });
      }

      console.log(`[Socket] ${participantName} (${role}) joined ${room}`);
    } catch (err: any) {
      console.error('[Socket] JOIN_INTERVIEW error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message || 'Failed to join interview' });
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message || 'Failed to join interview' });
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. START_INTERVIEW
  // ─────────────────────────────────────────────────────────────────
  socket.on(INTERVIEW_EVENTS.START_INTERVIEW, async (callback?: any) => {
    try {
      const interviewId = socket.data.user?.interviewId;
      if (!interviewId) return;

      if (socket.data.user?.role !== 'interviewer') {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Only interviewers can start the interview' });
        if (typeof callback === 'function') callback({ success: false, error: 'Only interviewers can start the interview' });
        return;
      }

      const startedAt = new Date();
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

      await recordInterviewEvent(interviewId, INTERVIEW_EVENTS.INTERVIEW_STARTED, 'interviewer', {
        startedAt: startedAt.toISOString(),
      });

      if (typeof callback === 'function') {
        callback({ success: true, status: 'in_progress', startedAt: startedAt.toISOString() });
      }
    } catch (err: any) {
      console.error('[Socket] START_INTERVIEW error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message });
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. CHANGE_QUESTION
  // ─────────────────────────────────────────────────────────────────
  socket.on(INTERVIEW_EVENTS.CHANGE_QUESTION, async (payload: ChangeQuestionPayload, callback?: any) => {
    try {
      const interviewId = socket.data.user?.interviewId;
      if (!interviewId || !payload?.questionId) return;

      if (socket.data.user?.role !== 'interviewer') {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Only interviewers can switch the active question' });
        if (typeof callback === 'function') callback({ success: false, error: 'Only interviewers can switch question' });
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
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Question not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Question not found' });
        return;
      }

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

      const langId = interview?.currentLanguageId || 71;
      const starter = question.starterCodes.find((sc) => sc.languageId === langId);
      const starterCode = starter ? starter.code : '';

      // Update currentQuestionId and starter code in DB
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          currentQuestionId: question.id,
          currentCode: starterCode,
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
        question,
        starterCode,
        languageId: langId,
        timestamp: new Date().toISOString(),
      });

      await recordInterviewEvent(interviewId, INTERVIEW_EVENTS.QUESTION_CHANGED, 'interviewer', {
        questionId: question.id,
        questionTitle: question.title,
      });

      if (typeof callback === 'function') {
        callback({ success: true, questionId: question.id, question, starterCode });
      }
    } catch (err: any) {
      console.error('[Socket] CHANGE_QUESTION error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message });
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. UPDATE_CODE (Collaborative Dual-Editing)
  // ─────────────────────────────────────────────────────────────────
  const handleUpdateCode = (rawPayload: any, callback?: any) => {
    try {
      const payload: UpdateCodePayload & { interviewId?: number } =
        typeof rawPayload === 'string'
          ? (() => { try { return JSON.parse(rawPayload); } catch { return { code: rawPayload }; } })()
          : rawPayload || {};

      const interviewId = payload?.interviewId || socket.data.user?.interviewId;
      if (!interviewId || typeof payload?.code !== 'string') {
        if (typeof callback === 'function') callback({ success: false, error: 'Missing interviewId or code string' });
        return;
      }

      const role = socket.data.user?.role || 'candidate';
      const name = socket.data.user?.name || 'Anonymous';
      const languageId = payload.languageId || 71;

      // Ensure socket is in the interview room
      const room = getInterviewRoom(interviewId);
      socket.join(room);

      const broadcastData = {
        code: payload.code,
        languageId,
        authorRole: role,
        authorName: name,
        cursorPosition: payload.cursorPosition,
        timestamp: Date.now(),
      };

      // Broadcast to everyone else in the room (emits both event names for convenience)
      socket.to(room).emit(INTERVIEW_EVENTS.CODE_CHANGED, broadcastData);
      socket.to(room).emit('UPDATE_CODE', broadcastData);

      // Schedule debounced database update (throttled to 2 seconds)
      scheduleCodeSave(interviewId, payload.code, languageId);

      if (typeof callback === 'function') {
        callback({ success: true, broadcasted: true, timestamp: Date.now() });
      }
    } catch (err: any) {
      console.error('[Socket] UPDATE_CODE error:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  };

  socket.on(INTERVIEW_EVENTS.UPDATE_CODE, handleUpdateCode);
  socket.on('CODE_CHANGED', handleUpdateCode);

  // ─────────────────────────────────────────────────────────────────
  // 5. EXECUTE_CODE (Judge0 Test / Run)
  // ─────────────────────────────────────────────────────────────────
  const handleExecuteCode = async (rawPayload: any, callback?: any) => {
    try {
      const payload: ExecuteCodePayload & { interviewId?: number } =
        typeof rawPayload === 'string'
          ? (() => { try { return JSON.parse(rawPayload); } catch { return {}; } })()
          : rawPayload || {};

      const interviewId = payload?.interviewId || socket.data.user?.interviewId;
      if (!interviewId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Missing interviewId' });
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
        if (typeof callback === 'function') callback({ success: false, error: 'Interview not found' });
        return;
      }

      const code = payload?.code || interview.currentCode;
      const languageId = payload?.languageId || interview.currentLanguageId;
      const stdin = payload?.stdin || interview.currentQuestion?.testCases[0]?.input || '';
      const expectedOutput = interview.currentQuestion?.testCases[0]?.expectedOutput || undefined;

      const role = socket.data.user?.role || 'candidate';

      // Notify room that execution started
      io.to(room).emit('CODE_EXECUTING', {
        triggeredBy: socket.data.user?.name || role,
      });

      // Execute through Judge0
      const result: Judge0Result = await executeCode({
        sourceCode: code,
        languageId,
        stdin,
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

      await recordInterviewEvent(interviewId, INTERVIEW_EVENTS.CODE_EXECUTED, role, {
        status: result.status.description,
        time: result.time,
      });

      if (typeof callback === 'function') {
        callback({ success: true, result });
      }
    } catch (err: any) {
      console.error('[Socket] EXECUTE_CODE error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message || 'Execution failed' });
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  };

  socket.on(INTERVIEW_EVENTS.EXECUTE_CODE, handleExecuteCode);
  socket.on('CODE_EXECUTED', handleExecuteCode);

  // ─────────────────────────────────────────────────────────────────
  // 6. SUBMIT_CODE (Full grading against all test cases)
  // ─────────────────────────────────────────────────────────────────
  const handleSubmitCode = async (rawPayload: any, callback?: any) => {
    try {
      const payload: SubmitCodePayload & { interviewId?: number } =
        typeof rawPayload === 'string'
          ? (() => { try { return JSON.parse(rawPayload); } catch { return {}; } })()
          : rawPayload || {};

      const interviewId = payload?.interviewId || socket.data.user?.interviewId;
      if (!interviewId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Missing interviewId' });
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
        if (typeof callback === 'function') callback({ success: false, error: 'Interview not found' });
        return;
      }

      const questionId = payload?.questionId || interview.currentQuestionId;
      if (!questionId) {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'No active question to submit for' });
        if (typeof callback === 'function') callback({ success: false, error: 'No active question' });
        return;
      }

      const code = payload?.code || interview.currentCode || '';
      const languageId = payload?.languageId || interview.currentLanguageId || 71;

      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: { testCases: true },
      });

      if (!question) {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Question not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Question not found' });
        return;
      }

      const role = socket.data.user?.role || 'candidate';

      io.to(room).emit('CODE_SUBMITTING', {
        submittedBy: socket.data.user?.name || role,
      });

      // Grade against ALL test cases
      let passedCount = 0;
      const testCaseResults = [];

      for (const tc of question.testCases) {
        try {
          const res = await executeCode({
            sourceCode: code,
            languageId,
            stdin: tc.input,
            expectedOutput: tc.expectedOutput,
            cpuTimeLimit: question.timeLimit,
            memoryLimit: question.memoryLimit,
          });

          const actual = (res.stdout || '').trim();
          const passed = res.status.id === 3 && actual === tc.expectedOutput.trim();
          if (passed) passedCount++;

          testCaseResults.push({
            testCaseId: tc.id,
            isSample: tc.isSample,
            passed,
            statusDesc: passed ? 'Accepted' : res.status.id === 3 ? 'Wrong Answer' : res.status.description,
            executionTime: res.time ? parseFloat(res.time) : null,
          });
        } catch (execErr: any) {
          testCaseResults.push({
            testCaseId: tc.id,
            isSample: tc.isSample,
            passed: false,
            statusDesc: 'Execution Error',
          });
        }
      }

      const score = question.testCases.length > 0 ? (passedCount / question.testCases.length) * 100 : 0;

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
          status: 'graded',
          results: JSON.stringify(testCaseResults),
        },
      });

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

      await recordInterviewEvent(interviewId, INTERVIEW_EVENTS.CODE_SUBMITTED, role, {
        submissionId: submission.id,
        score,
      });

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
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message || 'Submission failed' });
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  };

  socket.on(INTERVIEW_EVENTS.SUBMIT_CODE, handleSubmitCode);
  socket.on('CODE_SUBMITTED', handleSubmitCode);

  // ─────────────────────────────────────────────────────────────────
  // 7. ADD_NOTE (Interviewer Evaluation)
  // ─────────────────────────────────────────────────────────────────
  socket.on(INTERVIEW_EVENTS.ADD_NOTE, async (payload: AddNotePayload, callback?: any) => {
    try {
      const interviewId = socket.data.user?.interviewId;
      const authorId = socket.data.user?.userId;

      if (!interviewId) return;

      if (socket.data.user?.role !== 'interviewer' || !authorId) {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Only interviewers can record interview notes' });
        if (typeof callback === 'function') callback({ success: false, error: 'Only interviewers can record notes' });
        return;
      }

      if (!payload?.content?.trim()) {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Note content cannot be empty' });
        if (typeof callback === 'function') callback({ success: false, error: 'Note content cannot be empty' });
        return;
      }

      const note = await prisma.interviewNote.create({
        data: {
          interviewId,
          authorId,
          category: payload.category || 'general',
          rating: payload.rating !== undefined ? Number(payload.rating) : null,
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
        socket.emit(INTERVIEW_EVENTS.NOTE_ADDED, note);
        const socketIds = roomSocketsMap.get(interviewId);
        if (socketIds) {
          for (const sId of socketIds) {
            if (sId !== socket.id) {
              const targetSocket = io.sockets.sockets.get(sId);
              if (targetSocket?.data.user?.role === 'interviewer') {
                targetSocket.emit(INTERVIEW_EVENTS.NOTE_ADDED, note);
              }
            }
          }
        }
      } else {
        io.to(room).emit(INTERVIEW_EVENTS.NOTE_ADDED, note);
      }

      await recordInterviewEvent(interviewId, INTERVIEW_EVENTS.NOTE_ADDED, 'interviewer', {
        noteId: note.id,
        category: note.category,
      });

      if (typeof callback === 'function') {
        callback({ success: true, note });
      }
    } catch (err: any) {
      console.error('[Socket] ADD_NOTE error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message });
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 8. END_INTERVIEW
  // ─────────────────────────────────────────────────────────────────
  socket.on(INTERVIEW_EVENTS.END_INTERVIEW, async (callback?: any) => {
    try {
      const interviewId = socket.data.user?.interviewId;
      if (!interviewId) return;

      if (socket.data.user?.role !== 'interviewer') {
        socket.emit(INTERVIEW_EVENTS.ERROR, { message: 'Only interviewers can conclude the interview' });
        if (typeof callback === 'function') callback({ success: false, error: 'Only interviewers can conclude interview' });
        return;
      }

      // Flush any pending code to DB
      await flushCodeToDb(interviewId);

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

      await recordInterviewEvent(interviewId, INTERVIEW_EVENTS.INTERVIEW_ENDED, 'interviewer', {
        endedAt: endedAt.toISOString(),
      });

      if (typeof callback === 'function') {
        callback({ success: true, status: 'completed', endedAt: endedAt.toISOString() });
      }
    } catch (err: any) {
      console.error('[Socket] END_INTERVIEW error:', err);
      socket.emit(INTERVIEW_EVENTS.ERROR, { message: err.message });
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 9. Disconnect cleanup
  // ─────────────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      const interviewId = socket.data.user?.interviewId;
      const sessionId = socket.data.sessionId;

      if (sessionId) {
        await prisma.interviewSession.update({
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
  return role === 'interviewer' ? INTERVIEW_EVENTS.INTERVIEWER_JOINED : 'PARTICIPANT_JOINED';
}
