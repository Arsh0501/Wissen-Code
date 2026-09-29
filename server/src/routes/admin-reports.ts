import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import puppeteer from 'puppeteer';
import { adminOnly } from '../middleware/adminOnly';
import { generateReportHTML } from '../templates/report-html';
import { summarizeCandidates, aggregate } from '../services/stats';
import { computeEvaluation } from '../services/grading';
import { MAX_TAB_SWITCHES } from './sessions';
import { parseQuestionIds, parseSelected } from '../services/question-set';

const router = Router();

// Pastes at least this long are highlighted in reports as likely copied code
const LARGE_PASTE_CHARS = 100;

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
        select: { candidateName: true, finishedAt: true, startedAt: true, questionIds: true },
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
// GET /api/admin/reports/export/:assessmentId
// Downloads every candidate's result for an assessment as CSV (opens in Excel)
// ──────────────────────────────────────────────────────────────
router.get('/export/:assessmentId', async (req: Request, res: Response) => {
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
        passingScore: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: { questionId: true, marks: true, question: { select: { title: true } } },
        },
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
        select: {
          candidateName: true,
          startedAt: true,
          finishedAt: true,
          questionIds: true,
          _count: { select: { tabSwitches: true } },
          pasteEvents: { select: { charCount: true } },
        },
      }),
    ]);

    const candidates = summarizeCandidates(assessment.questions, assessment.passingScore, submissions, sessions);
    const users = await prisma.user.findMany({
      where: { name: { in: candidates.map((c) => c.name) } },
      select: { name: true, email: true },
    });
    const emailByName = new Map(users.map((u) => [u.name, u.email]));
    const sessionByName = new Map(sessions.map((s) => [s.candidateName, s]));

    // Latest score per candidate per question, for the per-question marks columns
    const latest = new Map<string, { score: number; createdAt: Date }>();
    for (const s of submissions) {
      const key = `${s.candidateName}|${s.questionId}`;
      const prev = latest.get(key);
      if (!prev || prev.createdAt < s.createdAt) latest.set(key, { score: s.score, createdAt: s.createdAt });
    }

    // Completed candidates ranked by score; in-progress ones listed after, unranked
    const completed = candidates.filter((c) => c.status === 'completed').sort((a, b) => b.overallScore - a.overallScore);
    const inProgress = candidates.filter((c) => c.status !== 'completed');

    const header = [
      'Rank', 'Candidate', 'Email', 'Status', 'Result', 'Score %', 'Marks Obtained', 'Total Marks',
      'Questions Attempted', 'Started At', 'Submitted At', 'Time Taken (min)', 'Tab Switches', 'Pastes', 'Large Pastes',
      ...assessment.questions.map((q, i) => `Q${i + 1} ${q.question.title} (/${q.marks})`),
    ];

    const rows = [...completed, ...inProgress].map((c) => {
      const session = sessionByName.get(c.name);
      const pastes = session?.pasteEvents ?? [];
      const minutes = session?.finishedAt
        ? ((session.finishedAt.getTime() - session.startedAt.getTime()) / 60000).toFixed(1)
        : '';
      const rank = c.status === 'completed' ? completed.indexOf(c) + 1 : '';
      return [
        rank,
        c.name,
        emailByName.get(c.name) ?? '',
        c.status === 'completed' ? 'Completed' : 'In progress',
        c.status === 'completed' ? (c.passed ? 'Pass' : 'Fail') : '',
        c.overallScore.toFixed(1),
        c.marksObtained,
        c.totalMarks,
        `${c.attemptedQuestions}/${c.totalQuestions}`,
        c.startedAt ? csvDate(c.startedAt) : '',
        c.submittedAt && c.status === 'completed' ? csvDate(c.submittedAt) : '',
        minutes,
        session?._count.tabSwitches ?? 0,
        pastes.length,
        pastes.filter((p) => p.charCount >= LARGE_PASTE_CHARS).length,
        ...assessment.questions.map((q) => {
          const subset = parseQuestionIds(session?.questionIds);
          if (subset && !subset.includes(q.questionId)) return '—'; // not in this candidate's random set
          const sub = latest.get(`${c.name}|${q.questionId}`);
          return sub ? Math.round((sub.score / 100) * q.marks * 100) / 100 : 0;
        }),
      ];
    });

    // BOM so Excel detects UTF-8 (names/titles with non-ASCII characters)
    const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const safeName = assessment.name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="results-${safeName || assessment.id}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting assessment results:', error);
    res.status(500).json({ error: 'Failed to export results' });
  }
});

