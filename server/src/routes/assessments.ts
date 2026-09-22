import { Router, Request, Response } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /api/assessments — List all assessments
router.get('/', async (_req: Request, res: Response) => {
  try {
    const assessments = await prisma.assessment.findMany({
      include: {
        questions: {
          include: {
            question: {
              select: { id: true, title: true, difficulty: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(assessments);
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

// GET /api/assessments/:id — Get single assessment with full question data
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const assessment = await prisma.assessment.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        questions: {
          include: {
            question: {
              include: {
                starterCodes: true,
                testCases: {
                  where: { isSample: true }, // Only sample test cases for examinee
                },
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    res.json(assessment);
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
});

// POST /api/assessments — Create a new assessment
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, timeLimitMinutes, questionIds } = req.body;

    const assessment = await prisma.assessment.create({
      data: {
        name,
        timeLimitMinutes: timeLimitMinutes || 60,
        questions: questionIds
          ? {
              create: questionIds.map((qId: number, idx: number) => ({
                questionId: qId,
                orderIndex: idx,
              })),
            }
          : undefined,
      },
      include: {
        questions: {
          include: {
            question: {
              select: { id: true, title: true, difficulty: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    res.status(201).json(assessment);
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
});

// PUT /api/assessments/:id — Update an assessment
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, timeLimitMinutes, questionIds } = req.body;

    // If questionIds provided, replace all question associations
    if (questionIds) {
      await prisma.assessmentQuestion.deleteMany({
        where: { assessmentId: id },
      });
      await prisma.assessmentQuestion.createMany({
        data: questionIds.map((qId: number, idx: number) => ({
          assessmentId: id,
          questionId: qId,
          orderIndex: idx,
        })),
      });
    }

    const assessment = await prisma.assessment.update({
      where: { id },
      data: {
        name,
        timeLimitMinutes,
      },
      include: {
        questions: {
          include: {
            question: {
              select: { id: true, title: true, difficulty: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    res.json(assessment);
  } catch (error) {
    console.error('Error updating assessment:', error);
    res.status(500).json({ error: 'Failed to update assessment' });
  }
});

// DELETE /api/assessments/:id — Delete an assessment
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.assessment.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
});

export default router;
