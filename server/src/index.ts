import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import questionRoutes from './routes/questions';
import assessmentRoutes from './routes/assessments';
import judgeRoutes from './routes/judge';
import submissionRoutes from './routes/submissions';
import authRoutes from './routes/auth';
import { authenticate } from './middleware/auth';

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

// Everything below requires a valid Bearer token
app.use('/api', authenticate);

// Routes
app.use('/api/questions', questionRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/judge', judgeRoutes);
app.use('/api/submissions', submissionRoutes);

app.listen(PORT, () => {
  console.log(`\n🚀 Wissen-Code server running on http://localhost:${PORT}`);
  console.log(`📊 Judge0 API: ${process.env.JUDGE0_API_URL || 'https://ce.judge0.com'}`);
  console.log(`💾 Database: SQLite (prisma/dev.db)\n`);
});

export default app;

