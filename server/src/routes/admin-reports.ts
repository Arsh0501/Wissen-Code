import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import puppeteer from 'puppeteer';
import { adminOnly } from '../middleware/adminOnly';
import { generateReportHTML } from '../templates/report-html';
import { summarizeCandidates, aggregate } from '../services/stats';
import { computeEvaluation } from '../services/grading';
import { MAX_TAB_SWITCHES } from './sessions';

const router = Router();

// All routes in this file require admin role
router.use(adminOnly);

// ──────────────────────────────────────────────────────────────
// GET /api/admin/reports/submissions/:assessmentId
// Lists all candidates who submitted for a given assessment
// ──────────────────────────────────────────────────────────────
router.get('/submissions/:assessmentId', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(req.params.assessmentId);
    if (isNaN(assessmentId)) {
      return res.status(400).json({ error: 'Invalid assessmentId' });
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        name: true,
        timeLimitMinutes: true,
        passingScore: true,
        questions: { select: { questionId: true, marks: true } },
      },
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const [submissions, sessions] = await Promise.all([
      prisma.submission.findMany({
        where: { assessmentId },
        select: { candidateName: true, score: true, createdAt: true, questionId: true },
      }),
      prisma.assessmentSession.findMany({
        where: { assessmentId },
        select: { candidateName: true, finishedAt: true, startedAt: true },
      }),
    ]);

    const candidates = summarizeCandidates(assessment.questions, assessment.passingScore, submissions, sessions)
      .map((c) => {
        const s = sessions.find((x) => x.candidateName === c.name);
        return {
          ...c,
          session: s ? { startedAt: s.startedAt.toISOString(), finishedAt: s.finishedAt?.toISOString() || null } : null,
        };
      })
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));

    const { questions: _q, ...assessmentInfo } = assessment;
    res.json({
      assessment: assessmentInfo,
      candidates,
      stats: aggregate(candidates),
    });
  } catch (error) {
    console.error('Error fetching assessment submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/admin/reports/:candidateName/:assessmentId/data
// Returns detailed report data for a specific candidate's assessment
// ──────────────────────────────────────────────────────────────
router.get('/:candidateName/:assessmentId/data', async (req: Request, res: Response) => {
  try {
    const { candidateName } = req.params;
    const assessmentId = parseInt(req.params.assessmentId);

    if (isNaN(assessmentId) || !candidateName) {
      return res.status(400).json({ error: 'Invalid candidateName or assessmentId' });
    }

    const reportData = await buildReportData(candidateName, assessmentId);
    if (!reportData) {
      return res.status(404).json({ error: 'No submissions found for this candidate and assessment' });
    }

    res.json(reportData);
  } catch (error) {
    console.error('Error building report data:', error);
    res.status(500).json({ error: 'Failed to build report data' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/admin/reports/:candidateName/:assessmentId/download
// Generates and streams a PDF report
// ──────────────────────────────────────────────────────────────
router.get('/:candidateName/:assessmentId/download', async (req: Request, res: Response) => {
  try {
    const { candidateName } = req.params;
    const assessmentId = parseInt(req.params.assessmentId);

    if (isNaN(assessmentId) || !candidateName) {
      return res.status(400).json({ error: 'Invalid candidateName or assessmentId' });
    }

    console.log(`[Admin Reports] Generating PDF for candidate "${candidateName}", assessment ${assessmentId}`);
    const reportData = await buildReportData(candidateName, assessmentId);
    if (!reportData) {
      return res.status(404).json({ error: 'No submissions found for this candidate and assessment' });
    }

    const html = generateReportHTML(reportData);
    console.log(`[Admin Reports] HTML generated (${html.length} chars). Launching Puppeteer...`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      console.log('[Admin Reports] Generating page.pdf...');
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16px', right: '16px', bottom: '16px', left: '16px' },
      });

      console.log(`[Admin Reports] PDF generated (${pdfBuffer.length} bytes). Sending response...`);
      const safeName = candidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `report-${safeName}-assessment-${assessmentId}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(Buffer.from(pdfBuffer));
    } finally {
      await browser.close();
      console.log('[Admin Reports] Browser closed successfully.');
    }
  } catch (error) {
    console.error('Error generating PDF report:', error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

// ──────────────────────────────────────────────────────────────
// Helper: Build report data from real DB + static placeholders
// ──────────────────────────────────────────────────────────────
async function buildReportData(candidateName: string, assessmentId: number) {
  // Fetch assessment
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, name: true, timeLimitMinutes: true },
  });

  if (!assessment) return null;

  // Fetch all submissions for this candidate + assessment with test results
  const submissions = await prisma.submission.findMany({
    where: { assessmentId, candidateName },
    include: {
      question: { select: { id: true, title: true } },
      testCaseResults: {
        include: {
          testCase: { select: { id: true, expectedOutput: true, isSample: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (submissions.length === 0) return null;

  // Deduplicate: keep only latest submission per question
  const latestByQuestion = new Map<number, typeof submissions[0]>();
  for (const sub of submissions) {
    if (!latestByQuestion.has(sub.questionId)) {
      latestByQuestion.set(sub.questionId, sub);
    }
  }
  const dedupedSubs = Array.from(latestByQuestion.values()).sort(
    (a, b) => a.questionId - b.questionId
  );

  // Fetch session info for submission timestamp
  const session = await prisma.assessmentSession.findFirst({
    where: { assessmentId, candidateName },
    select: {
      finishedAt: true,
      startedAt: true,
      tabSwitches: { orderBy: { leftAt: 'asc' }, select: { leftAt: true, durationMs: true } },
    },
  });
  const tabSwitches = session?.tabSwitches ?? [];

  const submittedAt =
    session?.finishedAt?.toISOString() ||
    dedupedSubs[dedupedSubs.length - 1]?.createdAt.toISOString() ||
    new Date().toISOString();

  // Build per-question data (REAL data from DB)
  let totalPassed = 0;
  let totalTests = 0;

  const questions = dedupedSubs.map((sub) => {
    const tcResults = sub.testCaseResults || [];
    const passed = tcResults.filter((r) => r.passed).length;
    const total = tcResults.length;
    totalPassed += passed;
    totalTests += total;

    const failedCases = tcResults
      .filter((r) => !r.passed)
      .map((r) => ({
        testcase_id: r.testCaseId,
        expected_output: r.testCase?.expectedOutput || '',
        actual_output: r.actualOutput || '',
        status: r.statusDesc?.toLowerCase().replace(/\s+/g, '_') || 'wrong_answer',
      }));

    return {
      question_id: sub.questionId,
      title: sub.question?.title || `Question ${sub.questionId}`,
      language: sub.languageName,
      testcases_passed: passed,
      testcases_total: total,
      score: total > 0 ? (passed / total) * 100 : 0,
      failed_cases: failedCases,
    };
  });

  const overallPercentage = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
  const evaluation = await computeEvaluation(assessmentId, candidateName);


  return {
    candidate: {
      id: candidateName,
      name: candidateName,
      email: 'not-available@placeholder.com', // PLACEHOLDER — no email field exists yet
    },
    assessment: {
      id: assessment.id,
      title: assessment.name,
      duration_minutes: assessment.timeLimitMinutes,
      submitted_at: submittedAt,
    },
    overall_score: {
      passed: totalPassed,
      total: totalTests,
      percentage: overallPercentage,
    },
    // Marks-weighted result — this is what pass/fail is based on
    marks: {
      obtained: evaluation?.marksObtained ?? 0,
      total: evaluation?.totalMarks ?? 0,
      percentage: evaluation?.percentage ?? 0,
      passing_score: evaluation?.assessment.passingScore ?? 0,
      passed: evaluation?.passed ?? false,
      time_taken_seconds: evaluation?.timeTakenSeconds ?? null,
    },
    questions: questions.map((q) => ({
      ...q,
      marks: evaluation?.questions.find((eq) => eq.questionId === q.question_id)?.marks ?? 0,
      marks_obtained: evaluation?.questions.find((eq) => eq.questionId === q.question_id)?.marksObtained ?? 0,
    })),
    // REAL data — captured by the exam page while the session was in progress
    tab_switches: {
      count: tabSwitches.length,
      limit: MAX_TAB_SWITCHES,
      limit_exceeded: tabSwitches.length >= MAX_TAB_SWITCHES, // limit reached, test was auto-submitted

      total_duration_ms: tabSwitches.reduce((sum, e) => sum + e.durationMs, 0),
      events: tabSwitches.map((e) => ({ duration_ms: e.durationMs, occurred_at: e.leftAt.toISOString() })),
    },
    // ═══ STATIC PLACEHOLDER DATA ═══
    // Everything below is hardcoded sample data.
    // These modules are NOT connected to any real capture mechanism.
    // Replace each section as the corresponding feature is implemented.
    integrity_placeholder: {
      is_placeholder: true,
      copy_paste: {
        count: 1,
        events: [
          {
            action: 'paste',
            char_count: 340,
            question_id: questions[0]?.question_id?.toString() || '1',
          },
        ],
      },
      screenshots: {
        average_confidence_score: 0.91,
        snapshot_count: 6,
        flagged_snapshots: [],
      },
      plagiarism: {
        status: 'complete',
        matches: [],
      },
      ai_code_detection: {
        status: 'complete',
        flags: [],
      },
    },
  };
}

export default router;
