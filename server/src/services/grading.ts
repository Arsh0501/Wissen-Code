import { scoreChoices } from '../platform/questions';
import prisma from '../prisma';
import { executeCode } from './judge0';

export interface Answer {
  questionId: number;
  languageId: number;
  languageName: string;
  code: string;
}

/**
 * Grades one answer against ALL test cases (sample + hidden), replacing any
 * earlier submission by the same candidate for that question.
 */
export async function gradeAnswer(
  assessmentId: number,
  candidateName: string,
  answer: Answer,
  sessionId?: number,
  onProgress?: () => Promise<void>,
) {
  await prisma.submission.deleteMany({
    where: {
      assessmentId,
      candidateName,
      questionId: answer.questionId,
      ...(sessionId ? { sessionId } : {}),
    },
  });

  const submission = await prisma.submission.create({
    data: {
      assessmentId,
      sessionId,
      questionId: answer.questionId,
      candidateName,
      languageId: answer.languageId,
      languageName: answer.languageName,
      code: answer.code,
      status: 'grading',
    },
  });

  const question = await prisma.question.findUnique({
    where: { id: answer.questionId },
    select: {
      timeLimit: true,
      memoryLimit: true,
      questionType: true,
      settings: true,
    },
  });
  if (
    question?.questionType === 'mcq' ||
    ['written', 'project'].includes(question?.questionType ?? '')
  ) {
    const manual = question?.questionType !== 'mcq';
    const score = manual ? 0 : scoreChoices(answer.code, question.settings);
    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: { status: manual ? 'pending_review' : 'graded', score },
    });
    return {
      ...updated,
      totalTestCases: 0,
      passedTestCases: 0,
      testCaseResults: [],
    };
  }
  const testCases = await prisma.testCase.findMany({
    where: { questionId: answer.questionId },
    orderBy: { id: 'asc' },
  });

  let infrastructureFailed = false;
  let passedCount = 0;
  const testCaseResults = [];

  for (const tc of testCases) {
    await onProgress?.();
    try {
      const result = await executeCode({
        sourceCode:
          question?.questionType === 'sql'
            ? `${tc.input}\n${answer.code}`
            : answer.code,
        languageId: answer.languageId,
        stdin: question?.questionType === 'sql' ? '' : tc.input,
        expectedOutput: tc.expectedOutput,
        cpuTimeLimit: question?.timeLimit || 5,
        memoryLimit: question?.memoryLimit || 256000,
      });

      const actualOutput = (result.stdout || '').trim();
      const passed =
        result.status.id === 3 && actualOutput === tc.expectedOutput.trim();
      if (passed) passedCount++;

      const tcResult = await prisma.testCaseResult.create({
        data: {
          submissionId: submission.id,
          testCaseId: tc.id,
          passed,
          actualOutput:
            actualOutput || result.compile_output || result.stderr || '',
          statusDesc: passed
            ? 'Accepted'
            : result.status.id === 3
              ? 'Wrong Answer'
              : result.status.description,
          executionTime: result.time ? parseFloat(result.time) : null,
          memoryUsed: result.memory,
        },
      });
      testCaseResults.push({ ...tcResult, isSample: tc.isSample });
    } catch (execError: any) {
      infrastructureFailed = true;
      const tcResult = await prisma.testCaseResult.create({
        data: {
          submissionId: submission.id,
          testCaseId: tc.id,
          passed: false,
          actualOutput: execError.message || 'Execution error',
          statusDesc: 'Internal Error',
        },
      });
      testCaseResults.push({ ...tcResult, isSample: tc.isSample });
    }
  }

  const score =
    testCases.length > 0 ? (passedCount / testCases.length) * 100 : 0;
  const updated = await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: infrastructureFailed ? 'execution_failed' : 'graded',
      score,
    },
  });

  if (infrastructureFailed)
    throw new Error(
      'Execution provider unavailable. The saved attempt can be regraded.',
    );
  return {
    ...updated,
    totalTestCases: testCases.length,
    passedTestCases: passedCount,
    testCaseResults,
  };
}

/**
 * Marks-weighted result for a candidate. Questions the candidate never
 * answered count as zero, so skipping a question can't raise the score.
 */
export async function computeEvaluation(
  assessmentId: number,
  candidateName: string,
  candidateUserId?: number,
) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      questions: {
        include: {
          question: {
            select: { id: true, title: true, difficulty: true, tags: true },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });
  if (!assessment) return null;

  const session = await prisma.assessmentSession.findFirst({
    where: {
      assessmentId,
      candidateName,
      ...(candidateUserId ? { candidateUserId } : {}),
    },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      startedAt: true,
      finishedAt: true,
      candidateUserId: true,
    },
  });

  if (candidateUserId && !session) return null;

  const submissions = await prisma.submission.findMany({
    where: {
      assessmentId,
      candidateName,
      ...(session?.candidateUserId ? { sessionId: session.id } : {}),
    },
    include: {
      question: { select: { id: true, title: true } },
      testCaseResults: {
        include: { testCase: { select: { id: true, isSample: true } } },
        orderBy: { testCaseId: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Keep only the latest submission per question
  const latestByQuestion = new Map<number, (typeof submissions)[number]>();
  for (const sub of submissions) {
    if (!latestByQuestion.has(sub.questionId))
      latestByQuestion.set(sub.questionId, sub);
  }

  const totalMarks = assessment.questions.reduce(
    (acc, aq) => acc + aq.marks,
    0,
  );
  const questions = assessment.questions.map((aq) => {
    const sub = latestByQuestion.get(aq.questionId) || null;
    const passed = sub ? sub.testCaseResults.filter((r) => r.passed).length : 0;
    const total = sub ? sub.testCaseResults.length : 0;
    const score = sub ? sub.score : 0;
    return {
      questionId: aq.questionId,
      title: aq.question.title,
      difficulty: aq.question.difficulty,
      marks: aq.marks,
      marksObtained: Math.round((score / 100) * aq.marks * 100) / 100,
      score,
      attempted: !!sub && sub.code.trim().length > 0,
      passedTestCases: passed,
      totalTestCases: total,
      submission: sub,
    };
  });

  const marksObtained = questions.reduce((acc, q) => acc + q.marksObtained, 0);
  const percentage = totalMarks > 0 ? (marksObtained / totalMarks) * 100 : 0;
  const timeTakenSeconds = session?.finishedAt
    ? Math.round(
        (session.finishedAt.getTime() - session.startedAt.getTime()) / 1000,
      )
    : null;

  return {
    assessment: {
      id: assessment.id,
      name: assessment.name,
      timeLimitMinutes: assessment.timeLimitMinutes,
      passingScore: assessment.passingScore,
      showResults: assessment.showResults,
    },
    candidateName,
    startedAt: session?.startedAt.toISOString() || null,
    finishedAt: session?.finishedAt?.toISOString() || null,
    timeTakenSeconds,
    totalMarks,
    marksObtained: Math.round(marksObtained * 100) / 100,
    percentage,
    passed: percentage >= assessment.passingScore,
    hasSubmissions: latestByQuestion.size > 0,
    pendingReview: [...latestByQuestion.values()].some(
      (s) => s.status === 'pending_review',
    ),
    questions,
  };
}
