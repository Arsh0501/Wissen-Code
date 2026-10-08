import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import prisma from './prisma';

export interface ChatMessagePayload {
  id: string;
  sessionId: number;
  sender: string;
  senderRole: 'interviewer' | 'candidate';
  text: string;
  timestamp: string;
  type?: 'text' | 'question_card';
  questionId?: number;
  title?: string;
  difficulty?: string;
}

export interface CodeChangePayload {
  sessionId: number;
  questionId: number;
  sourceCode: string;
}

export interface CodeExecutedPayload {
  sessionId: number;
  questionId: number;
  languageId: number;
  status: string;
  isError: boolean;
  executionTime?: string;
}

export interface CodeSubmittedPayload {
  sessionId: number;
  questionId: number;
  language: string;
  sourceCode: string;
  submittedAt: string;
}

export interface QuestionOpenedPayload {
  sessionId: number;
  questionId: number;
  title: string;
  difficulty: string;
}

export function setupSocketIO(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    let currentRoom: string | null = null;
    let userRole: 'interviewer' | 'candidate' = 'candidate';

    // Join room convention: "interview:<sessionId>"
    socket.on('JOIN_INTERVIEW', (data: { sessionId: number; role?: 'interviewer' | 'candidate'; name?: string }) => {
      const room = `interview:${data.sessionId}`;
      currentRoom = room;
      if (data.role) userRole = data.role;

      socket.join(room);
      console.log(`[Socket.IO] ${data.name || 'User'} (${userRole}) joined room ${room}`);

      // Notify other participants in the room
      socket.to(room).emit('PARTICIPANT_JOINED', {
        role: userRole,
        name: data.name,
        joinedAt: new Date().toISOString(),
      });
    });

    // Candidate started interview
    socket.on('INTERVIEW_STARTED', (data: { sessionId: number; candidateName: string }) => {
      const room = `interview:${data.sessionId}`;
      socket.to(room).emit('INTERVIEW_STARTED', {
        ...data,
        startedAt: new Date().toISOString(),
      });
    });

    // Real-time code visibility: one-directional to interviewer
    socket.on('CODE_CHANGED', (data: CodeChangePayload) => {
      const room = `interview:${data.sessionId}`;
      socket.to(room).emit('CODE_CHANGED', data);
    });

    // Candidate ran code in editor
    socket.on('CODE_EXECUTED', (data: CodeExecutedPayload) => {
      const room = `interview:${data.sessionId}`;
      socket.to(room).emit('CODE_EXECUTED', data);
    });

    // Candidate submitted code snapshot
    socket.on('CODE_SUBMITTED', (data: CodeSubmittedPayload) => {
      const room = `interview:${data.sessionId}`;
      socket.to(room).emit('CODE_SUBMITTED', data);
    });

    // Chat message (plain text or structured question_card)
    socket.on('CHAT_MESSAGE', (data: ChatMessagePayload) => {
      const room = `interview:${data.sessionId}`;
      // Broadcast to EVERYONE in the room including sender or just others (we emit to everyone in room)
      io.in(room).emit('CHAT_MESSAGE', data);
    });

    // Interviewer opened a question
    socket.on('QUESTION_OPENED', async (data: QuestionOpenedPayload) => {
      const room = `interview:${data.sessionId}`;
      try {
        await prisma.interviewSession.update({
          where: { id: data.sessionId },
          data: { currentQuestionId: data.questionId },
        });
      } catch (err) {
        console.error('[Socket.IO] Failed to update currentQuestionId:', err);
      }
      socket.to(room).emit('QUESTION_OPENED', data);
    });

    // Candidate reconnected
    socket.on('CANDIDATE_RECONNECTED', (data: { sessionId: number; candidateName: string }) => {
      const room = `interview:${data.sessionId}`;
      socket.to(room).emit('CANDIDATE_RECONNECTED', {
        ...data,
        reconnectedAt: new Date().toISOString(),
      });
    });


    // Interview ended
    socket.on('INTERVIEW_ENDED', (data: { sessionId: number; reason?: string }) => {
      const room = `interview:${data.sessionId}`;
      io.in(room).emit('INTERVIEW_ENDED', {
        ...data,
        endedAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      if (currentRoom) {
        socket.to(currentRoom).emit('PARTICIPANT_DISCONNECTED', {
          role: userRole,
          disconnectedAt: new Date().toISOString(),
        });
        console.log(`[Socket.IO] Participant (${userRole}) disconnected from ${currentRoom}`);
      }
    });
  });

  return io;
}
