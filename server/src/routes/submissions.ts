import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { executeCode } from '../services/judge0';

const router = Router();

// POST /api/submissions — Submit and grade a full assessment
router.post('/', async (req: Request, res: Response) => {
  try {
    const { assessmentId, answers } = req.body;
    const candidateName = req.user!.name;
    // answers: Array of { questionId, languageId, languageName, code }

    if (!assessmentId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'assessmentId and answers array are required' });
    }

    const results = [];

    for (const answer of answers) {
      // Create submission record
      const submission = await prisma.submission.create({
        data: {
          assessmentId,
          questionId: answer.questionId,
          candidateName,
          languageId: answer.languageId,
          languageName: answer.languageName,
          code: answer.code,
          status: 'grading',
        },
      });

      // Get ALL test cases for this question (sample + hidden)
      const testCases = await prisma.testCase.findMany({
        where: { questionId: answer.questionId },
      });

      let passedCount = 0;
      const testCaseResults = [];

      // Run code against each test case
      for (const tc of testCases) {
        try {
          const result = await executeCode({
            sourceCode: answer.code,
            languageId: answer.languageId,
            stdin: tc.input,
            cpuTimeLimit: 5,
            memoryLimit: 256000,
          });

          const actualOutput = (result.stdout || '').trim();
          const expectedOutput = tc.expectedOutput.trim();
          const passed = result.status.id === 3 && actualOutput === expectedOutput;

          if (passed) passedCount++;

          const tcResult = await prisma.testCaseResult.create({
            data: {
              submissionId: submission.id,
              testCaseId: tc.id,
              passed,
              actualOutput: actualOutput || result.compile_output || result.stderr || '',
              statusDesc: result.status.description,
              executionTime: result.time ? parseFloat(result.time) : null,
              memoryUsed: result.memory,
            },
          });

          testCaseResults.push({
            ...tcResult,
            isSample: tc.isSample,
          });
        } catch (execError: any) {
          // If Judge0 fails for a test case, record it as failed
          const tcResult = await prisma.testCaseResult.create({
            data: {
              submissionId: submission.id,
              testCaseId: tc.id,
              passed: false,
              actualOutput: execError.message || 'Execution error',
              statusDesc: 'Internal Error',
            },
          });

          testCaseResults.push({
            ...tcResult,
            isSample: tc.isSample,
          });
        }
      }

      // Update submission with final score
      const score = testCases.length > 0 ? (passedCount / testCases.length) * 100 : 0;
      const updatedSubmission = await prisma.submission.update({
        where: { id: submission.id },
        data: {
          status: 'graded',
          score,
        },
      });

      results.push({
        ...updatedSubmission,
        totalTestCases: testCases.length,
        passedTestCases: passedCount,
        testCaseResults,
      });
    }

    res.status(201).json({
      assessmentId,
      candidateName,
      submissions: results,
      overallScore:
        results.length > 0
          ? results.reduce((acc, r) => acc + r.score, 0) / results.length
          : 0,
    });
  } catch (error) {
    console.error('Error processing submission:', error);
    res.status(500).json({ error: 'Failed to process submission' });
  }
});

// GET /api/submissions/:assessmentId/:candidateName — Get submission results
router.get('/:assessmentId/:candidateName', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(req.params.assessmentId);
    const candidateName = req.params.candidateName;

    // Examinees may only view their own results; admins can view any
    if (req.user!.role !== 'admin' && req.user!.name !== candidateName) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const submissions = await prisma.submission.findMany({
      where: { assessmentId, candidateName },
      include: {
        question: {
          select: { id: true, title: true },
        },
        testCaseResults: {
          include: {
            testCase: {
              select: { id: true, isSample: true },
            },
          },
        },
      },
    });

    if (submissions.length === 0) {
      return res.status(404).json({ error: 'No submissions found' });
    }

    const overallScore =
      submissions.reduce((acc, s) => acc + s.score, 0) / submissions.length;

    res.json({
      assessmentId,
      candidateName,
      submissions,
      overallScore,
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

export default router;
