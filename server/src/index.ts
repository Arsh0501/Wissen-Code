import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import agentsRoutes from './routes/agents';
import interviewRoutes, { handleJoinRoom } from './routes/interviews';
import { initSocketServer } from './socket';
import { authenticate } from './middleware/auth';
import { isMockMode, getActiveLanguages } from './services/judge0';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 4000;

// Initialize Socket.IO server on the HTTP server
initSocketServer(httpServer);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check (public)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    judgeMode: isMockMode() ? 'mock' : 'live',
    timestamp: new Date().toISOString(),
  });
});

// Auth & Profile routes (register/login are public; /me & /profile require a token internally)
app.use('/api/auth', authRoutes);
app.use('/api/profile', authRoutes);

// Public Candidate routes (no account required)
app.use('/api/public/invite', publicInviteRoutes);
app.get('/api/public/interview/:roomToken', handleJoinRoom);
app.get('/api/interviews/room/:roomToken', handleJoinRoom);

// Everything below requires a valid Bearer token
app.use('/api', authenticate);

// Routes
app.use('/api/questions', questionRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/judge', judgeRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/questions', adminQuestionRoutes);
app.use('/api/invites', adminInviteRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/interviews', interviewRoutes);

httpServer.listen(PORT, () => {
  console.log(`\n🚀 Wissen-Code server running on http://localhost:${PORT}`);
  console.log(
    isMockMode()
      ? '🧪 Judge: MOCK mode (simulated verdicts — set JUDGE_MODE=live for real execution)'
      : `📊 Judge0 API: ${process.env.JUDGE0_API_URL || 'https://ce.judge0.com'}`
  );
  console.log(`💾 Database: ${process.env.DATABASE_URL}\n`);

  // Eagerly prefetch active languages into cache
  getActiveLanguages().then((langs) => {
    console.log(`🌐 Judge0 loaded ${langs.length} active languages.`);
  }).catch((err) => {
    console.warn(`⚠️ Could not prefetch Judge0 languages on startup: ${err.message}`);
  });
});

export default app;


