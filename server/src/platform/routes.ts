import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { computeEvaluation } from '../services/grading';
import { WorkflowError } from '../services/structured-ai';
import { isMockMode } from '../services/judge0';
import {
  appURL,
  calendarEvent,
  enqueueMail,
  mailConfigured,
} from './communication';
import { fingerprints, similarity } from './integrity';
const router = Router();
router.use(adminOnly);
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
const idOf = (value: unknown) =>
  z.coerce.number().int().positive().parse(value);
export async function audit(
  actorId: number | undefined,
  action: string,
  resource: string,
  resourceId: string,
  detail: Record<string, string | number | boolean> = {},
) {
  await prisma.auditEvent.create({
    data: { actorId, action, resource, resourceId, detail },
  });
}
router.get(
  '/readiness',
  wrap(async (_req, res) => {
    let database = false;
    let redis = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {}
    if (process.env.REDIS_URL) {
      const { redisConnection } = await import('../ai/queue');
      const connection = redisConnection(true);
      try {
        await Promise.race([
          connection.connect(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Redis connection timeout')),
              5500,
            ),
          ),
        ]);
        redis = (await connection.ping()) === 'PONG';
      } catch {
      } finally {
        connection.disconnect();
      }
    }
    const checks = [
      {
        name: 'PostgreSQL',
        ready: database,
        detail: database ? 'Connected' : 'Connection failed',
      },
      {
        name: 'Redis',
        ready: redis,
        detail: redis ? 'Connected' : 'Configure REDIS_URL and start Redis',
      },
      {
        name: 'Real code execution',
        ready: !isMockMode(),
        detail: isMockMode()
          ? 'Demo simulation enabled; configure a live Judge0 service'
          : 'Live mode configured; verify execution against your provider',
      },
      {
        name: 'AI',
        ready: !!process.env.OPENAI_API_KEY,
        detail: process.env.OPENAI_API_KEY
          ? 'API key configured; verify generation with your worker'
          : 'OPENAI_API_KEY missing',
      },
      {
        name: 'Email',
        ready: mailConfigured(),
        detail: mailConfigured()
          ? 'Sender configured'
          : 'Configure RESEND_API_KEY and MAIL_FROM',
      },
      {
        name: 'Public HTTPS URL',
        ready: (process.env.APP_URL ?? '').startsWith('https://'),
        detail: 'APP_URL must match your deployed frontend',
      },
      {
        name: 'Allowed frontend origins',
        ready: !!process.env.CORS_ORIGINS,
        detail: 'Set CORS_ORIGINS for HTTP and Socket.IO',
      },
    ];
    res.json({ ready: checks.every((c) => c.ready), checks });
  }),
);
router.get(
  '/audit',
  wrap(async (req, res) => {
    const before = req.query.before ? idOf(req.query.before) : undefined;
    res.json(
      await prisma.auditEvent.findMany({
        where: before ? { id: { lt: before } } : {},
        orderBy: { id: 'desc' },
        take: 100,
      }),
    );
  }),
);
router.get(
  '/interviews/:id/replay',
  wrap(async (req, res) => {
    const interview = await prisma.interview.findFirst({
      where: { id: idOf(req.params.id), interviewerId: req.user!.id },
      select: {
        id: true,
        title: true,
        candidateName: true,
        startedAt: true,
        endedAt: true,
        status: true,
      },
    });
    if (!interview) throw new WorkflowError('Interview not found', 404);
    const after = req.query.after ? idOf(req.query.after) : 0;
    const events = await prisma.interviewEvent.findMany({
      where: { interviewId: interview.id, id: { gt: after } },
      orderBy: { id: 'asc' },
      take: 500,
    });
    res.json({
      interview,
      events: events.map((e) => ({ ...e, payload: JSON.parse(e.payload) })),
      next: events.length === 500 ? events.at(-1)!.id : null,
    });
  }),
);
router.get(
  '/interviews/:id/calendar',
  wrap(async (req, res) => {
    const interview = await prisma.interview.findFirst({
      where: { id: idOf(req.params.id), interviewerId: req.user!.id },
    });
    if (!interview || !interview.scheduledAt)
      throw new WorkflowError(
        'Schedule the interview before downloading its calendar event',
        400,
      );
    res
      .type('text/calendar')
      .attachment(`interview-${interview.id}.ics`)
      .send(
        calendarEvent({ ...interview, scheduledAt: interview.scheduledAt }),
      );
  }),
);
router.post(
  '/interviews/:id/invitation',
  wrap(async (req, res) => {
    if (!mailConfigured())
      throw new WorkflowError(
        'Configure email delivery before sending invitations',
        503,
      );
    const interview = await prisma.interview.findFirst({
      where: { id: idOf(req.params.id), interviewerId: req.user!.id },
    });
    if (!interview || interview.status !== 'scheduled')
      throw new WorkflowError('Scheduled interview not found', 404);
    await enqueueMail(
      interview.candidateEmail,
      interview.title,
      `Hello ${interview.candidateName},\n\nYour interview: ${interview.title}\n${interview.scheduledAt?.toISOString() ?? 'Time to be confirmed'}\nDuration: ${interview.timeLimitMinutes} minutes\nJoin: ${appURL(`/interview/${interview.roomToken}`)}`,
      req.user!.id,
    );
    await audit(
      req.user!.id,
      'invitation.queued',
      'interview',
      String(interview.id),
    );
    res.status(202).json({ message: 'Interview invitation queued' });
  }),
);
router.get(
  '/messages',
  wrap(async (req, res) => {
    // Recovery/verification bodies contain secrets and are never returned to the admin UI.
    res.json(
      await prisma.outboundMessage.findMany({
        where: { authorId: req.user!.id, kind: 'email' },
        select: {
          id: true,
          recipient: true,
          subject: true,
          status: true,
          scheduledAt: true,
          deliveredAt: true,
          error: true,
          attempts: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }),
);
router.post(
  '/messages/:id/retry',
  wrap(async (req, res) => {
    if (!mailConfigured())
      throw new WorkflowError('Email delivery is not configured', 503);
    const result = await prisma.outboundMessage.updateMany({
      where: { id: req.params.id, authorId: req.user!.id, status: 'failed' },
      data: {
        status: 'pending',
        scheduledAt: new Date(),
        attempts: 0,
        error: null,
      },
    });
    if (!result.count) throw new WorkflowError('Failed message not found', 404);
    res.json({ message: 'Message queued for retry' });
  }),
);
router.post(
  '/assessments/:id/invitations',
  wrap(async (req, res) => {
    if (!mailConfigured())
      throw new WorkflowError(
        'Configure email delivery before sending invitations',
        503,
      );
    const input = z
      .object({
        emails: z.array(z.email().max(254)).min(1).max(100),
        reminderAt: z.iso.datetime().optional(),
      })
      .parse(req.body);
    const assessment = await prisma.assessment.findUnique({
      where: { id: idOf(req.params.id) },
    });
    if (
      !assessment ||
      assessment.status !== 'published' ||
      (assessment.endAt && assessment.endAt < new Date())
    )
      throw new WorkflowError('Choose an active published assessment');
    const reminder = input.reminderAt ? new Date(input.reminderAt) : null;
    if (
      reminder &&
      (reminder < new Date() ||
        (assessment.endAt && reminder >= assessment.endAt))
    )
      throw new WorkflowError(
        'Reminder must be in the future and before the assessment closes',
      );
    const emails = [...new Set(input.emails.map((e) => e.toLowerCase()))];
    await prisma.$transaction(async (tx) => {
      for (const email of emails) {
        const invite = await tx.inviteLink.create({
          data: {
            assessmentId: assessment.id,
            token: crypto.randomBytes(32).toString('hex'),
            label: email,
            maxUses: 1,
            expiresAt: assessment.endAt,
          },
        });
        const body = `You are invited to ${assessment.name}.\nDuration: ${assessment.timeLimitMinutes} minutes\n${assessment.endAt ? `Closes: ${assessment.endAt.toISOString()}\n` : ''}Open your invitation: ${appURL(`/invite/${invite.token}`)}`;
        await tx.outboundMessage.create({
          data: {
            authorId: req.user!.id,
            recipient: email,
            subject: `Assessment invitation: ${assessment.name}`,
            body,
          },
        });
        if (reminder)
          await tx.outboundMessage.create({
            data: {
              authorId: req.user!.id,
              recipient: email,
              subject: `Reminder: ${assessment.name}`,
              body,
              scheduledAt: reminder,
            },
          });
      }
      await tx.auditEvent.create({
        data: {
          actorId: req.user!.id,
          action: 'invitations.queued',
          resource: 'assessment',
          resourceId: String(assessment.id),
          detail: { count: emails.length },
        },
      });
    });
    res
      .status(202)
      .json({ count: emails.length, message: 'Invitations queued' });
  }),
);
router.get(
  '/assessments/:id/analytics',
  wrap(async (req, res) => {
    const from = req.query.from
      ? z.iso.date().parse(req.query.from)
      : undefined;
    const to = req.query.to ? z.iso.date().parse(req.query.to) : undefined;
    if (from && to && from > to)
      throw new WorkflowError('Start date must precede end date');
    const assessment = await prisma.assessment.findUnique({
      where: { id: idOf(req.params.id) },
      include: {
        questions: {
          include: {
            question: {
              select: { id: true, title: true, tags: true, difficulty: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        sessions: {
          where: {
            startedAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          },
          include: {
            submissions: {
              select: {
                questionId: true,
                score: true,
                status: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { startedAt: 'desc' },
          take: 1000,
        },
      },
    });
    if (!assessment) throw new WorkflowError('Assessment not found', 404);
    const completed = assessment.sessions.filter(
      (s) => !!s.finishedAt && s.gradingStatus === 'completed',
    );
    const candidates = completed.map((s) => {
      const latest = new Map<number, number>();
      for (const sub of s.submissions)
        if (!latest.has(sub.questionId)) latest.set(sub.questionId, sub.score);
      const total = assessment.questions.reduce((sum, q) => sum + q.marks, 0);
      const score = total
        ? (assessment.questions.reduce(
            (sum, q) => sum + ((latest.get(q.questionId) ?? 0) * q.marks) / 100,
            0,
          ) /
            total) *
          100
        : 0;
      const skills: Record<string, number[]> = {};
      for (const q of assessment.questions)
        for (const skill of JSON.parse(q.question.tags) as string[])
          (skills[skill] ??= []).push(latest.get(q.questionId) ?? 0);
      return {
        sessionId: s.id,
        name: s.candidateName,
        score: Math.round(score),
        date: s.startedAt.toISOString(),
        pendingReview: s.submissions.some(
          (sub) => sub.status === 'pending_review',
        ),
        skills: Object.fromEntries(
          Object.entries(skills).map(([k, v]) => [
            k,
            Math.round(v.reduce((a, b) => a + b, 0) / v.length),
          ]),
        ),
      };
    });
    const questions = assessment.questions.map((q) => {
      const scores = completed
        .map((s) =>
          s.submissions.find((sub) => sub.questionId === q.questionId),
        )
        .filter(Boolean);
      return {
        id: q.questionId,
        title: q.question.title,
        difficulty: q.question.difficulty,
        attempts: scores.length,
        average: scores.length
          ? Math.round(
              scores.reduce((sum, sub) => sum + sub!.score, 0) / scores.length,
            )
          : null,
        fullScore: scores.filter((sub) => sub!.score === 100).length,
      };
    });
    res.json({
      name: assessment.name,
      limited: assessment.sessions.length === 1000,
      started: assessment.sessions.length,
      completed: completed.length,
      pendingGrading: assessment.sessions.filter(
        (s) => s.gradingStatus === 'failed' || s.gradingStatus === 'grading',
      ).length,
      completionRate: assessment.sessions.length
        ? Math.round((completed.length / assessment.sessions.length) * 100)
        : 0,
      candidates,
      questions,
    });
  }),
);
router.get(
  '/assessments/:id/integrity',
  wrap(async (req, res) => {
    const id = idOf(req.params.id);
    const submissions = await prisma.submission.findMany({
      where: {
        assessmentId: id,
        code: { not: '' },
        question: { questionType: { in: ['coding', 'debugging', 'sql'] } },
      },
      include: { question: { include: { starterCodes: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const latest = new Map<string, (typeof submissions)[number]>();
    for (const s of submissions) {
      const key = `${s.sessionId ?? s.candidateName}:${s.questionId}`;
      if (!latest.has(key)) latest.set(key, s);
    }
    const rows = [...latest.values()];
    const prints = new Map(
      rows.map((s) => [
        s.id,
        fingerprints(
          s.code,
          s.question.starterCodes.find((sc) => sc.languageId === s.languageId)
            ?.code ?? '',
        ),
      ]),
    );
    const matches = [];
    for (let a = 0; a < rows.length; a++)
      for (let b = a + 1; b < rows.length; b++) {
        const left = rows[a],
          right = rows[b];
        if (
          left.candidateName === right.candidateName ||
          left.questionId !== right.questionId ||
          left.languageId !== right.languageId
        )
          continue;
        const score = similarity(prints.get(left.id)!, prints.get(right.id)!);
        if (score && score.percent >= 50) {
          const [first, second] = [left, right].sort((x, y) => x.id - y.id);
          matches.push({
            submissionId: first.id,
            comparedSubmissionId: second.id,
            leftName: first.candidateName,
            rightName: second.candidateName,
            question: first.question.title,
            ...score,
            leftCode: first.code,
            rightCode: second.code,
          });
        }
      }
    const sessions = await prisma.assessmentSession.findMany({
      where: { assessmentId: id },
      select: {
        id: true,
        candidateName: true,
        _count: { select: { tabSwitches: true, pasteEvents: true } },
      },
    });
    res.json({
      matches: matches.sort((a, b) => b.percent - a.percent).slice(0, 100),
      sessions,
      reviews: await prisma.integrityReview.findMany({
        where: { assessmentId: id },
      }),
      limited: submissions.length === 200,
      method:
        '7-token Jaccard similarity over the first 20000 characters, excluding starter code; short answers excluded. Similarity and browser events require human review and do not establish misconduct.',
    });
  }),
);
router.post(
  '/assessments/:id/integrity/review',
  wrap(async (req, res) => {
    const data = z
      .object({
        submissionId: z.number().int().positive(),
        comparedSubmissionId: z.number().int().positive(),
        decision: z.enum(['needs_review', 'cleared', 'escalated']),
        notes: z.string().trim().min(5).max(5000),
      })
      .parse(req.body);
    const assessmentId = idOf(req.params.id);
    if (data.submissionId >= data.comparedSubmissionId)
      throw new WorkflowError('Submission pair must be ordered');
    if (
      (await prisma.submission.count({
        where: {
          id: { in: [data.submissionId, data.comparedSubmissionId] },
          assessmentId,
        },
      })) !== 2
    )
      throw new WorkflowError(
        'Submission pair does not belong to this assessment',
      );
    const review = await prisma.integrityReview.upsert({
      where: {
        submissionId_comparedSubmissionId: {
          submissionId: data.submissionId,
          comparedSubmissionId: data.comparedSubmissionId,
        },
      },
      create: { ...data, assessmentId, reviewerId: req.user!.id },
      update: {
        decision: data.decision,
        notes: data.notes,
        reviewerId: req.user!.id,
      },
    });
    await audit(
      req.user!.id,
      'integrity.reviewed',
      'assessment',
      String(assessmentId),
      { decision: data.decision, reviewId: review.id },
    );
    res.json(review);
  }),
);
router.get(
  '/assessments/:id/reviews',
  wrap(async (req, res) => {
    res.json(
      await prisma.submission.findMany({
        where: {
          assessmentId: idOf(req.params.id),
          status: 'pending_review',
          session: { gradingStatus: 'completed' },
        },
        include: {
          question: {
            select: { title: true, questionType: true, settings: true },
          },
        },
        take: 100,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }),
);
router.post(
  '/submissions/:id/review',
  wrap(async (req, res) => {
    const data = z
      .object({
        score: z.number().min(0).max(100),
        evidence: z.string().trim().min(10).max(10000),
      })
      .parse(req.body);
    const sub = await prisma.submission.findUnique({
      where: { id: idOf(req.params.id) },
      include: { question: true, session: true },
    });
    if (sub?.session && sub.session.gradingStatus !== 'completed')
      throw new WorkflowError(
        'Wait for automatic grading to finish before reviewing',
        409,
      );
    if (!sub || !['written', 'project'].includes(sub.question.questionType))
      throw new WorkflowError('Manual-review submission not found', 404);
    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: sub.id },
        data: { score: data.score, status: 'graded' },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.user!.id,
          action: 'submission.reviewed',
          resource: 'submission',
          resourceId: String(sub.id),
          detail: { score: data.score, evidence: data.evidence },
        },
      });
    });
    res.json(
      await computeEvaluation(
        sub.assessmentId,
        sub.candidateName,
        sub.session?.candidateUserId ?? undefined,
      ),
    );
  }),
);
router.get(
  '/templates',
  wrap(async (_req, res) => {
    res.json([
      {
        key: 'frontend',
        name: 'Frontend engineer',
        minutes: 60,
        topics: ['React', 'JavaScript'],
        questionTypes: ['coding', 'debugging', 'mcq', 'written'],
        description:
          'React and JavaScript skills, debugging, and an explanation of implementation tradeoffs.',
      },
      {
        key: 'backend',
        name: 'Backend engineer',
        minutes: 75,
        topics: ['API', 'SQL'],
        questionTypes: ['coding', 'sql', 'written'],
        description:
          'API reasoning, database queries, and practical problem solving.',
      },
      {
        key: 'problem-solving',
        name: 'Problem solving',
        minutes: 60,
        topics: ['DSA'],
        questionTypes: ['coding', 'debugging'],
        description: 'Data structures, algorithms, complexity, and debugging.',
      },
    ]);
  }),
);
router.post(
  '/templates/draft',
  wrap(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(3).max(150),
        minutes: z.number().int().min(10).max(240),
        topics: z.array(z.string().min(1).max(50)).min(1).max(10),
        questionTypes: z
          .array(
            z.enum(['coding', 'debugging', 'mcq', 'sql', 'written', 'project']),
          )
          .min(1)
          .max(6),
        questionCount: z.number().int().min(1).max(30),
      })
      .parse(req.body);
    const available = await prisma.question.findMany({
      where: {
        questionType: { in: input.questionTypes },
        OR: input.topics.map((topic) => ({
          tags: { contains: topic, mode: 'insensitive' as const },
        })),
      },
      orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
      take: input.questionCount,
    });
    const draft = await prisma.assessment.create({
      data: {
        name: input.name,
        timeLimitMinutes: input.minutes,
        status: 'draft',
        questionTypes: JSON.stringify(input.questionTypes),
        topics: JSON.stringify(input.topics),
        questionCount: available.length || input.questionCount,
        instructions:
          'Read each question carefully. Explain your approach and test edge cases. Written and project answers are reviewed against the stated rubric.',
        questions: {
          create: available.map((q, i) => ({
            questionId: q.id,
            orderIndex: i,
            marks: 10,
          })),
        },
      },
    });
    await audit(
      req.user!.id,
      'assessment.created_from_template',
      'assessment',
      String(draft.id),
      { selectedQuestions: available.length },
    );
    res.status(201).json(draft);
  }),
);
router.get(
  '/assessments/:id/accommodations',
  wrap(async (req, res) => {
    res.json(
      await prisma.assessmentAccommodation.findMany({
        where: { assessmentId: idOf(req.params.id) },
      }),
    );
  }),
);
router.post(
  '/assessments/:id/accommodations',
  wrap(async (req, res) => {
    const input = z
      .object({
        candidateUserId: z.number().int().positive(),
        extraMinutes: z.number().int().min(0).max(240),
        reason: z.string().trim().min(5).max(1000),
      })
      .parse(req.body);
    const assessmentId = idOf(req.params.id);
    if (
      !(await prisma.user.findFirst({
        where: { id: input.candidateUserId, role: 'candidate' },
      }))
    )
      throw new WorkflowError('Candidate not found', 404);
    if (!(await prisma.assessment.findUnique({ where: { id: assessmentId } })))
      throw new WorkflowError('Assessment not found', 404);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.candidateUserId} FOR UPDATE`;
      if (
        await tx.assessmentSession.findFirst({
          where: {
            assessmentId,
            candidateUserId: input.candidateUserId,
            finishedAt: null,
          },
        })
      )
        throw new WorkflowError(
          'Set accommodations before the candidate starts an attempt',
          409,
        );
      return tx.assessmentAccommodation.upsert({
        where: {
          assessmentId_candidateUserId: {
            assessmentId,
            candidateUserId: input.candidateUserId,
          },
        },
        create: { ...input, assessmentId, authorId: req.user!.id },
        update: {
          extraMinutes: input.extraMinutes,
          reason: input.reason,
          authorId: req.user!.id,
        },
      });
    });
    await audit(
      req.user!.id,
      'accommodation.updated',
      'assessment',
      String(assessmentId),
      {
        candidateUserId: input.candidateUserId,
        extraMinutes: input.extraMinutes,
      },
    );
    res.json(result);
  }),
);
export default router;
