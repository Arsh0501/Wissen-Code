import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import prisma from '../database/prisma';
import { adminOnly, adminOrInterviewer } from '../middleware/adminOnly';
import {
  generateSetPreview,
  generationSchema,
  setSchema,
} from '../services/questions/question-sets';
import { WorkflowError } from '../services/ai/structured-ai';

export function createQuestionSetRouter(aiGenerate = generateSetPreview) {
  const router = Router();
  router.use(adminOrInterviewer);
  router.get('/', async (req, res, next) => {
    try {
      res.json(
        await prisma.interviewQuestionSet.findMany({
          where: {
            title: { contains: String(req.query.search || '').slice(0, 200), mode: 'insensitive' },
          },
          orderBy: { updatedAt: 'desc' },
          include: { _count: { select: { questions: true } } },
        }),
      );
    } catch (e) {
      next(e);
    }
  });
  router.post(
    '/generate-preview',
    adminOnly,
    rateLimit({
      windowMs: 60000,
      limit: 5,
      keyGenerator: (req) => String(req.user!.id),
    }),
    async (req, res, next) => {
      try {
        const input = generationSchema.parse(req.body);
        const preview = await aiGenerate(input);
        res.json(preview);
      } catch (error) {
        next(error);
      }
    },
  );
  router.get('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) throw new WorkflowError('Invalid set ID');
      const set = await prisma.interviewQuestionSet.findUnique({
        where: { id },
        include: { questions: { orderBy: { orderIndex: 'asc' } } },
      });
      if (!set) throw new WorkflowError('Question set not found', 404);
      res.json(set);
    } catch (e) {
      next(e);
    }
  });
  router.post('/', adminOnly, async (req, res, next) => {
    try {
      const data = setSchema.parse(req.body);
      res.status(201).json(
        await prisma.interviewQuestionSet.create({
          data: {
            title: data.title,
            description: data.description,
            createdById: req.user!.id,
            questions: {
              create: data.questions.map(({ id: _id, ...q }, orderIndex) => ({
                ...q,
                orderIndex,
              })),
            },
          },
          include: { questions: { orderBy: { orderIndex: 'asc' } } },
        }),
      );
    } catch (e) {
      next(e);
    }
  });
  router.put('/:id', adminOnly, async (req, res, next) => {
    try {
      const id = Number(req.params.id),
        data = setSchema.parse(req.body);
      if (!Number.isInteger(id) || id < 1 || !data.revision)
        throw new WorkflowError('Provide a valid set ID and revision');
      const result = await prisma.$transaction(async (tx) => {
        const changed = await tx.interviewQuestionSet.updateMany({
          where: { id, revision: data.revision },
          data: { title: data.title, description: data.description, revision: { increment: 1 } },
        });
        if (!changed.count)
          throw new WorkflowError('The set changed or was deleted. Reload before saving.', 409);
        const existing = await tx.interviewQuestionSetItem.findMany({
          where: { setId: id },
          select: { id: true },
        });
        const ids = data.questions.flatMap((q) => (q.id ? [q.id] : []));
        if (new Set(ids).size !== ids.length || ids.some((q) => !existing.some((e) => e.id === q)))
          throw new WorkflowError('Invalid question selection');
        await tx.interviewQuestionSetItem.deleteMany({ where: { setId: id, id: { notIn: ids } } });
        for (const [orderIndex, { id: itemId, ...q }] of data.questions.entries()) {
          if (itemId)
            await tx.interviewQuestionSetItem.update({
              where: { id: itemId },
              data: { ...q, orderIndex },
            });
          else await tx.interviewQuestionSetItem.create({ data: { ...q, setId: id, orderIndex } });
        }
        return tx.interviewQuestionSet.findUniqueOrThrow({
          where: { id },
          include: { questions: { orderBy: { orderIndex: 'asc' } } },
        });
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });
  router.delete('/:id', adminOnly, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) throw new WorkflowError('Invalid set ID');
      const deleted = await prisma.interviewQuestionSet.deleteMany({ where: { id } });
      if (!deleted.count) throw new WorkflowError('Question set not found', 404);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
export default createQuestionSetRouter();
