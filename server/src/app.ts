import './config/environment';
import { errorHandler } from './middleware/errorHandler';
import { measureRequest, readiness, metrics } from './platform/monitoring';
import ssoRoutes from './platform/sso';
import { staffPermissions, ownerOnly } from './platform/permissions';
import platformRoutes from './platform/routes';
import accountRoutes from './platform/account-routes';
import { randomUUID } from 'node:crypto';
import { candidatePayload } from './platform/questions';
import aiWorkflowRoutes from './routes/ai-workflows';
import interviewWorkflowRoutes from './routes/interview-workflows';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import aiJobRoutes from './routes/ai-jobs';
import userRoutes from './routes/users';
import { adminOnly } from './middleware/adminOnly';
import cors from 'cors';
import questionRoutes from './routes/questions';
import assessmentRoutes from './routes/assessments';
import judgeRoutes from './routes/judge';
import submissionRoutes from './routes/submissions';
import attemptRoutes from './routes/attempts';
import candidateRoutes from './routes/candidates';
import adminReportRoutes from './routes/admin-reports';
import adminQuestionRoutes from './routes/admin-questions';
import { adminInviteRoutes, publicInviteRoutes } from './routes/invites';
import authRoutes from './routes/auth';
import interviewRoutes, {
  handleJoinRoom,
  handleSaveRoomAnswer,
} from './routes/interviews';
import { authenticate } from './middleware/auth';
import { isMockMode } from './services/judge0';

const app = express();

// Middleware
app.use(measureRequest);
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Request-Id', randomUUID());
  const start = Date.now();
  res.once('finish', () => {
    if (process.env.NODE_ENV === 'production')
      console.log(
        JSON.stringify({
          method: req.method,
          status: res.statusCode,
          durationMs: Date.now() - start,
          requestId: res.getHeader('X-Request-Id'),
        }),
      );
  });
  next();
});
app.use(helmet());
// Hundreds of candidates often share one public IP (office / campus NAT), so the
// per-IP ceiling is high; brute force is throttled per account below instead.
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 60000,
    limit: Number(process.env.AUTH_RATE_LIMIT_PER_IP || 600),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  cors({
    origin: (
      process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000'
    )
      .split(',')
      .map((v) => v.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));

// Health check (public)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    judgeMode: isMockMode() ? 'mock' : 'live',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ready', readiness);
app.get('/api/metrics', metrics);

// Auth & Profile routes (register/login are public; /me & /profile require a token internally)
app.use('/api/auth/sso', ssoRoutes);
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 60000,
    limit: Number(process.env.AUTH_RATE_LIMIT_PER_ACCOUNT || 20),
    keyGenerator: (req) =>
      `account:${String(req.body?.email || '').trim().toLowerCase()}`,
    skip: (req) => typeof req.body?.email !== 'string' || !req.body.email,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts for this account. Try again in a minute.' },
  }),
);
app.use('/api/auth', accountRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', authRoutes);

// Public Candidate routes (no account required)
app.use('/api/public/invite', publicInviteRoutes);
app.get('/api/public/interview/:roomToken', handleJoinRoom);
app.put('/api/public/interview/:roomToken/answer', handleSaveRoomAnswer);
app.get('/api/interviews/room/:roomToken', handleJoinRoom);

// Everything below requires a valid Bearer token
app.use('/api', authenticate);
app.use('/api', staffPermissions);
app.use('/api', (req, res, next) => {
  const path = req.path;
  if (
    req.user?.role === 'admin' &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    /^\/(questions|assessments|interviews|invites|users|interview-workflows)(\/|$)/.test(
      path,
    )
  ) {
    const actorId = req.user.id;
    res.once('finish', () => {
      if (res.statusCode < 400)
        void import('./platform/routes')
          .then(({ audit }) =>
            audit(
              actorId,
              `${req.method.toLowerCase()}.succeeded`,
              path.split('/')[1],
              path.split('/')[2] ?? 'collection',
              { status: res.statusCode },
            ),
          )
          .catch((error) =>
            console.error('Audit write failed:', error.message),
          );
    });
  }
  next();
});
app.use('/api', (req, res, next) => {
  if (req.user?.role !== 'admin') {
    const json = res.json.bind(res);
    res.json = ((body: unknown) =>
      json(candidatePayload(body))) as typeof res.json;
  }
  next();
});

// Routes
app.use('/api/platform', platformRoutes);
app.use('/api/users', userRoutes);
app.get('/api/roles', adminOnly, ownerOnly, (_req, res) =>
  res.json(['admin', 'recruiter', 'interviewer', 'candidate']),
);
app.use('/api/questions', questionRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use(
  '/api/judge',
  rateLimit({
    windowMs: 60000,
    limit: 30,
    keyGenerator: (req) => String(req.user!.id),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use('/api/judge', judgeRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/questions', adminQuestionRoutes);
app.use('/api/invites', adminInviteRoutes);
app.use('/api/ai/jobs', aiJobRoutes);
app.use('/api/ai', aiWorkflowRoutes);
app.use('/api/interview-workflows', interviewWorkflowRoutes);
app.use('/api/agents', adminOnly, (_req, res) =>
  res.status(410).json({
    error:
      'Legacy AI endpoints are retired. Use /api/ai or /api/ai/jobs with validation and approval.',
  }),
);
app.use('/api/interviews', interviewRoutes);

app.use((_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use(errorHandler);

export default app;
