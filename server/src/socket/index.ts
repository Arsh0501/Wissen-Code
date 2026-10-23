import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import prisma from '../prisma';
import { verifyAccessToken } from '../middleware/auth';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisConnection } from '../ai/queue';
import { subscribeAIResults } from '../ai/realtime';
import { registerInterviewHandlers } from './interview-handler';
import { SocketUser } from './types';
import { enforceInterviewDeadlines, setInterviewDeadlineNotifier } from '../services/interview-expiry';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (
        process.env.CORS_ORIGINS ||
        'http://localhost:5173,http://localhost:3000'
      )
        .split(',')
        .map((v) => v.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 150000,
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  if (process.env.REDIS_URL) {
    const pub = redisConnection(true);
    const sub = pub.duplicate();
    void Promise.all([pub.connect(), sub.connect()])
      .then(() => io!.adapter(createAdapter(pub, sub)))
      .catch((error) => console.error('Socket Redis adapter:', error.message));
  }

  subscribeAIResults(io);
  setInterviewDeadlineNotifier((id, endedAt) => {
    io?.to(`room:interview:${id}`).emit('INTERVIEW_ENDED', { endedAt, reason: 'duration_elapsed' });
  });
  const deadlineTimer = setInterval(() => {
    void enforceInterviewDeadlines().catch((error) => console.error('Interview deadline check:', error.message));
  }, 15000);
  deadlineTimer.unref();
  httpServer.once('close', () => clearInterval(deadlineTimer));

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
      const rawInterviewId =
        auth.interviewId || query.interviewId || headers['x-interview-id'];
      const interviewId = rawInterviewId ? Number(rawInterviewId) : undefined;
      const rawCandidateName =
        (auth.candidateName as string) ||
        (query.candidateName as string) ||
        (headers['x-candidate-name'] as string) ||
        null;

      // Case A: Authenticated JWT User (Interviewer or logged-in Candidate)
      if (token) {
        try {
          const decoded = await verifyAccessToken(token);
          socket.data.accessToken = token;
          socket.data.authSessionId = decoded.sessionId;
          if (
            decoded.sessionId &&
            !(await prisma.userSession.findFirst({
              where: {
                id: decoded.sessionId,
                userId: decoded.id,
                expiresAt: { gt: new Date() },
              },
            }))
          )
            throw new Error('Session expired');
          const user: SocketUser = {
            role: decoded.role === 'admin' || decoded.role === 'interviewer' ? 'interviewer' : 'candidate',
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

      return next(
        new Error('A valid access token or interview room token is required'),
      );
    } catch (err: any) {
      console.error('[Socket] Auth middleware error:', err);
      next(new Error('Socket authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    // Joining an interview room requires ownership checks in JOIN_INTERVIEW.
    socket.use(async (_packet, next) => {
      if (!socket.data.accessToken) return next();
      try {
        await verifyAccessToken(socket.data.accessToken);
        next();
      } catch {
        next(new Error('Session expired or revoked'));
        socket.disconnect(true);
      }
    });
    if (socket.data.user?.userId)
      socket.join(`auth:user:${socket.data.user.userId}`);
    if (socket.data.authSessionId)
      socket.join(`auth:session:${socket.data.authSessionId}`);
    if (user?.role === 'interviewer')
      socket.join(`private:user:${user.userId}`);
    registerInterviewHandlers(io!, socket);
  });

  console.log('⚡ Socket.IO initialized for real-time interview collaboration');
  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error(
      'Socket.IO has not been initialized. Call initSocketServer first.',
    );
  }
  return io;
}
