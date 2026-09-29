import { Router, Request, Response } from 'express';
import * as z from 'zod/v4';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { isMockMode } from '../services/judge0';
import {
  AIError, MAX_QUESTIONS, MIN_QUESTIONS, generateFromResume, isAIConfigured,
} from '../services/ai-assessment';

const router = Router();
router.use(adminOnly);

// PDFs are sent base64-encoded in JSON (server body limit is 10mb)
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_TEXT = 50_000;

const DEFAULT_MARKS: Record<string, number> = { easy: 10, medium: 20, hard: 30 };

const LANGUAGES = [
  { id: 71, name: 'Python', field: 'starter_code_python' },
  { id: 63, name: 'JavaScript', field: 'starter_code_javascript' },
  { id: 62, name: 'Java', field: 'starter_code_java' },
  { id: 54, name: 'C++', field: 'starter_code_cpp' },
] as const;

// GET /api/ai/status — whether AI generation is available, and whether test cases can be verified
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    configured: isAIConfigured(),
    canVerify: !isMockMode(),
    minQuestions: MIN_QUESTIONS,
    maxQuestions: MAX_QUESTIONS,
  });
});

// POST /api/ai/generate — Read a resume and return tailored questions for review (nothing is saved)
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { resumePdfBase64, resumeText, focus } = req.body ?? {};
    const questionCount = Number(req.body?.questionCount ?? 3);

    if (!Number.isInteger(questionCount) || questionCount < MIN_QUESTIONS || questionCount > MAX_QUESTIONS) {
      return res.status(400).json({ error: `questionCount must be between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}` });
    }
    if (focus !== undefined && (typeof focus !== 'string' || focus.length > 200)) {
      return res.status(400).json({ error: 'focus must be text of at most 200 characters' });
    }

    let pdf: string | undefined;
    let text: string | undefined;
    if (typeof resumePdfBase64 === 'string' && resumePdfBase64) {
      const bytes = Buffer.from(resumePdfBase64, 'base64');
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return res.status(400).json({ error: 'The uploaded file is not a valid PDF' });
      }
      if (bytes.length > MAX_PDF_BYTES) {
        return res.status(400).json({ error: 'The resume PDF must be 5 MB or smaller' });
      }
      pdf = resumePdfBase64;
    } else if (typeof resumeText === 'string' && resumeText.trim()) {
      if (resumeText.length > MAX_RESUME_TEXT) {
        return res.status(400).json({ error: 'The resume text is too long (max 50,000 characters)' });
      }
      text = resumeText;
    } else {
      return res.status(400).json({ error: 'Upload a resume PDF or paste the resume text' });
    }

    const started = Date.now();
    const preview = await generateFromResume({ resumePdfBase64: pdf, resumeText: text, questionCount, focus });
    console.log(`[AI] Generated ${preview.questions.length} questions in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    res.json(preview);
  } catch (error) {
    if (error instanceof AIError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error('Error generating AI assessment:', error);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

const CreateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  timeLimitMinutes: z.number().int().min(5).max(600),
  passingScore: z.number().int().min(0).max(100),
  questions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        tags: z.array(z.string().max(40)).max(10),
        statement: z.string().min(1).max(20_000),
        test_cases: z
          .array(z.object({ input: z.string().max(20_000), expected_output: z.string().max(20_000), is_sample: z.boolean() }))
          .min(1)
          .max(30),
        starter_code_python: z.string().max(20_000),
        starter_code_javascript: z.string().max(20_000),
        starter_code_java: z.string().max(20_000),
        starter_code_cpp: z.string().max(20_000),
      })
    )
    .min(1)
    .max(MAX_QUESTIONS),
});

// POST /api/ai/create-assessment — Save reviewed AI questions and a DRAFT assessment that uses them
router.post('/create-assessment', async (req: Request, res: Response) => {
  const parsed = CreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid assessment data', details: parsed.error.issues.slice(0, 5) });
  }
  const body = parsed.data;

  try {
    const assessment = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const q of body.questions) {
        created.push(
          await tx.question.create({
            data: {
              title: q.title,
              statement: q.statement,
              difficulty: q.difficulty,
              // "ai-generated" marks questions written for a specific resume rather than curated for the bank
              tags: JSON.stringify(Array.from(new Set(['ai-generated', ...q.tags.map((t) => t.toLowerCase())]))),
              starterCodes: {
                create: LANGUAGES.filter((l) => q[l.field].trim()).map((l) => ({
                  languageId: l.id,
                  languageName: l.name,
                  code: q[l.field],
                })),
              },
              testCases: {
                create: q.test_cases.map((t) => ({ input: t.input, expectedOutput: t.expected_output, isSample: t.is_sample })),
              },
            },
          })
        );
      }

      return tx.assessment.create({
        data: {
          name: body.name,
          description: body.description ?? '',
          timeLimitMinutes: body.timeLimitMinutes,
          passingScore: body.passingScore,
          status: 'draft', // admin reviews and publishes it from the normal edit screen
          questions: {
            create: created.map((q, i) => ({ questionId: q.id, orderIndex: i, marks: DEFAULT_MARKS[q.difficulty] ?? 10 })),
          },
        },
        select: { id: true, name: true },
      });
    });

    res.status(201).json(assessment);
  } catch (error) {
    console.error('Error creating AI assessment:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
});

export default router;
