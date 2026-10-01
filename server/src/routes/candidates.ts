import { Router, Request, Response } from 'express';
import { adminOnly } from '../middleware/adminOnly';
import { buildReportData } from './admin-reports';

const router = Router();

// GET /api/candidates/:id/report
router.get('/:id/report', adminOnly, async (req: Request, res: Response) => {
  try {
    const candidateName = req.params.id; // Using id parameter as candidateName
    const assessmentId = parseInt(req.query.assessmentId as string);

    if (isNaN(assessmentId) || !candidateName) {
      return res.status(400).json({ error: 'Invalid candidate id or assessmentId' });
    }

    const reportData = await buildReportData(candidateName, assessmentId);
    if (!reportData) {
      return res.status(404).json({ error: 'No submissions found for this candidate and assessment' });
    }

    res.json(reportData);
  } catch (error) {
    console.error('Error fetching candidate report:', error);
    res.status(500).json({ error: 'Failed to fetch candidate report' });
  }
});

export default router;
