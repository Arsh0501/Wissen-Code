import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';

const router = Router();

// Question fields an admin can set directly (tests/starter code are handled separately)
function questionFields(body: any) {
  const data: Record<string, unknown> = {};
  if (typeof body.title === 'string') data.title = body.title;
  if (typeof body.statement === 'string') data.statement = body.statement;
  if (['easy', 'medium', 'hard'].includes(body.difficulty)) data.difficulty = body.difficulty;
  if (Array.isArray(body.tags)) data.tags = JSON.stringify(body.tags);
  if (body.timeLimit !== undefined) data.timeLimit = body.timeLimit;
  if (body.memoryLimit !== undefined) data.memoryLimit = body.memoryLimit;
  if (['coding', 'mcq'].includes(body.type)) data.type = body.type;
  if (Array.isArray(body.options)) data.options = JSON.stringify(body.options);
  if (Array.isArray(body.correctOptions)) data.correctOptions = JSON.stringify(body.correctOptions);
  if (typeof body.explanation === 'string') data.explanation = body.explanation;
  if (typeof body.topic === 'string') data.topic = body.topic;
  if (Array.isArray(body.skills)) data.skills = JSON.stringify(body.skills);
  if (typeof body.referenceSolution === 'string') data.referenceSolution = body.referenceSolution;
  return data;
}

// A multiple-choice question needs ≥2 distinct options and ≥1 correct option that exists
function mcqError(options: unknown, correct: unknown): string | null {
  if (!Array.isArray(options) || options.length < 2) return 'A multiple-choice question needs at least 2 options';
  const ids = new Set(options.map((o: any) => o?.id));
  if (options.some((o: any) => typeof o?.id !== 'string' || typeof o?.text !== 'string' || !o.text.trim())) return 'Every option needs text';
  if (!Array.isArray(correct) || correct.length === 0) return 'Mark at least one option as correct';
  if (correct.some((c) => !ids.has(c))) return 'A correct answer refers to an option that does not exist';
  return null;
}

// GET /api/questions — List questions. Filters: ?search=&difficulty=&tag=&type=&status=
// Only approved ("active") questions are returned unless ?status= asks for others (admin only)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, difficulty, tag, type } = req.query as Record<string, string | undefined>;
    const requested = String(req.query.status || 'active');
    const status = req.user?.role === 'admin' ? requested : 'active';
    const questions = await prisma.question.findMany({
      where: {
        ...(status === 'all' ? {} : { status }),
        ...(difficulty ? { difficulty } : {}),
        ...(type ? { type } : {}),
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
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// GET /api/questions/:id — Get single question with related data
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const admin = req.user?.role === 'admin';
    const question = await prisma.question.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        starterCodes: true,
        // Hidden test cases are only visible to admins
        testCases: admin ? true : { where: { isSample: true } },
      },
    });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    // Answer keys and reference solutions are admin-only
    if (!admin) {
      return res.json({ ...question, correctOptions: '[]', explanation: '', referenceSolution: '', validation: '' });
    }
    res.json(question);
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// POST /api/questions — Create a question (manual questions go straight into the bank)
router.post('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const { title, statement, starterCodes, testCases } = req.body;
    if (!title?.trim() || !statement?.trim()) return res.status(400).json({ error: 'title and statement are required' });
    if (req.body.type === 'mcq') {
      const err = mcqError(req.body.options, req.body.correctOptions);
      if (err) return res.status(400).json({ error: err });
    }

    const question = await prisma.question.create({
      data: {
        title,
        statement,
        difficulty: req.body.difficulty || 'medium',
        ...questionFields(req.body),
        tags: JSON.stringify(req.body.tags || []),
        source: 'manual',
        status: 'active',
        starterCodes: Array.isArray(starterCodes) && req.body.type !== 'mcq'
          ? { create: starterCodes.map((sc: any) => ({ languageId: sc.languageId, languageName: sc.languageName, code: sc.code })) }
          : undefined,
        testCases: Array.isArray(testCases) && req.body.type !== 'mcq'
          ? { create: testCases.map((tc: any) => ({ input: tc.input, expectedOutput: tc.expectedOutput, isSample: tc.isSample || false })) }
          : undefined,
      },
      include: { starterCodes: true, testCases: true },
    });

    res.status(201).json(question);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// PUT /api/questions/:id — Update a question. For questions still in review, `testCases`
// and `starterCodes` arrays replace the existing ones, and the old validation is cleared.
router.put('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.question.findUnique({ where: { id }, select: { status: true, type: true, options: true, correctOptions: true } });
    if (!existing) return res.status(404).json({ error: 'Question not found' });

    const type = req.body.type ?? existing.type;
    if (type === 'mcq' && (req.body.options || req.body.correctOptions || req.body.type)) {
      const err = mcqError(req.body.options ?? JSON.parse(existing.options), req.body.correctOptions ?? JSON.parse(existing.correctOptions));
      if (err) return res.status(400).json({ error: err });
    }

    const inReview = existing.status !== 'active';
    const question = await prisma.$transaction(async (tx) => {
      if (inReview && Array.isArray(req.body.testCases)) {
        await tx.testCase.deleteMany({ where: { questionId: id } });
        await tx.testCase.createMany({
          data: req.body.testCases.map((tc: any) => ({ questionId: id, input: tc.input, expectedOutput: tc.expectedOutput, isSample: !!tc.isSample })),
        });
      }
      if (inReview && Array.isArray(req.body.starterCodes)) {
        await tx.starterCode.deleteMany({ where: { questionId: id } });
        await tx.starterCode.createMany({
          data: req.body.starterCodes.filter((sc: any) => sc.code?.trim()).map((sc: any) => ({ questionId: id, languageId: sc.languageId, languageName: sc.languageName, code: sc.code })),
        });
      }
      return tx.question.update({
        where: { id },
        // Any edit to a question in review invalidates its last validation
        data: { ...questionFields(req.body), ...(inReview ? { validation: '' } : {}) },
        include: { starterCodes: true, testCases: true },
      });
    });

    res.json(question);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
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
