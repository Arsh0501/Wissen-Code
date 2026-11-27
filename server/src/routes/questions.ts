import { z } from 'zod';
import { parseTestCaseText } from '../services/questions/test-case-import';
import {
  questionTypes,
  validateQuestionSettings,
  candidatePayload,
} from '../services/questions/candidate-payload';
import { Router, Request, Response } from 'express';
import prisma from '../database/prisma';
import { adminOnly, adminOrInterviewer } from '../middleware/adminOnly';

const router = Router();
// Interview-private content is managed only through its assigned interview.
router.use(async (req, res, next) => {
  const id = req.path.match(/^\/(\d+)(?:\/|$)/)?.[1];
  const testCaseId = req.path.match(/^\/testcases\/(\d+)(?:\/|$)/)?.[1];
  try {
    const question = id
      ? await prisma.question.findUnique({
          where: { id: Number(id) },
          select: { ownerInterviewId: true },
        })
      : testCaseId
        ? (
            await prisma.testCase.findUnique({
              where: { id: Number(testCaseId) },
              select: { question: { select: { ownerInterviewId: true } } },
            })
          )?.question
        : undefined;
    if (question?.ownerInterviewId != null)
      return res.status(404).json({ error: 'Question not found in the shared bank' });
    next();
  } catch (error) {
    next(error);
  }
});
const questionInput = z.object({
  title: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(100000),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  questionType: z.enum(questionTypes).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(40).optional(),
  timeLimit: z.number().min(0.1).max(20).optional(),
  memoryLimit: z.number().int().min(16000).max(512000).optional(),
  settings: z.unknown().optional(),
  starterCodes: z
    .array(
      z.object({
        languageId: z.number().int().positive(),
        languageName: z.string().min(1).max(100),
        code: z.string().max(100000),
      }),
    )
    .max(15)
    .optional(),
  testCases: z
    .array(
      z.object({
        input: z.string().max(100000),
        expectedOutput: z.string().max(100000),
        isSample: z.boolean().optional(),
      }),
    )
    .max(100)
    .optional(),
});

router.post('/testcases/parse', adminOnly, (req, res) => {
  try {
    const { text } = z.object({ text: z.string().max(256000) }).parse(req.body);
    res.json({ testCases: parseTestCaseText(text) });
  } catch (error) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Invalid test-case file' });
  }
});

// GET /api/questions — List questions. Optional filters: ?search=&difficulty=&tag=
router.get('/', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const { search, difficulty, tag } = req.query as Record<string, string | undefined>;
    const questions = await prisma.question.findMany({
      where: {
        ownerInterviewId: null,
        ...(difficulty ? { difficulty } : {}),
        ...(search ? { title: { contains: search } } : {}),
        // Tags are a JSON string array, so match the quoted tag
        ...(tag ? { tags: { contains: JSON.stringify(tag) } } : {}),
      },
      include: {
        _count: {
          select: { testCases: true, starterCodes: true, assessments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(req.user?.role === 'admin' ? questions : candidatePayload(questions));
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// GET /api/questions/:id — Get single question with related data
router.get('/:id', adminOrInterviewer, async (req: Request, res: Response) => {
  try {
    const question = await prisma.question.findUnique({
      where: { id: parseInt(req.params.id), ownerInterviewId: null },
      include: {
        starterCodes: true,
        // Hidden test cases are only visible to admins
        testCases: req.user?.role === 'admin' ? true : { where: { isSample: true } },
      },
    });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(req.user?.role === 'admin' ? question : candidatePayload(question));
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// POST /api/questions — Create a new question
router.post('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const {
      title,
      statement,
      difficulty,
      questionType,
      tags,
      timeLimit,
      memoryLimit,
      starterCodes,
      testCases,
    } = questionInput.parse(req.body);

    if (questionType && !questionTypes.includes(questionType))
      return res.status(400).json({ error: 'Invalid question type' });
    const question = await prisma.question.create({
      data: {
        title,
        statement,
        difficulty: difficulty || 'medium',
        questionType: questionType || 'coding',
        settings: validateQuestionSettings(questionType || 'coding', req.body.settings),
        tags: JSON.stringify(questionType === 'mcq' ? [] : tags || []),
        timeLimit: questionType === 'mcq' ? 2 : timeLimit || 2,
        memoryLimit: questionType === 'mcq' ? 256000 : memoryLimit || 256000,
        starterCodes:
          questionType !== 'mcq' && starterCodes
            ? {
                create: starterCodes.map((sc: any) => ({
                  languageId: sc.languageId,
                  languageName: sc.languageName,
                  code: sc.code,
                })),
              }
            : undefined,
        testCases:
          questionType !== 'mcq' && testCases
            ? {
                create: testCases.map((tc: any) => ({
                  input: tc.input,
                  expectedOutput: tc.expectedOutput,
                  isSample: tc.isSample || false,
                })),
              }
            : undefined,
      },
      include: {
        starterCodes: true,
        testCases: true,
      },
    });

    res.status(201).json(question);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid question',
    });
  }
});

// PUT /api/questions/:id — Update a question
router.put('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { title, statement, difficulty, questionType, tags, timeLimit, memoryLimit } =
      questionInput.partial().parse(req.body);
    const existing = await prisma.question.findUniqueOrThrow({ where: { id } });

    if (questionType && !questionTypes.includes(questionType))
      return res.status(400).json({ error: 'Invalid question type' });
    const question = await prisma.question.update({
      where: { id },
      data: {
        title,
        statement,
        difficulty,
        questionType,
        settings: validateQuestionSettings(
          questionType || existing.questionType,
          req.body.settings ?? existing.settings,
        ),
        tags: tags ? JSON.stringify(tags) : undefined,
        timeLimit,
        memoryLimit,
        ...((questionType || existing.questionType) === 'mcq'
          ? {
              tags: '[]',
              timeLimit: 2,
              memoryLimit: 256000,
              starterCodes: { deleteMany: {} },
              testCases: { deleteMany: {} },
            }
          : {}),
      },
      include: {
        starterCodes: true,
        testCases: true,
      },
    });

    res.json(req.user?.role === 'admin' ? question : candidatePayload(question));
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid question',
    });
  }
});

