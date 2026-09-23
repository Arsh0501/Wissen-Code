import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import questionRoutes from './routes/questions';
import assessmentRoutes from './routes/assessments';
import judgeRoutes from './routes/judge';
import submissionRoutes from './routes/submissions';
import sessionRoutes from './routes/sessions';
import adminReportRoutes from './routes/admin-reports';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Mock auth middleware — reads role from header
app.use((req, _res, next) => {
  (req as any).role = req.headers['x-role'] || 'examinee';
  (req as any).candidateName = req.headers['x-candidate-name'] || 'Anonymous';
  next();
});

// Routes
app.use('/api/questions', questionRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/judge', judgeRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin/reports', adminReportRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Wissen-Code server running on http://localhost:${PORT}`);
  console.log(`📊 Judge0 API: ${process.env.JUDGE0_API_URL || 'https://ce.judge0.com'}`);
  console.log(`💾 Database: SQLite (prisma/dev.db)\n`);
});

export default app;
