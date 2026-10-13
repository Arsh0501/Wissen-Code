import { Router, Request, Response } from 'express';
import * as z from 'zod/v4';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { executeCode, getLanguageById } from '../services/judge0';
import { PlanSection } from '../ai/contract';
import type { Observation } from '../ai/contract';
import { getAIProvider } from '../ai/provider';

// Interviewer workflow: plan → conduct (questions, answers, code, notes, AI observations) → evaluate by skill
const router = Router();
router.use(adminOnly);

const RECOMMENDATIONS = ['strong_hire', 'hire', 'no_hire', 'strong_no_hire', ''] as const;

const SkillRating = z.object({
  skill: z.string().trim().min(1).max(60),
  rating: z.number().int().min(0).max(5), // 0 = not assessed
  comment: z.string().max(2000),
});

const InterviewBody = z.object({
  candidateName: z.string().trim().min(1).max(120),
  candidateEmail: z.string().trim().max(200).optional(),
  role: z.string().trim().max(120).optional(),
  jobRequirements: z.string().max(8000).optional(),
  candidateExperience: z.string().max(8000).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  durationMinutes: z.number().int().min(10).max(240).optional(),
  scheduledAt: z.string().nullable().optional(),
  status: z.enum(['planned', 'in_progress', 'completed']).optional(),
  plan: z.array(PlanSection).max(20).optional(),
  skillRatings: z.array(SkillRating).max(20).optional(),
  recommendation: z.enum(RECOMMENDATIONS).optional(),
  summary: z.string().max(8000).optional(),
});

function parseJson<T>(s: string, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function serialize(i: any) {
  return {
    ...i,
    skills: parseJson<string[]>(i.skills, []),
    plan: parseJson<PlanSection[]>(i.plan, []),
    skillRatings: parseJson<z.infer<typeof SkillRating>[]>(i.skillRatings, []),
    questions: i.questions?.map((q: any) => ({
      ...q,
      executionResult: parseJson(q.executionResult, null),
      aiObservations: parseJson<Observation[]>(q.aiObservations, []),
    })),
  };
}

function toData(body: z.infer<typeof InterviewBody>) {
  const d: Record<string, unknown> = {};
  for (const k of ['candidateName', 'candidateEmail', 'role', 'jobRequirements', 'candidateExperience', 'durationMinutes', 'status', 'recommendation', 'summary'] as const) {
    if (body[k] !== undefined) d[k] = body[k];
  }
  if (body.skills) d.skills = JSON.stringify(body.skills);
  if (body.plan) d.plan = JSON.stringify(body.plan);
  if (body.skillRatings) d.skillRatings = JSON.stringify(body.skillRatings);
  if (body.scheduledAt !== undefined) d.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  return d;
}

function badRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: 'Invalid interview data', details: error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) });
}

// GET /api/interviews
router.get('/', async (_req: Request, res: Response) => {
  try {
    const interviews = await prisma.interview.findMany({
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { questions: true } } },
    });
    res.json(interviews.map(serialize));
  } catch (error) {
    console.error('Error listing interviews:', error);
    res.status(500).json({ error: 'Failed to load interviews' });
  }
});

// POST /api/interviews — Create from an (edited) plan; the plan's questions become the question list
router.post('/', async (req: Request, res: Response) => {
  const parsed = InterviewBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const plan = parsed.data.plan ?? [];
    const interview = await prisma.interview.create({
      data: {
        ...(toData(parsed.data) as { candidateName: string }),
        interviewerId: req.user?.id ?? null,
        questions: {
          create: plan.flatMap((section) => section.questions.filter((q) => q.trim()).map((prompt) => ({ section: section.topic, prompt }))).map((q, i) => ({ ...q, orderIndex: i })),
        },
      },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    res.status(201).json(serialize(interview));
  } catch (error) {
    console.error('Error creating interview:', error);
    res.status(500).json({ error: 'Failed to create interview' });
  }
});

// GET /api/interviews/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const interview = await prisma.interview.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!interview) return res.status(404).json({ error: 'Interview not found' });
    res.json(serialize(interview));
  } catch (error) {
    console.error('Error loading interview:', error);
    res.status(500).json({ error: 'Failed to load interview' });
  }
});

// PUT /api/interviews/:id — Update details, plan, status or the evaluation
router.put('/:id', async (req: Request, res: Response) => {
  const parsed = InterviewBody.partial().safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const interview = await prisma.interview.update({
      where: { id: parseInt(req.params.id) },
      data: toData(parsed.data as z.infer<typeof InterviewBody>),
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    res.json(serialize(interview));
  } catch (error) {
    console.error('Error updating interview:', error);
    res.status(500).json({ error: 'Failed to update interview' });
  }
});

// DELETE /api/interviews/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.interview.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting interview:', error);
    res.status(500).json({ error: 'Failed to delete interview' });
  }
});