function csvCell(value: unknown): string {
  let s = String(value ?? '');
  // Neutralise spreadsheet formula injection from user-controlled text (names, titles)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvDate(iso: string): string {
  // "2026-09-25 14:05" — sorts correctly and Excel parses it as a date
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
        margin: { top: '28px', right: '28px', bottom: '40px', left: '28px' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 28px;display:flex;justify-content:space-between;font-family:-apple-system,sans-serif;">
          <span>WissenCode · Confidential assessment report</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
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

  // A finished attempt still has a report even if nothing was submitted (e.g. an empty retake)
  if (submissions.length === 0) {
    const finished = await prisma.assessmentSession.findFirst({ where: { assessmentId, candidateName, finishedAt: { not: null } }, select: { id: true } });
    if (!finished) return null;
  }

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
      pasteEvents: { orderBy: { occurredAt: 'asc' }, select: { questionId: true, charCount: true, lineCount: true, occurredAt: true } },
    },
  });
  const tabSwitches = session?.tabSwitches ?? [];
  const pasteEvents = session?.pasteEvents ?? [];

  // Candidates are linked to user accounts by name; seeded demo candidates have no account
  const user = await prisma.user.findFirst({ where: { name: candidateName }, select: { email: true } });

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
      code: sub.code,
    };
  });

  const overallPercentage = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
  const evaluation = await computeEvaluation(assessmentId, candidateName);
  // Multiple-choice questions: options, the answer key and what the candidate picked
  const mcqRows = await prisma.question.findMany({
    where: { id: { in: (evaluation?.questions ?? []).filter((q) => q.type === 'mcq').map((q) => q.questionId) } },
    select: { id: true, statement: true, options: true, correctOptions: true },
  });
  const mcqById = new Map(mcqRows.map((m) => [m.id, { statement: m.statement, options: JSON.parse(m.options || '[]') as { id: string; text: string }[], correct: parseSelected(m.correctOptions) }]));
  const history = await prisma.attemptHistory.findMany({ where: { assessmentId, candidateName }, orderBy: { attempt: 'asc' } });

  // Titles for every question in the assessment, including ones the candidate didn't submit
  const questionTitles = new Map<number, string>(evaluation?.questions.map((q) => [q.questionId, q.title]) ?? []);


  return {
    candidate: {
      id: candidateName,
      name: candidateName,
      email: user?.email ?? null,
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
      questions_attempted: evaluation?.questions.filter((q) => q.attempted).length ?? questions.length,
      questions_total: evaluation?.questions.length ?? questions.length,
    },
    attempt: evaluation?.attempt ?? 1,
    previous_attempts: history.map((h) => ({
      attempt: h.attempt,
      percentage: h.percentage,
      passed: h.passed,
      finished_at: h.finishedAt?.toISOString() ?? null,
    })),
    // Every question the candidate received (in assessment order); unanswered ones are flagged, not dropped
    questions: (evaluation?.questions ?? []).map((eq) => {
      const q = questions.find((x) => x.question_id === eq.questionId);
      const mcq = mcqById.get(eq.questionId);
      return {
        type: (eq.type === 'mcq' ? 'mcq' : 'coding') as 'mcq' | 'coding',
        mcq: mcq ? { statement: mcq.statement, options: mcq.options, correct: mcq.correct, selected: q ? parseSelected(q.code) : [] } : null,
        question_id: eq.questionId,
        title: eq.title,
        language: q?.language ?? '—',
        testcases_passed: q?.testcases_passed ?? 0,
        testcases_total: q?.testcases_total ?? 0,
        score: q?.score ?? 0,
        failed_cases: q?.failed_cases ?? [],
        code: q?.code ?? '',
        marks: eq.marks,
        marks_obtained: eq.marksObtained,
        attempted: eq.attempted,
      };
    }),
    // How this candidate compares with everyone who completed the assessment
    cohort: await buildCohort(assessmentId, candidateName),
    // REAL data — captured by the exam page while the session was in progress
    tab_switches: {
      count: tabSwitches.length,
      limit: MAX_TAB_SWITCHES,
      limit_exceeded: tabSwitches.length >= MAX_TAB_SWITCHES, // limit reached, test was auto-submitted
      total_duration_ms: tabSwitches.reduce((sum, e) => sum + e.durationMs, 0),
      events: tabSwitches.map((e) => ({ duration_ms: e.durationMs, occurred_at: e.leftAt.toISOString() })),
    },
    // REAL data — every paste into the code editor during the session
    paste_events: {
      count: pasteEvents.length,
      total_chars: pasteEvents.reduce((sum, e) => sum + e.charCount, 0),
      large_count: pasteEvents.filter((e) => e.charCount >= LARGE_PASTE_CHARS).length,
      large_threshold: LARGE_PASTE_CHARS,
      events: pasteEvents.map((e) => ({
        question_id: e.questionId,
        question_title: questionTitles.get(e.questionId) ?? `Question ${e.questionId}`,
        char_count: e.charCount,
        line_count: e.lineCount,
        occurred_at: e.occurredAt.toISOString(),
      })),
    },
  };
}

// ──────────────────────────────────────────────────────────────
// Helper: rank / percentile / averages among completed candidates
// ──────────────────────────────────────────────────────────────
async function buildCohort(assessmentId: number, candidateName: string) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { passingScore: true, questions: { select: { questionId: true, marks: true } } },
  });
  if (!assessment) return null;

  const [submissions, sessions] = await Promise.all([
    prisma.submission.findMany({
      where: { assessmentId },
      select: { candidateName: true, score: true, createdAt: true, questionId: true },
    }),
    prisma.assessmentSession.findMany({
      where: { assessmentId },
      select: { candidateName: true, startedAt: true, finishedAt: true, questionIds: true },
    }),
  ]);

  const candidates = summarizeCandidates(assessment.questions, assessment.passingScore, submissions, sessions);
  const completed = candidates.filter((c) => c.status === 'completed');
  const me = completed.find((c) => c.name === candidateName);
  const stats = aggregate(candidates);

  // Ties share a rank; percentile = share of the *other* candidates scoring strictly lower
  const rank = me ? completed.filter((c) => c.overallScore > me.overallScore).length + 1 : null;
  const below = me ? completed.filter((c) => c.overallScore < me.overallScore).length : 0;
  const percentile = me && completed.length > 1 ? Math.round((below / (completed.length - 1)) * 100) : null;

  return {
    rank,
    completed_count: completed.length,
    percentile,
    average_score: stats.averageScore,
    highest_score: stats.highestScore,
    pass_rate: stats.passRate,
  };
}

export default router;
