import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import questionRoutes from './routes/questions';
import assessmentRoutes from './routes/assessments';
import judgeRoutes from './routes/judge';
import submissionRoutes from './routes/submissions';
import sessionRoutes from './routes/sessions';
import adminReportRoutes from './routes/admin-reports';
import adminQuestionRoutes from './routes/admin-questions';
import aiRoutes from './routes/ai';
import questionReviewRoutes from './routes/question-review';
import interviewRoutes from './routes/interviews';
import { adminInviteRoutes, publicInviteRoutes } from './routes/invites';
import authRoutes from './routes/auth';
import { authenticate } from './middleware/auth';
import { isMockMode } from './services/judge0';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check (public)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (register/login are public; /me requires a token internally)
app.use('/api/auth', authRoutes);

// Invite links: anyone with a link can view it and join without an account
app.use('/api/public/invite', publicInviteRoutes);

// Everything below requires a valid Bearer token
app.use('/api', authenticate);

// Routes
app.use('/api/questions', questionRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/judge', judgeRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/questions', adminQuestionRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/question-review', questionReviewRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/invites', adminInviteRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', judgeMode: isMockMode() ? 'mock' : 'live', timestamp: new Date().toISOString() });
});
app.listen(PORT, () => {
  console.log(`\n🚀 Wissen-Code server running on http://localhost:${PORT}`);
  console.log(
    isMockMode()
      ? '🧪 Judge: MOCK mode (simulated verdicts — set JUDGE_MODE=live for real execution)'
      : `📊 Judge0 API: ${process.env.JUDGE0_API_URL || 'https://ce.judge0.com'}`
  );
  console.log(`💾 Database: ${process.env.DATABASE_URL}\n`);
});

export default app;