// ── Questions within an interview ──

const QuestionBody = z.object({
  prompt: z.string().trim().min(1).max(4000).optional(),
  section: z.string().max(80).optional(),
  answer: z.string().max(20_000).optional(),
  code: z.string().max(40_000).optional(),
  languageId: z.number().int().optional(),
  notes: z.string().max(8000).optional(),
});

// POST /api/interviews/:id/questions — Add a question during the interview
router.post('/:id/questions', async (req: Request, res: Response) => {
  const parsed = QuestionBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.prompt) return res.status(400).json({ error: 'A question prompt is required' });
  try {
    const interviewId = parseInt(req.params.id);
    const count = await prisma.interviewQuestion.count({ where: { interviewId } });
    const q = await prisma.interviewQuestion.create({
      data: { interviewId, prompt: parsed.data.prompt, section: parsed.data.section ?? '', orderIndex: count },
    });
    res.status(201).json({ ...q, executionResult: null, aiObservations: [] });
  } catch (error) {
    console.error('Error adding interview question:', error);
    res.status(500).json({ error: 'Failed to add question' });
  }
});

// PUT /api/interviews/questions/:qid — Save answer, code, notes (autosaved by the UI)
router.put('/questions/:qid', async (req: Request, res: Response) => {
  const parsed = QuestionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid question data' });
  try {
    const q = await prisma.interviewQuestion.update({ where: { id: parseInt(req.params.qid) }, data: parsed.data });
    res.json({ ...q, executionResult: parseJson(q.executionResult, null), aiObservations: parseJson(q.aiObservations, []) });
  } catch (error) {
    console.error('Error saving interview question:', error);
    res.status(500).json({ error: 'Failed to save question' });
  }
});

// DELETE /api/interviews/questions/:qid
router.delete('/questions/:qid', async (req: Request, res: Response) => {
  try {
    await prisma.interviewQuestion.delete({ where: { id: parseInt(req.params.qid) } });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting interview question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// POST /api/interviews/questions/:qid/run — Execute the candidate's code and keep the result
router.post('/questions/:qid/run', async (req: Request, res: Response) => {
  try {
    const qid = parseInt(req.params.qid);
    const code = typeof req.body.code === 'string' ? req.body.code : '';
    const languageId = Number(req.body.languageId) || 71;
    const stdin = typeof req.body.stdin === 'string' ? req.body.stdin : '';
    if (!code.trim()) return res.status(400).json({ error: 'There is no code to run' });
    if (!getLanguageById(languageId)) return res.status(400).json({ error: 'Unsupported language' });

    const r = await executeCode({ sourceCode: code, languageId, stdin });
    const result = {
      status: r.status.description,
      stdout: r.stdout ?? '',
      stderr: r.stderr || r.compile_output || '',
      timeSeconds: r.time ? parseFloat(r.time) : null,
      ranAt: new Date().toISOString(),
    };
    await prisma.interviewQuestion.update({ where: { id: qid }, data: { code, languageId, executionResult: JSON.stringify(result) } });
    res.json(result);
  } catch (error) {
    console.error('Error running interview code:', error);
    res.status(500).json({ error: 'Failed to run the code' });
  }
});

// POST /api/interviews/questions/:qid/observe — AI observations with evidence for this question
router.post('/questions/:qid/observe', async (req: Request, res: Response) => {
  try {
    const q = await prisma.interviewQuestion.findUnique({ where: { id: parseInt(req.params.qid) }, include: { interview: { select: { skills: true } } } });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    if (!q.answer.trim() && !q.code.trim() && !q.notes.trim()) {
      return res.status(400).json({ error: 'Capture an answer, code or notes first — observations need evidence.' });
    }
    const exec = parseJson<{ status: string; stdout: string; stderr: string; timeSeconds: number | null } | null>(q.executionResult, null);
    const observations = (
      await getAIProvider().observe({
        skills: parseJson<string[]>(q.interview.skills, []),
        question: q.prompt,
        answer: q.answer,
        code: q.code,
        language: getLanguageById(q.languageId)?.name ?? 'Unknown',
        executionResult: exec ? { status: exec.status, stdout: exec.stdout, stderr: exec.stderr, timeSeconds: exec.timeSeconds } : null,
        notes: q.notes,
      })
    ).filter((o) => o.evidence.length > 0);
    await prisma.interviewQuestion.update({ where: { id: q.id }, data: { aiObservations: JSON.stringify(observations) } });
    res.json({ observations });
  } catch (error) {
    console.error('Error generating observations:', error);
    res.status(502).json({ error: 'The AI service could not analyse this answer. Please try again.' });
  }
});

export default router;