// DELETE /api/questions/:id — Delete a question
router.delete('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    await prisma.question.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// ---- Test Cases ----

// POST /api/questions/:id/testcases — Add test cases
router.post('/:id/testcases', adminOnly, async (req: Request, res: Response) => {
  try {
    const questionId = parseInt(req.params.id);
    const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
    if (question.questionType === 'mcq')
      return res.status(400).json({ error: 'MCQ questions do not use test cases' });
    const { testCases } = questionInput.pick({ testCases: true }).parse(req.body);

    if (Array.isArray(testCases)) {
      if (!testCases.length) return res.status(400).json({ error: 'Add at least one test case' });
      const created = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Question" WHERE id = ${questionId} FOR UPDATE`;
        const fresh = await tx.question.findUniqueOrThrow({ where: { id: questionId } });
        if (fresh.questionType === 'mcq') throw new Error('MCQ questions do not use test cases');
        if ((await tx.testCase.count({ where: { questionId } })) + testCases.length > 100)
          throw new Error('A question can contain up to 100 test cases.');
        return tx.testCase.createMany({
          data: testCases.map((tc: any) => ({
            questionId,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isSample: tc.isSample || false,
          })),
        });
      });
      return res.status(201).json({ count: created.count });
    }

    // Single test case
    const tc = await prisma.testCase.create({
      data: {
        questionId,
        input: req.body.input,
        expectedOutput: req.body.expectedOutput,
        isSample: req.body.isSample || false,
      },
    });
    res.status(201).json(tc);
  } catch (error) {
    console.error('Error adding test cases:', error);
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Failed to add test cases' });
  }
});

// PUT /api/questions/testcases/:tcId — Update a test case
router.put('/testcases/:tcId', adminOnly, async (req: Request, res: Response) => {
  try {
    const tc = await prisma.testCase.update({
      where: { id: parseInt(req.params.tcId) },
      data: {
        input: req.body.input,
        expectedOutput: req.body.expectedOutput,
        isSample: req.body.isSample,
      },
    });
    res.json(tc);
  } catch (error) {
    console.error('Error updating test case:', error);
    res.status(500).json({ error: 'Failed to update test case' });
  }
});

// DELETE /api/questions/testcases/:tcId — Delete a test case
router.delete('/testcases/:tcId', adminOnly, async (req: Request, res: Response) => {
  try {
    await prisma.testCase.delete({
      where: { id: parseInt(req.params.tcId) },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting test case:', error);
    res.status(500).json({ error: 'Failed to delete test case' });
  }
});

// ---- Starter Codes ----

// POST /api/questions/:id/starter-code — Add/update starter code
router.post('/:id/starter-code', adminOnly, async (req: Request, res: Response) => {
  try {
    const questionId = parseInt(req.params.id);
    const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
    if (question.questionType === 'mcq')
      return res.status(400).json({ error: 'MCQ questions do not use starter code' });
    const { languageId, languageName, code } = req.body;

    const starterCode = await prisma.starterCode.upsert({
      where: {
        questionId_languageId: { questionId, languageId },
      },
      update: { code, languageName },
      create: { questionId, languageId, languageName, code },
    });

    res.status(201).json(starterCode);
  } catch (error) {
    console.error('Error saving starter code:', error);
    res.status(500).json({ error: 'Failed to save starter code' });
  }
});

export default router;
