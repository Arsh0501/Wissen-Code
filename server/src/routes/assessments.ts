import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { summarizeCandidates, aggregate } from '../services/stats';
import { availabilityError } from './sessions';

const router = Router();

const STATUSES = ['draft', 'published', 'archived'];

const questionSummaryInclude = {
  questions: {
    include: {
      question: { select: { id: true, title: true, difficulty: true, tags: true } },
    },
    orderBy: { orderIndex: 'asc' as const },
  },
  _count: { select: { questions: true } },
};

function isAdmin(req: Request) {
  return req.user?.role === 'admin';
}

function availability(a: { status: string; startAt: Date | null; endAt: Date | null }) {
  if (a.status !== 'published') return a.status;
  const now = new Date();
  if (a.startAt && now < a.startAt) return 'upcoming';
  if (a.endAt && now > a.endAt) return 'closed';
  return 'open';
}

// Deterministic per-candidate shuffle so a reload shows the same order
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function statsFor(assessmentIds: number[]) {
  const [links, submissions, sessions, assessments] = await Promise.all([
    prisma.assessmentQuestion.findMany({
      where: { assessmentId: { in: assessmentIds } },
      select: { assessmentId: true, questionId: true, marks: true },
    }),
    prisma.submission.findMany({
      where: { assessmentId: { in: assessmentIds } },
      select: { assessmentId: true, candidateName: true, questionId: true, score: true, createdAt: true },
    }),
    prisma.assessmentSession.findMany({
      where: { assessmentId: { in: assessmentIds } },
      select: { assessmentId: true, candidateName: true, startedAt: true, finishedAt: true },
    }),
    prisma.assessment.findMany({
      where: { id: { in: assessmentIds } },
      select: { id: true, passingScore: true },
    }),
  ]);

  const result = new Map<number, ReturnType<typeof summarizeCandidates>>();
  for (const a of assessments) {
    result.set(
      a.id,
      summarizeCandidates(
        links.filter((l) => l.assessmentId === a.id),
        a.passingScore,
        submissions.filter((s) => s.assessmentId === a.id),
        sessions.filter((s) => s.assessmentId === a.id)
      )
    );
  }
  return result;
}

interface QuestionInput {
  questionId: number;
  marks?: number;
}

// Validates and normalises the create/update body. Returns an error string on failure.
function parseAssessmentBody(body: any, isUpdate: boolean) {
  const data: Record<string, any> = {};
  const errors: string[] = [];

  if (body.name !== undefined || !isUpdate) {
    if (typeof body.name !== 'string' || !body.name.trim()) errors.push('Name is required');
    else data.name = body.name.trim();
  }
  if (body.description !== undefined) data.description = String(body.description);
  if (body.instructions !== undefined) data.instructions = String(body.instructions);
  if (body.timeLimitMinutes !== undefined) {
    const t = Number(body.timeLimitMinutes);
    if (!Number.isInteger(t) || t < 1 || t > 600) errors.push('Time limit must be 1–600 minutes');
    else data.timeLimitMinutes = t;
  }
  if (body.passingScore !== undefined) {
    const p = Number(body.passingScore);
    if (!Number.isFinite(p) || p < 0 || p > 100) errors.push('Passing score must be 0–100');
    else data.passingScore = Math.round(p);
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push(`Status must be one of ${STATUSES.join(', ')}`);
    else data.status = body.status;
  }
  for (const key of ['startAt', 'endAt'] as const) {
    if (body[key] !== undefined) {
      if (body[key] === null || body[key] === '') data[key] = null;
      else {
        const d = new Date(body[key]);
        if (isNaN(d.getTime())) errors.push(`${key} is not a valid date`);
        else data[key] = d;
      }
    }
  }
  if (data.startAt && data.endAt && data.endAt <= data.startAt) errors.push('End time must be after start time');
  if (body.shuffleQuestions !== undefined) data.shuffleQuestions = !!body.shuffleQuestions;
  if (body.showResults !== undefined) data.showResults = !!body.showResults;
  if (body.allowedLanguages !== undefined) {
    if (!Array.isArray(body.allowedLanguages)) errors.push('allowedLanguages must be an array');
    else data.allowedLanguages = JSON.stringify(body.allowedLanguages.map(Number));
  }

  // Accept `questions: [{questionId, marks}]` or the older `questionIds: number[]`
  let questions: QuestionInput[] | undefined;
  if (Array.isArray(body.questions)) questions = body.questions;
  else if (Array.isArray(body.questionIds)) questions = body.questionIds.map((id: number) => ({ questionId: id }));
  if (questions) {
    const ids = questions.map((q) => Number(q.questionId));
    if (new Set(ids).size !== ids.length) errors.push('A question can only be added once');
    for (const q of questions) {
      if (q.marks !== undefined && (!Number.isInteger(Number(q.marks)) || Number(q.marks) < 1 || Number(q.marks) > 1000)) {
        errors.push('Marks must be a whole number between 1 and 1000');
        break;
      }
    }
  }
  if (!isUpdate && data.status === 'published' && (!questions || questions.length === 0)) {
    errors.push('Add at least one question before publishing');
  }

  return { data, questions, error: errors.length ? errors.join('; ') : null };
}

