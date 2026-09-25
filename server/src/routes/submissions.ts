import { Router, Request, Response } from 'express';
import { gradeAnswer, computeEvaluation } from '../services/grading';

const router = Router();

// POST /api/submissions — Submit and grade a full assessment
router.post('/', async (req: Request, res: Response) => {
  try {
    const { assessmentId, candidateName, answers } = req.body;
    // answers: Array of { questionId, languageId, languageName, code }

    if (!assessmentId || !candidateName || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'assessmentId, candidateName, and answers array are required' });
    }

    const results = [];
    for (const answer of answers) {
      results.push(await gradeAnswer(assessmentId, candidateName, answer));
    }

    const evaluation = await computeEvaluation(assessmentId, candidateName);
    res.status(201).json({
      assessmentId,
      candidateName,
      submissions: results,
      overallScore: evaluation?.percentage ?? 0,
      evaluation,
    });
  } catch (error) {
    console.error('Error processing submission:', error);
    res.status(500).json({ error: 'Failed to process submission' });
  }
});

// GET /api/submissions/:assessmentId/:candidateName — Evaluation for one candidate
router.get('/:assessmentId/:candidateName', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(req.params.assessmentId);
    const candidateName = req.params.candidateName;
    const role = req.user?.role;

    // Examinees may only view their own results
    if (role !== 'admin' && req.user?.name !== candidateName) {
      return res.status(403).json({ error: 'You can only view your own results' });
    }

    const evaluation = await computeEvaluation(assessmentId, candidateName);
    if (!evaluation || !evaluation.hasSubmissions) {
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
