import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { buildReportData } from './admin-reports';

const router = Router();

router.get('/', adminOnly, async (req, res, next) => {
  try {
    const search =
      typeof req.query.search === 'string'
        ? req.query.search.slice(0, 200)
        : '';
    const candidates = await prisma.user.findMany({
      where: {
        role: 'candidate',
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isGuest: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
    res.json(candidates);
  } catch (error) {
    next(error);
  }
});
// GET /api/candidates/:id/report
router.get('/:id/report', adminOnly, async (req: Request, res: Response) => {
  try {
    const user = /^\d+$/.test(req.params.id)
      ? await prisma.user.findUnique({ where: { id: Number(req.params.id) } })
      : null;
    const candidateName = user?.name ?? req.params.id;
    const assessmentId = parseInt(req.query.assessmentId as string);

    if (isNaN(assessmentId) || !candidateName) {
      return res
        .status(400)
        .json({ error: 'Invalid candidate id or assessmentId' });
    }

    const reportData = await buildReportData(
      candidateName,
      assessmentId,
      user?.id,
    );
    if (!reportData) {
      return res.status(404).json({
        error: 'No submissions found for this candidate and assessment',
      });
    }

    res.json(reportData);
  } catch (error) {
    console.error('Error fetching candidate report:', error);
    res.status(500).json({ error: 'Failed to fetch candidate report' });
  }
});

export default router;
