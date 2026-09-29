import { Router, Request, Response } from 'express';
import * as z from 'zod/v4';
import { adminOnly } from '../middleware/adminOnly';
import { isMockMode } from '../services/judge0';
import {
  GenerateQuestionsRequest, GeneratedQuestion, InterviewPlanRequest, ObservationsRequest, ValidateQuestionsRequest,
} from '../ai/contract';
import type { GenerateQuestionsResponse, InterviewPlanResponse, ObservationsResponse } from '../ai/contract';
import { getAIProvider } from '../ai/provider';
import { validateQuestions } from '../ai/validation';

// AI endpoints — the only way the frontend reaches AI. Requests and responses follow ai/contract.ts.
const router = Router();
router.use(adminOnly);

function badRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: 'Invalid request',
    details: error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
  });
}

function aiFailure(res: Response, error: unknown, what: string) {
  console.error(`[AI] ${what} failed:`, error);
  return res.status(502).json({ error: `The AI service could not ${what}. Please try again.` });
}

// GET /api/ai/status — which provider is serving, and whether solutions can be executed
router.get('/status', (_req: Request, res: Response) => {
  res.json({ provider: getAIProvider().name, canRunCode: !isMockMode() });
});

// POST /api/ai/questions/generate — Draft new questions (nothing is saved)
router.post('/questions/generate', async (req: Request, res: Response) => {
  const parsed = GenerateQuestionsRequest.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const provider = getAIProvider();
    const raw = await provider.generateQuestions(parsed.data);
    // Re-check provider output against the contract before handing it to the UI
    const questions = raw.map((q) => GeneratedQuestion.safeParse(q)).filter((r) => r.success).map((r) => r.data!);
    if (!questions.length) return res.status(502).json({ error: 'The AI returned no usable questions. Please try again.' });
    const body: GenerateQuestionsResponse = { questions, provider: provider.name };
    res.json(body);
  } catch (error) {
    return aiFailure(res, error, 'generate questions');
  }
});

// POST /api/ai/questions/validate — Duplicate, correctness, wording, difficulty, tests, solution, edge cases
router.post('/questions/validate', async (req: Request, res: Response) => {
  const parsed = ValidateQuestionsRequest.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    res.json({ reports: await validateQuestions(parsed.data.questions) });
  } catch (error) {
    return aiFailure(res, error, 'validate the questions');
  }
});

// POST /api/ai/interviews/plan — Suggested interview plan for the interviewer to edit
router.post('/interviews/plan', async (req: Request, res: Response) => {
  const parsed = InterviewPlanRequest.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const provider = getAIProvider();
    const plan = await provider.planInterview(parsed.data);
    const body: InterviewPlanResponse = { ...plan, provider: provider.name };
    res.json(body);
  } catch (error) {
    return aiFailure(res, error, 'plan the interview');
  }
});

// POST /api/ai/interviews/observations — Evidence-backed observations on one answer
router.post('/interviews/observations', async (req: Request, res: Response) => {
  const parsed = ObservationsRequest.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const provider = getAIProvider();
    // Observations without evidence are dropped — every claim must be traceable
    const observations = (await provider.observe(parsed.data)).filter((o) => o.evidence.length > 0);
    const body: ObservationsResponse = { observations, provider: provider.name };
    res.json(body);
  } catch (error) {
    return aiFailure(res, error, 'analyse the answer');
  }
});

export default router;
