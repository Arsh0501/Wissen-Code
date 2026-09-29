import { Router, Request, Response } from 'express';
import * as z from 'zod/v4';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { GeneratedQuestion } from '../ai/contract';
import type { ValidationReport } from '../ai/contract';
import { validateQuestions } from '../ai/validation';

// Review queue for AI-generated questions: they wait here as "pending_review" and only
// become usable ("active") after a human approves them and they pass validation.
const router = Router();
router.use(adminOnly);

const LANGS = [
  { id: 71, name: 'Python', key: 'python' },
  { id: 63, name: 'JavaScript', key: 'javascript' },
  { id: 62, name: 'Java', key: 'java' },
  { id: 54, name: 'C++', key: 'cpp' },
] as const;

type StoredQuestion = Awaited<ReturnType<typeof loadQuestion>>;

function loadQuestion(id: number) {
  return prisma.question.findUnique({ where: { id }, include: { testCases: { orderBy: { id: 'asc' } }, starterCodes: true } });
}

function parseList<T>(json: string): T[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Stored question → the contract shape validation works on
function toGenerated(q: NonNullable<StoredQuestion>): GeneratedQuestion {
  const starter = Object.fromEntries(LANGS.map((l) => [l.key, q.starterCodes.find((s) => s.languageId === l.id)?.code ?? ''])) as GeneratedQuestion['starterCode'];
  return {
    type: q.type === 'mcq' ? 'mcq' : 'coding',
    title: q.title,
    difficulty: (['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium') as GeneratedQuestion['difficulty'],
    topic: q.topic,
    skills: parseList<string>(q.skills),
    tags: parseList<string>(q.tags).filter((t) => t !== 'ai-generated'),
    statement: q.statement,
    testCases: q.testCases.map((t) => ({ input: t.input, expectedOutput: t.expectedOutput, isSample: t.isSample })),
    starterCode: starter,
    referenceSolution: q.referenceSolution,
    options: parseList<{ id: string; text: string }>(q.options),
    correctOptionIds: parseList<string>(q.correctOptions),
    explanation: q.explanation,
  };
}

const DraftsBody = z.object({
  questions: z.array(GeneratedQuestion).min(1).max(10),
  reports: z.array(z.any()).optional(), // validation reports already shown in the UI, stored for reference
});

// POST /api/question-review/drafts — Save generated questions into the review queue
router.post('/drafts', async (req: Request, res: Response) => {
  const parsed = DraftsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid questions', details: parsed.error.issues.slice(0, 5) });
  try {
    const created = await prisma.$transaction(
      parsed.data.questions.map((q, i) =>
        prisma.question.create({
          data: {
            title: q.title,
            statement: q.statement,
            difficulty: q.difficulty,
            tags: JSON.stringify(Array.from(new Set(['ai-generated', ...q.tags.map((t) => t.toLowerCase())]))),
            type: q.type,
            topic: q.topic,
            skills: JSON.stringify(q.skills),
            options: JSON.stringify(q.type === 'mcq' ? q.options : []),
            correctOptions: JSON.stringify(q.type === 'mcq' ? q.correctOptionIds : []),
            explanation: q.explanation,
            referenceSolution: q.referenceSolution,
            source: 'ai',
            status: 'pending_review',
            validation: parsed.data.reports?.[i] ? JSON.stringify(parsed.data.reports[i]) : '',
            testCases: q.type === 'coding' ? { create: q.testCases.map((t) => ({ input: t.input, expectedOutput: t.expectedOutput, isSample: t.isSample })) } : undefined,
            starterCodes: q.type === 'coding'
              ? { create: LANGS.filter((l) => q.starterCode[l.key].trim()).map((l) => ({ languageId: l.id, languageName: l.name, code: q.starterCode[l.key] })) }
              : undefined,
          },
          select: { id: true, title: true, status: true },
        })
      )
    );
    res.status(201).json({ questions: created });
  } catch (error) {
    console.error('Error saving AI drafts:', error);
    res.status(500).json({ error: 'Failed to save questions for review' });
  }
});

async function runValidation(q: NonNullable<StoredQuestion>): Promise<ValidationReport> {
  const [report] = await validateQuestions([toGenerated(q)], { excludeQuestionIds: [q.id] });
  await prisma.question.update({ where: { id: q.id }, data: { validation: JSON.stringify(report) } });
  return report;
}

// POST /api/question-review/:id/validate — Re-run validation on the stored question
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const q = await loadQuestion(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: 'Question not found' });
    res.json({ report: await runValidation(q) });
  } catch (error) {
    console.error('Error validating question:', error);
    res.status(500).json({ error: 'Failed to validate question' });
  }
});

// POST /api/question-review/:id/approve — Human approval; re-validates and refuses failing questions
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const q = await loadQuestion(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: 'Question not found' });
    if (q.status === 'active') return res.json({ status: 'active' });
    const report = await runValidation(q);
    if (report.verdict === 'fail') {
      return res.status(409).json({ error: 'This question failed validation. Fix the flagged problems, then approve again.', report });
    }
    await prisma.question.update({ where: { id: q.id }, data: { status: 'active' } });
    res.json({ status: 'active', report });
  } catch (error) {
    console.error('Error approving question:', error);
    res.status(500).json({ error: 'Failed to approve question' });
  }
});

// POST /api/question-review/:id/reject — Keep out of the bank (kept for audit, never usable)
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const q = await prisma.question.findUnique({ where: { id }, select: { status: true, _count: { select: { assessments: true } } } });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    if (q.status === 'active' && q._count.assessments > 0) {
      return res.status(409).json({ error: 'This question is used in an assessment, so it cannot be rejected.' });
    }
    await prisma.question.update({ where: { id }, data: { status: 'rejected' } });
    res.json({ status: 'rejected' });
  } catch (error) {
    console.error('Error rejecting question:', error);
    res.status(500).json({ error: 'Failed to reject question' });
  }
});

export default router;
