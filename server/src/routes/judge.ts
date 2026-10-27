import { Router, Request, Response } from 'express';
import { executeCode, LANGUAGE_MAP } from '../services/execution/judge0';
import prisma from '../database/prisma';

const router = Router();
router.use(async (req, res, next) => {
  if (req.method !== 'POST' || req.user?.role !== 'candidate') return next();
  try {
    const questionId = req.path === '/run-tests' ? Number(req.body.questionId) : undefined;
    if (questionId !== undefined && !Number.isInteger(questionId))
      return res.status(400).json({ error: 'A valid question ID is required' });
    const sessions = await prisma.assessmentSession.findMany({
      where: {
        candidateUserId: req.user.id,
        finishedAt: null,
        ...(questionId ? { assessment: { questions: { some: { questionId } } } } : {}),
      },
      select: {
        startedAt: true,
        durationMinutes: true,
        assessment: { select: { timeLimitMinutes: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    if (
      !sessions.some(
        (session) =>
          Date.now() <
          session.startedAt.getTime() +
            (session.durationMinutes ?? session.assessment.timeLimitMinutes) * 60000,
      )
    )
      return res.status(403).json({
        error: 'Start an active assessment before running code or viewing sample results',
      });
    next();
  } catch (error) {
    next(error);
  }
});

// POST /api/judge/run — Run code against custom input (for "Run code" button)
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { sourceCode, languageId, stdin } = req.body;

    if (!sourceCode || !languageId) {
      return res.status(400).json({ error: 'sourceCode and languageId are required' });
    }

    const result = await executeCode({
      sourceCode,
      languageId,
      stdin: stdin || '',
      cpuTimeLimit: 5,
      memoryLimit: 256000,
    });

    // Format a clean response for the frontend
    const output = {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      compileOutput: result.compile_output || '',
      message: result.message || '',
      statusId: result.status.id,
      statusDescription: result.status.description,
      executionTime: result.time,
      memoryUsed: result.memory,
      isError: result.status.id !== 3, // 3 = Accepted (successful execution)
    };

    res.json(output);
  } catch (error: any) {
    console.error('Judge0 execution error:', error.message);
    res.status(500).json({
      error: error.message,
      isError: true,
      stdout: '',
      stderr: error.message,
      compileOutput: '',
      statusDescription: 'Internal Error',
    });
  }
});

// POST /api/judge/run-tests — Run code against all SAMPLE test cases for a question
router.post('/run-tests', async (req: Request, res: Response) => {
  try {
    const { sourceCode, languageId, questionId } = req.body;

    if (!sourceCode || !languageId || !questionId) {
      return res.status(400).json({ error: 'sourceCode, languageId, and questionId are required' });
    }

    // Fetch only sample test cases
    const question = await prisma.question.findUnique({
      // Interview-private questions execute through the interview APIs only.
      where: { id: questionId },
      select: { timeLimit: true, memoryLimit: true, questionType: true, ownerInterviewId: true },
    });
    if (question?.ownerInterviewId != null)
      return res.status(404).json({ error: 'Question not found in the shared bank' });

    const sampleTestCases = await prisma.testCase.findMany({
      where: { questionId, isSample: true },
      orderBy: { id: 'asc' },
    });

    if (sampleTestCases.length === 0) {
      return res.json({
        verdicts: [],
        message: 'No sample test cases found for this question.',
      });
    }

    const cpuTimeLimit = question?.timeLimit || 5;
    const memoryLimit = question?.memoryLimit || 256000;

    const verdicts = [];

    for (let i = 0; i < sampleTestCases.length; i++) {
      const tc = sampleTestCases[i];

      try {
        const result = await executeCode({
          sourceCode: question?.questionType === 'sql' ? `${tc.input}\n${sourceCode}` : sourceCode,
          languageId,
          stdin: question?.questionType === 'sql' ? '' : tc.input,
          expectedOutput: tc.expectedOutput,
          cpuTimeLimit,
          memoryLimit,
        });

        // Trim trailing whitespace/newlines consistently for comparison
        const actualOutput = (result.stdout || '').replace(/\s+$/, '');
        const expectedOutput = tc.expectedOutput.replace(/\s+$/, '');
        const isAccepted = result.status.id === 3;
        const passed = isAccepted && actualOutput === expectedOutput;

        verdicts.push({
          testCaseIndex: i,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: result.stdout || '',
          passed,
          statusId: result.status.id,
          statusDescription: passed
            ? 'Accepted'
            : isAccepted
              ? 'Wrong Answer'
              : result.status.description,
          stderr: result.stderr || '',
          compileOutput: result.compile_output || '',
          message: result.message || '',
          executionTime: result.time,
          memoryUsed: result.memory,
        });
      } catch (execError: any) {
        verdicts.push({
          testCaseIndex: i,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: '',
          passed: false,
          statusId: -1,
          statusDescription: 'Internal Error',
          stderr: execError.message || 'Failed to execute code',
          compileOutput: '',
          message: '',
          executionTime: null,
          memoryUsed: null,
        });
      }
    }

    // Summary counts
    const passedCount = verdicts.filter((v) => v.passed).length;

    res.json({
      verdicts,
      totalTestCases: sampleTestCases.length,
      passedCount,
      allPassed: passedCount === sampleTestCases.length,
    });
  } catch (error: any) {
    console.error('Judge0 run-tests error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/judge/languages — Get supported languages
router.get('/languages', (_req: Request, res: Response) => {
  const languages = Object.entries(LANGUAGE_MAP).map(([key, value]) => ({
    key,
    id: value.id,
    name: value.name,
    monacoLang: value.monacoLang,
  }));
  res.json(languages);
});

export default router;