function questionRows(questions: QuestionInput[]) {
  return questions.map((q, idx) => ({
    questionId: Number(q.questionId),
    orderIndex: idx,
    marks: q.marks !== undefined ? Number(q.marks) : 10,
  }));
}

// GET /api/assessments/dashboard — Admin overview: totals, per-assessment stats, recent activity
router.get('/dashboard', adminOnly, async (_req: Request, res: Response) => {
  try {
    const [assessments, questionCount, recentSessions] = await Promise.all([
      prisma.assessment.findMany({ include: questionSummaryInclude, orderBy: { createdAt: 'desc' } }),
      prisma.question.count(),
      prisma.assessmentSession.findMany({
        orderBy: { startedAt: 'desc' },
        take: 20,
        include: { assessment: { select: { id: true, name: true } } },
      }),
    ]);

    const stats = await statsFor(assessments.map((a) => a.id));
    const rows = assessments.map((a) => {
      const candidates = stats.get(a.id) ?? [];
      return { ...a, availability: availability(a), stats: aggregate(candidates) };
    });

    const allCompleted = assessments.flatMap((a) => (stats.get(a.id) ?? []).filter((c) => c.status === 'completed'));
    const scoreBuckets = [0, 20, 40, 60, 80].map((lo) => ({
      range: `${lo}–${lo + 20}%`,
      count: allCompleted.filter((c) => c.overallScore >= lo && (lo === 80 ? c.overallScore <= 100 : c.overallScore < lo + 20)).length,
    }));

    // Recent activity with scores filled in from the in-memory summaries
    const recent = recentSessions.map((s) => {
      const summary = (stats.get(s.assessmentId) ?? []).find((c) => c.name === s.candidateName);
      return {
        candidateName: s.candidateName,
        assessmentId: s.assessmentId,
        assessmentName: s.assessment.name,
        startedAt: s.startedAt.toISOString(),
        finishedAt: s.finishedAt?.toISOString() ?? null,
        status: s.finishedAt ? 'completed' : 'in-progress',
        overallScore: s.finishedAt ? summary?.overallScore ?? 0 : null,
        passed: s.finishedAt ? summary?.passed ?? false : null,
      };
    });

    res.json({
      totals: {
        assessments: assessments.length,
        published: assessments.filter((a) => a.status === 'published').length,
        drafts: assessments.filter((a) => a.status === 'draft').length,
        questions: questionCount,
        ...aggregate(allCompleted),
        inProgress: rows.reduce((acc, r) => acc + r.stats.inProgress, 0),
        candidatesStarted: rows.reduce((acc, r) => acc + r.stats.candidatesStarted, 0),
      },
      assessments: rows,
      scoreDistribution: scoreBuckets,
      recentActivity: recent,
    });
  } catch (error) {
    console.error('Error building dashboard:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/assessments — Admin: all assessments with stats. Candidate: published ones with their own status.
router.get('/', async (req: Request, res: Response) => {
  try {
    if (isAdmin(req)) {
      const assessments = await prisma.assessment.findMany({
        include: questionSummaryInclude,
        orderBy: { createdAt: 'desc' },
      });
      const stats = await statsFor(assessments.map((a) => a.id));
      return res.json(
        assessments.map((a) => ({ ...a, availability: availability(a), stats: aggregate(stats.get(a.id) ?? []) }))
      );
    }

    const candidateName = req.user?.name || '';
    const sessions = await prisma.assessmentSession.findMany({
      where: { candidateName },
      select: { assessmentId: true, startedAt: true, finishedAt: true },
    });
    const sessionIds = sessions.map((s) => s.assessmentId);

    // Candidates also see closed/archived tests they already took, so they can view results
    const assessments = await prisma.assessment.findMany({
      where: { OR: [{ status: 'published' }, { id: { in: sessionIds } }] },
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      assessments.map((a) => {
        const session = sessions.find((s) => s.assessmentId === a.id);
        const candidateStatus = !session
          ? 'not-started'
          : session.finishedAt || Date.now() > session.startedAt.getTime() + a.timeLimitMinutes * 60000
          ? 'completed'
          : 'in-progress';
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          timeLimitMinutes: a.timeLimitMinutes,
          passingScore: a.passingScore,
          startAt: a.startAt,
          endAt: a.endAt,
          showResults: a.showResults,
          status: a.status,
          availability: availability(a),
          candidateStatus,
          questions: [],
          _count: a._count,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        };
      })
    );
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

// GET /api/assessments/:id — Admin: full config. Candidate: exam payload (sample tests only, config applied).
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const admin = isAdmin(req);

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            question: {
              include: {
                starterCodes: true,
                testCases: admin ? true : { where: { isSample: true } },
                _count: { select: { testCases: true, starterCodes: true } },
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

    if (admin) {
      const stats = await statsFor([id]);
      return res.json({
        ...assessment,
        availability: availability(assessment),
        stats: aggregate(stats.get(id) ?? []),
        candidates: stats.get(id) ?? [],
      });
    }

    const candidateName = req.user?.name || '';
    const session = await prisma.assessmentSession.findUnique({
      where: { assessmentId_candidateName: { assessmentId: id, candidateName } },
      select: { id: true },
    });
    const blocked = availabilityError(assessment);
    if (blocked && !session) {
      return res.status(403).json({ error: blocked, availability: availability(assessment) });
    }

    // Apply configuration: allowed languages + question shuffling
    let allowed: number[] = [];
    try {
      allowed = JSON.parse(assessment.allowedLanguages);
    } catch {
      allowed = [];
    }
    let questions = assessment.questions.map((aq) => ({
      ...aq,
      question: {
        ...aq.question,
        starterCodes: allowed.length
          ? aq.question.starterCodes.filter((sc) => allowed.includes(sc.languageId))
          : aq.question.starterCodes,
      },
    }));
    if (assessment.shuffleQuestions) {
      questions = seededShuffle(questions, `${id}:${candidateName}`);
    }

    res.json({ ...assessment, availability: availability(assessment), questions });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
});

// POST /api/assessments — Create a new assessment
router.post('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const { data, questions, error } = parseAssessmentBody(req.body, false);
    if (error) return res.status(400).json({ error });

    const assessment = await prisma.assessment.create({
      data: {
        ...(data as { name: string }),
        questions: questions?.length ? { create: questionRows(questions) } : undefined,
      },
      include: questionSummaryInclude,
    });

    res.status(201).json(assessment);
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
});

// PUT /api/assessments/:id — Update an assessment
router.put('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { data, questions, error } = parseAssessmentBody(req.body, true);
    if (error) return res.status(400).json({ error });

    const existing = await prisma.assessment.findUnique({
      where: { id },
      include: { _count: { select: { questions: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Assessment not found' });

    const startAt = data.startAt !== undefined ? data.startAt : existing.startAt;
    const endAt = data.endAt !== undefined ? data.endAt : existing.endAt;
    if (startAt && endAt && endAt <= startAt) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    const questionCount = questions ? questions.length : existing._count.questions;
    if ((data.status ?? existing.status) === 'published' && questionCount === 0) {
      return res.status(400).json({ error: 'Add at least one question before publishing' });
    }

    const assessment = await prisma.$transaction(async (tx) => {
      if (questions) {
        await tx.assessmentQuestion.deleteMany({ where: { assessmentId: id } });
        await tx.assessmentQuestion.createMany({
          data: questionRows(questions).map((row) => ({ ...row, assessmentId: id })),
        });
      }
      return tx.assessment.update({ where: { id }, data, include: questionSummaryInclude });
    });

    res.json(assessment);
  } catch (error) {
    console.error('Error updating assessment:', error);
    res.status(500).json({ error: 'Failed to update assessment' });
  }
});

// POST /api/assessments/:id/duplicate — Copy config + questions into a new draft
router.post('/:id/duplicate', adminOnly, async (req: Request, res: Response) => {
  try {
    const source = await prisma.assessment.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!source) return res.status(404).json({ error: 'Assessment not found' });

    const { id: _id, createdAt: _c, updatedAt: _u, questions, ...config } = source;
    const copy = await prisma.assessment.create({
      data: {
        ...config,
        name: `${source.name} (Copy)`,
        status: 'draft',
        questions: {
          create: questions.map((q) => ({ questionId: q.questionId, orderIndex: q.orderIndex, marks: q.marks })),
        },
      },
      include: questionSummaryInclude,
    });
    res.status(201).json(copy);
  } catch (error) {
    console.error('Error duplicating assessment:', error);
    res.status(500).json({ error: 'Failed to duplicate assessment' });
  }
});

// DELETE /api/assessments/:id — Delete an assessment
router.delete('/:id', adminOnly, async (req: Request, res: Response) => {
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
