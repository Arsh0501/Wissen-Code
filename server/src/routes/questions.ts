import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { requireRole } from '../middleware/auth';

const router = Router();
const requireAdmin = requireRole('admin');

// GET /api/questions — List all questions
router.get('/', async (_req: Request, res: Response) => {
  try {
    const questions = await prisma.question.findMany({
      include: {
        _count: {
          select: { testCases: true, starterCodes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// GET /api/questions/:id — Get single question with related data
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const question = await prisma.question.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        starterCodes: true,
        testCases: true,
      },
    });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(question);
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// POST /api/questions — Create a new question
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, statement, difficulty, tags, timeLimit, memoryLimit, starterCodes, testCases } =
      req.body;

    const question = await prisma.question.create({
      data: {
        title,
        statement,
        difficulty: difficulty || 'medium',
        tags: JSON.stringify(tags || []),
        timeLimit: timeLimit || 2,
        memoryLimit: memoryLimit || 256000,
        starterCodes: starterCodes
          ? {
              create: starterCodes.map((sc: any) => ({
                languageId: sc.languageId,
                languageName: sc.languageName,
                code: sc.code,
              })),
            }
          : undefined,
        testCases: testCases
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
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// PUT /api/questions/:id — Update a question
router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { title, statement, difficulty, tags, timeLimit, memoryLimit } = req.body;

    const question = await prisma.question.update({
      where: { id },
      data: {
        title,
        statement,
        difficulty,
        tags: tags ? JSON.stringify(tags) : undefined,
        timeLimit,
        memoryLimit,
      },
      include: {
        starterCodes: true,
        testCases: true,
      },
    });

    res.json(question);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// DELETE /api/questions/:id — Delete a question
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
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
router.post('/:id/testcases', requireAdmin, async (req: Request, res: Response) => {
  try {
    const questionId = parseInt(req.params.id);
    const { testCases } = req.body; // Array of { input, expectedOutput, isSample }

    if (Array.isArray(testCases)) {
      const created = await prisma.testCase.createMany({
        data: testCases.map((tc: any) => ({
          questionId,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isSample: tc.isSample || false,
        })),
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
    res.status(500).json({ error: 'Failed to add test cases' });
  }
});

// PUT /api/questions/testcases/:tcId — Update a test case
router.put('/testcases/:tcId', requireAdmin, async (req: Request, res: Response) => {
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
router.delete('/testcases/:tcId', requireAdmin, async (req: Request, res: Response) => {
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
router.post('/:id/starter-code', requireAdmin, async (req: Request, res: Response) => {
  try {
    const questionId = parseInt(req.params.id);
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
