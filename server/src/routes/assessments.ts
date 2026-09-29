import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { computeEvaluation } from '../services/grading';
import { canAccessAssessment, filterAccessible, parseEmailList } from '../services/access';
import { parseQuestionIds, seededShuffle } from '../services/question-set';
import { adminOnly } from '../middleware/adminOnly';
import { summarizeCandidates, aggregate } from '../services/stats';
import { availabilityError } from './sessions';

const router = Router();

const STATUSES = ['draft', 'published', 'archived'];
const DIFFICULTIES = ['mixed', 'easy', 'medium', 'hard'];
const QUESTION_TYPES = ['coding', 'mcq'];
const ACCESS_MODES = ['anyone', 'restricted', 'invite_only'];
const EMAIL_OR_DOMAIN = /^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/;

// Where an assessment is in its life: draft → scheduled/active → expired (end date passed) or completed (closed by admin)
export function lifecycle(a: { status: string; startAt: Date | null; endAt: Date | null }): 'draft' | 'scheduled' | 'active' | 'expired' | 'completed' {
  if (a.status === 'draft') return 'draft';
  if (a.status === 'archived') return 'completed';
  const now = new Date();
  if (a.endAt && now > a.endAt) return 'expired';
  if (a.startAt && now < a.startAt) return 'scheduled';
  return 'active';
}

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
      select: { assessmentId: true, candidateName: true, startedAt: true, finishedAt: true, questionIds: true },
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
  if (body.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(body.difficulty)) errors.push(`Difficulty must be one of ${DIFFICULTIES.join(', ')}`);
    else data.difficulty = body.difficulty;
  }
  if (body.topics !== undefined) {
    if (!Array.isArray(body.topics)) errors.push('topics must be an array');
    else data.topics = JSON.stringify(body.topics.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 20));
  }
  if (body.questionTypes !== undefined) {
    if (!Array.isArray(body.questionTypes) || !body.questionTypes.length || body.questionTypes.some((t: unknown) => !QUESTION_TYPES.includes(String(t)))) {
      errors.push('Pick at least one question type (coding, mcq)');
    } else data.questionTypes = JSON.stringify(Array.from(new Set(body.questionTypes)));
  }
  if (body.questionCount !== undefined) {
    if (body.questionCount === null || body.questionCount === '') data.questionCount = null;
    else {
      const c = Number(body.questionCount);
      if (!Number.isInteger(c) || c < 1 || c > 200) errors.push('Question count must be a whole number of at least 1');
      else data.questionCount = c;
    }
  }
  if (body.shuffleOptions !== undefined) data.shuffleOptions = !!body.shuffleOptions;
  if (body.maxAttempts !== undefined) {
    const m = Number(body.maxAttempts);
    if (!Number.isInteger(m) || m < 1 || m > 10) errors.push('Attempts must be between 1 and 10');
    else data.maxAttempts = m;
  }
  if (body.accessMode !== undefined) {
    if (!ACCESS_MODES.includes(body.accessMode)) errors.push(`Access must be one of ${ACCESS_MODES.join(', ')}`);
    else data.accessMode = body.accessMode;
  }
  if (body.allowedEmails !== undefined) {
    if (!Array.isArray(body.allowedEmails)) errors.push('allowedEmails must be an array');
    else {
      const list = Array.from(new Set(body.allowedEmails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean))) as string[];
      const bad = list.filter((e) => !EMAIL_OR_DOMAIN.test(e));
      if (bad.length) errors.push(`Not a valid email or @domain: ${bad.slice(0, 3).join(', ')}`);
      else data.allowedEmails = JSON.stringify(list);
    }
  }
  if (data.accessMode === 'restricted' && body.allowedEmails !== undefined && parseEmailList(data.allowedEmails).length === 0) {
    errors.push('Add at least one allowed email or @domain for a restricted assessment');
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
  if (questions && data.questionCount && data.questionCount > questions.length) {
    errors.push(`Question count (${data.questionCount}) is more than the ${questions.length} selected question${questions.length === 1 ? '' : 's'}`);
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
      prisma.question.count({ where: { status: 'active' } }),
      prisma.assessmentSession.findMany({
        orderBy: { startedAt: 'desc' },
        take: 20,
        include: { assessment: { select: { id: true, name: true } } },
      }),
    ]);

    const ids = assessments.map((a) => a.id);
    const [stats, redemptions] = await Promise.all([
      statsFor(ids),
      prisma.inviteRedemption.findMany({
        where: { invite: { assessmentId: { in: ids } } },
        select: { userId: true, user: { select: { name: true } }, invite: { select: { assessmentId: true } } },
      }),
    ]);
    const rows = assessments.map((a) => {
      const candidates = stats.get(a.id) ?? [];
      const summary = aggregate(candidates);
      // Candidates = everyone assigned or who has taken part: allow-listed emails, link joiners and anyone who started
      const joined = new Set(redemptions.filter((r) => r.invite.assessmentId === a.id).map((r) => r.user.name));
      for (const c of candidates) joined.add(c.name);
      const allowList = a.accessMode === 'restricted' ? parseEmailList(a.allowedEmails).filter((e) => !e.startsWith('@')).length : 0;
      return {
        ...a,
        availability: availability(a),
        lifecycle: lifecycle(a),
        stats: summary,
        counts: {
          candidates: Math.max(joined.size, allowList),
          started: summary.candidatesStarted,
          completed: summary.candidatesCompleted,
        },
      };
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
      lifecycleTotals: {
        draft: rows.filter((r) => r.lifecycle === 'draft').length,
        active: rows.filter((r) => r.lifecycle === 'active' || r.lifecycle === 'scheduled').length,
        completed: rows.filter((r) => r.lifecycle === 'completed').length,
        expired: rows.filter((r) => r.lifecycle === 'expired').length,
      },
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

// GET /api/assessments — Admin: all assessments with stats. Examinee: published ones with their own status.
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
      select: { assessmentId: true, startedAt: true, finishedAt: true, attempt: true },
    });
    const sessionIds = sessions.map((s) => s.assessmentId);

    // Candidates also see closed/archived tests they already took, so they can view results.
    // Access rules (restricted emails, invite-only, link guests) decide which others they see.
    const all = await prisma.assessment.findMany({
      where: { OR: [{ status: 'published' }, { id: { in: sessionIds } }] },
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const accessible = new Set((await filterAccessible(req, all)).map((a) => a.id));
    const assessments = all.filter((a) => accessible.has(a.id) || sessionIds.includes(a.id));

    const rows = await Promise.all(
      assessments.map(async (a) => {
        const session = sessions.find((s) => s.assessmentId === a.id);
        const deadline = session ? session.startedAt.getTime() + a.timeLimitMinutes * 60000 : 0;
        const candidateStatus = !session
          ? 'not-started'
          : session.finishedAt || Date.now() > deadline
          ? 'completed'
          : 'in-progress';

        // Candidate's own score for finished tests — withheld when the admin turned results off
        let result = null;
        if (candidateStatus === 'completed' && a.showResults) {
          const evaluation = await computeEvaluation(a.id, candidateName);
          if (evaluation?.hasSubmissions || session?.finishedAt) {
            result = {
              percentage: evaluation?.percentage ?? 0,
              passed: evaluation?.passed ?? false,
              marksObtained: evaluation?.marksObtained ?? 0,
              totalMarks: evaluation?.totalMarks ?? 0,
              timeTakenSeconds: evaluation?.timeTakenSeconds ?? null,
            };
          }
        }

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
          startedAt: session?.startedAt.toISOString() ?? null,
          finishedAt: session?.finishedAt?.toISOString() ?? null,
          remainingSeconds: candidateStatus === 'in-progress' ? Math.max(0, Math.floor((deadline - Date.now()) / 1000)) : null,
          result,
          attempt: session?.attempt ?? 0,
          maxAttempts: a.maxAttempts,
          // Another attempt is possible when the last one is finished, attempts remain and the test is open
          canRetake: candidateStatus === 'completed' && (session?.attempt ?? 0) < a.maxAttempts && availability(a) === 'open' && accessible.has(a.id),
          questions: [],
          // A random subset means each candidate answers fewer questions than the assessment holds
          _count: { questions: a.questionCount ? Math.min(a.questionCount, a._count.questions) : a._count.questions },
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        };
      })
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

// GET /api/assessments/:id — Admin: full config. Examinee: exam payload (sample tests only, config applied).
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

    if (!(await canAccessAssessment(req, id))) {
      return res.status(403).json({ error: 'You were not invited to this assessment' });
    }

    const candidateName = req.user?.name || '';
    const session = await prisma.assessmentSession.findUnique({
      where: { assessmentId_candidateName: { assessmentId: id, candidateName } },
      select: { id: true, attempt: true, questionIds: true },
    });
    const blocked = availabilityError(assessment);
    if (blocked && !session) {
      return res.status(403).json({ error: blocked, availability: availability(assessment) });
    }

    const questionTotal = assessment.questionCount ? Math.min(assessment.questionCount, assessment.questions.length) : assessment.questions.length;
    // Never send answer keys or reference solutions to candidates
    const { allowedEmails: _emails, ...publicConfig } = assessment;
    const base = { ...publicConfig, availability: availability(assessment), questionTotal };

    // Questions are only sent once the candidate has started — the pre-test screen needs just the count
    if (!session) return res.json({ ...base, questions: [] });

    let allowed: number[] = [];
    try {
      allowed = JSON.parse(assessment.allowedLanguages);
    } catch {
      allowed = [];
    }
    const seed = `${id}:${candidateName}:${session.attempt}`;
    const subset = parseQuestionIds(session.questionIds);
    let questions = assessment.questions
      .filter((aq) => !subset || subset.includes(aq.questionId))
      .map((aq) => {
        const { correctOptions: _c, explanation: _e, referenceSolution: _r, validation: _v, ...question } = aq.question;
        let options: { id: string; text: string }[] = [];
        try {
          options = JSON.parse(question.options || '[]');
        } catch {
          options = [];
        }
        if (assessment.shuffleOptions && options.length) options = seededShuffle(options, `${seed}:${aq.questionId}`);
        return {
          ...aq,
          question: {
            ...question,
            options: JSON.stringify(options),
            // Tells the UI to allow several selections, without revealing which ones
            multipleCorrect: (() => { try { return JSON.parse(_c || '[]').length > 1; } catch { return false; } })(),
            starterCodes: allowed.length
              ? question.starterCodes.filter((sc) => allowed.includes(sc.languageId))
              : question.starterCodes,
          },
        };
      });
    if (assessment.shuffleQuestions) {
      questions = seededShuffle(questions, seed);
    }

    res.json({ ...base, questions });
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
