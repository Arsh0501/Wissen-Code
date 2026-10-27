import { asynchronousGrading, gradingQueue } from '../platform/jobs/grading-jobs';
import prisma from '../database/prisma';
import { Router, Request, Response } from 'express';
import { computeEvaluation } from '../services/assessments/grading';

const router = Router();

// POST /api/submissions — Submit and grade a full assessment
router.post('/', (_req, res) =>
  res.status(410).json({
    error: 'Save drafts and submit the current assessment attempt via /api/attempts/:id/submit',
  }),
);

// GET /api/submissions/:assessmentId/:candidateName — Evaluation for one candidate
router.get('/:assessmentId/:candidateName', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(req.params.assessmentId);
    const candidateName = req.params.candidateName;
    const role = req.user?.role;

    // Candidates may only view their own results
    if (role !== 'admin' && req.user?.name !== candidateName) {
      return res.status(403).json({ error: 'You can only view your own results' });
    }

    const session = await prisma.assessmentSession.findFirst({
      where: {
        assessmentId,
        candidateName,
        ...(req.user?.role === 'candidate' ? { candidateUserId: req.user.id } : {}),
      },
      orderBy: { startedAt: 'desc' },
      include: { assessment: true },
    });
    let gradingFailed = session?.gradingStatus === 'failed';
    if (session?.finishedAt && session.gradingStatus !== 'completed' && asynchronousGrading()) {
      const job = await gradingQueue().getJob(`attempt-${session.id}`);
      gradingFailed = !job || (await job.getState()) === 'failed';
    }
    if (session?.finishedAt && session.gradingStatus !== 'completed')
      return res.status(202).json({
        assessmentId,
        candidateName,
        sessionId: session.id,
        resultsPending: true,
        gradingFailed,
        evaluation: {
          assessment: {
            id: session.assessment.id,
            name: session.assessment.name,
            timeLimitMinutes: session.durationMinutes ?? session.assessment.timeLimitMinutes,
            passingScore: session.assessment.passingScore,
            showResults: session.assessment.showResults,
          },
          candidateName,
          finishedAt: session.finishedAt,
          timeTakenSeconds: null,
        },
      });
    const evaluation = await computeEvaluation(
      assessmentId,
      candidateName,
      req.user?.role === 'candidate' ? req.user.id : undefined,
    );
    if (!evaluation || (!evaluation.hasSubmissions && !evaluation.finishedAt)) {
      return res.status(404).json({ error: 'No submissions found' });
    }

    // Admin can hide the breakdown from candidates
    if (role !== 'admin' && !evaluation.assessment.showResults) {
      return res.json({
        assessmentId,
        candidateName,
        resultsHidden: true,
        evaluation: {
          assessment: evaluation.assessment,
          candidateName,
          finishedAt: evaluation.finishedAt,
          timeTakenSeconds: evaluation.timeTakenSeconds,
        },
      });
    }

    // Candidates never see hidden test case outputs
    if (role !== 'admin') {
      for (const q of evaluation.questions) {
        for (const r of q.submission?.testCaseResults || []) {
          if (!r.testCase.isSample) r.actualOutput = '';
        }
      }
    }

    res.json({
      assessmentId,
      candidateName,
      submissions: evaluation.questions.flatMap((q) => (q.submission ? [q.submission] : [])),
      overallScore: evaluation.percentage,
      evaluation,
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

export default router;
