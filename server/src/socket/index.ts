import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { AuthUser } from '../middleware/auth';
import { registerInterviewHandlers } from './interview-handler';
import { SocketUser } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // Authentication Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const query = socket.handshake.query || {};
      const headers = socket.handshake.headers || {};

      // 1. Extract Bearer / Access Token (supports auth object, query param, or headers)
      const authHeader = (headers.authorization as string) || '';
      const token =
        (auth.token as string) ||
        (query.token as string) ||
        (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null) ||
        (headers['x-access-token'] as string) ||
        (headers['token'] as string) ||
        null;

      // 2. Extract Room Token (supports auth object, query param, or headers)
      const roomToken =
        (auth.roomToken as string) ||
        (query.roomToken as string) ||
        (headers['x-room-token'] as string) ||
        (headers['roomtoken'] as string) ||
        null;

      // 3. Extract Interview ID & Candidate Name
      const rawInterviewId = auth.interviewId || query.interviewId || headers['x-interview-id'];
      const interviewId = rawInterviewId ? Number(rawInterviewId) : undefined;
      const rawCandidateName =
        (auth.candidateName as string) ||
        (query.candidateName as string) ||
        (headers['x-candidate-name'] as string) ||
        null;

      // Case A: Authenticated JWT User (Interviewer or logged-in Candidate)
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
          const user: SocketUser = {
            role: decoded.role === 'admin' ? 'interviewer' : 'candidate',
            name: decoded.name,
            userId: decoded.id,
            email: decoded.email,
            interviewId: interviewId || 0,
            roomToken: roomToken || undefined,
          };
          socket.data.user = user;
          return next();
        } catch {
          // Token invalid, fall through to check roomToken
        }
      }

      // Case B: Candidate joining via unique room link / token
      if (roomToken) {
        const interview = await prisma.interview.findUnique({
          where: { roomToken },
          select: { id: true, candidateName: true, candidateEmail: true },
        });

        if (interview) {
          const candidateName = rawCandidateName || interview.candidateName;
          const user: SocketUser = {
            role: 'candidate',
            name: candidateName,
            interviewId: interview.id,
            roomToken,
            email: interview.candidateEmail,
          };
          socket.data.user = user;
          return next();
        }
      }

      // Case C: Fallback socket (authenticates later in JOIN_INTERVIEW event)
      socket.data.user = {
        role: 'candidate',
        name: rawCandidateName || 'Candidate',
        interviewId: interviewId || 0,
        roomToken: roomToken || undefined,
      };
      next();
    } catch (err: any) {
      console.error('[Socket] Auth middleware error:', err);
      next(new Error('Socket authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    if (user && user.interviewId > 0) {
      const room = `room:interview:${user.interviewId}`;
      socket.join(room);
      console.log(`[Socket] Auto-joined ${user.name} (${user.role}) to ${room} on connection`);
    }
    registerInterviewHandlers(io!, socket);
  });

  console.log('⚡ Socket.IO initialized for real-time interview collaboration');
  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocketServer first.');
  }
  return io;
}
