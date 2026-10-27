import 'dotenv/config';
import { measureRequest, readiness, metrics } from './platform/observability/monitoring';
import ssoRoutes from './routes/auth/sso';
import { staffPermissions, ownerOnly } from './platform/auth/permissions';
import platformRoutes from './routes/system';
import accountRoutes from './routes/auth/account';
import { randomUUID } from 'node:crypto';
import { candidatePayload } from './services/questions/candidate-payload';
import http from 'http';
import { ZodError } from 'zod';
import aiWorkflowRoutes from './routes/ai-workflows';
import interviewWorkflowRoutes from './routes/interview-workflows';
import { WorkflowError } from './services/ai/structured-ai';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import aiJobRoutes from './routes/ai-jobs';
import userRoutes from './routes/users';
import { adminOnly } from './middleware/adminOnly';
import cors from 'cors';
import questionRoutes from './routes/questions';
import questionSetRoutes from './routes/interview-question-sets';
import assessmentRoutes from './routes/assessments';
import judgeRoutes from './routes/judge';
import submissionRoutes from './routes/submissions';
import attemptRoutes from './routes/attempts';
import candidateRoutes from './routes/candidates';
import adminReportRoutes from './routes/admin-reports';
import adminQuestionRoutes from './routes/admin-questions';
import { adminInviteRoutes, publicInviteRoutes } from './routes/invites';
import authRoutes from './routes/auth';
import interviewRoutes, { handleJoinRoom, handleSaveRoomAnswer } from './routes/interviews';
import { initSocketServer } from './socket';
import { authenticate, validateAuthConfiguration } from './middleware/auth';
import { isMockMode } from './services/execution/judge0';

validateAuthConfiguration();

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 4001;

// Initialize Socket.IO server on the HTTP server
initSocketServer(httpServer);

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
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
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
  if (req.user?.role !== 'admin') {
    const json = res.json.bind(res);
    res.json = ((body: unknown) => json(candidatePayload(body))) as typeof res.json;
  }
  next();
});

// Routes
app.use('/api/platform', platformRoutes);
app.use('/api/users', userRoutes);
app.get('/api/roles', adminOnly, ownerOnly, (_req, res) =>
  res.json(['admin', 'interviewer', 'candidate']),
);
app.use('/api/questions', questionRoutes);
app.use('/api/interview-question-sets', questionSetRoutes);
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

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError)
    return res.status(400).json({
      error: error.issues.map((i) => `${i.path.join('./index')}: ${i.message}`).join('; '),
    });
  if (error.status === 503) return res.status(503).json({ error: error.message });
  if (error instanceof WorkflowError)
    return res.status(error.status).json({ error: error.message });
  if (error.code === 'P2034')
    return res.status(409).json({
      error: 'Another request changed this record. Reload and retry.',
    });
  console.error('Workflow request failed:', error.message);
  res.status(502).json({ error: 'The request could not be completed. Please retry.' });
});

process.once('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 15000).unref();
});
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Wissen-Code server running on http://localhost:${PORT}`);
  console.log(
    isMockMode()
      ? '🧪 Judge: MOCK mode (simulated verdicts — set JUDGE_MODE=live for real execution)'
      : `📊 Judge0 API: ${process.env.JUDGE0_API_URL || 'https://ce.judge0.com'}`,
  );
  console.log('💾 Database: PostgreSQL\n');
});

export default app;
