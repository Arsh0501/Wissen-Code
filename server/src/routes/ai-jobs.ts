import { aiConfigured } from '../ai/config';
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { aiQueue } from '../ai/queue';
import { agentKinds } from '../ai/agents';
import { uiResults } from '../ai/results';
import {
  generationSchema,
  questionContentSchema,
  planInputSchema,
} from '../services/workflow-schemas';
const router = Router();
router.use(adminOnly);
const wrap = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);
router.post(
  '/',
  wrap(async (req: any, res: any) => {
    if (!aiConfigured() || !process.env.REDIS_URL)
      return res
        .status(503)
        .json({ error: 'An AI provider and Redis must be configured to run AI jobs' });
    const body = z
      .object({
        kind: z.enum(agentKinds),
        interviewId: z.number().int().positive().optional(),
        input: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(req.body);
    if (
      body.kind.startsWith('question-') &&
      (req.user.accessRole ?? req.user.role) !== 'admin'
    )
      return res
        .status(403)
        .json({
          error:
            'Question generation and validation require administrator access',
        });
    if (body.kind === 'question-generation') generationSchema.parse(body.input);
    if (body.kind === 'question-validation')
      questionContentSchema.parse(body.input.question);
    if (body.kind === 'interview-planner') planInputSchema.parse(body.input);
    if (!body.kind.startsWith('question-') && !body.interviewId)
      return res.status(400).json({ error: 'Interview ID required' });
    if (
      body.interviewId &&
      !(await prisma.interview.findFirst({
        where: { id: body.interviewId, interviewerId: req.user.id },
      }))
    )
      return res.status(404).json({ error: 'Interview not found' });
    const job = await prisma.aIJob.create({
      data: {
        authorId: req.user.id,
        kind: body.kind,
        interviewId: body.interviewId,
        input: body.input as any,
      },
    });
    try {
      await aiQueue().add(body.kind, { id: job.id }, { jobId: job.id });
    } catch (error) {
      await prisma.aIJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'Queue unavailable. Retry when Redis is available.',
        },
      });
      throw error;
    }
    res.status(202).json(job);
  }),
);
router.get(
  '/',
  wrap(async (req: any, res: any) =>
    res.json(
      await prisma.aIJob.findMany({
        where: { authorId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ),
  ),
);
router.get(
  '/:id',
  wrap(async (req: any, res: any) => {
    const job = await prisma.aIJob.findFirst({
      where: { id: req.params.id, authorId: req.user.id },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({
      ...job,
      aiResults: job.output ? uiResults(job.id, job.kind, job.output) : null,
    });
  }),
);
router.post(
  '/:id/retry',
  wrap(async (req: any, res: any) => {
    const job = await prisma.aIJob.findFirst({
      where: { id: req.params.id, authorId: req.user.id, status: 'failed' },
    });
    if (!job)
      return res.status(409).json({ error: 'Only failed jobs can be retried' });
    const queued = await aiQueue().getJob(job.id);
    if (queued && (await queued.getState()) !== 'failed')
      return res
        .status(409)
        .json({ error: 'Automatic retries are still pending' });
    if (queued) await queued.retry();
    else await aiQueue().add(job.kind, { id: job.id }, { jobId: job.id });
    await prisma.aIJob.update({
      where: { id: job.id },
      data: { status: 'queued', error: null },
    });
    res.status(202).json({ id: job.id });
  }),
);
router.post(
  '/:id/review',
  wrap(async (req: any, res: any) => {
    const input = z
      .object({
        itemId: z.string().max(200),
        decision: z.enum(['ask', 'dismiss', 'accept', 'reject']),
        content: z.string().max(20000).optional(),
      })
      .parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AIJob" WHERE id = ${req.params.id} FOR UPDATE`;
      const job = await tx.aIJob.findFirst({
        where: {
          id: req.params.id,
          authorId: req.user.id,
          status: 'completed',
        },
      });
      if (!job || !job.interviewId || !job.output)
        throw new Error('Completed interview job required');
      const output = job.output as any;
      if (output._reviews?.[input.itemId]) return output._reviews[input.itemId];
      const feed = uiResults(job.id, job.kind, output) as any;
      const item = [...(feed.followUps ?? []), ...(feed.notes ?? [])].find(
        (i) => i.id === input.itemId,
      );
      if (!item) throw new Error('AI item not found');
      const isNote = !!feed.notes;
      if (
        isNote
          ? !['accept', 'reject'].includes(input.decision)
          : !['ask', 'dismiss'].includes(input.decision)
      )
        throw new Error('Invalid decision for this item');
      const reviews = output._reviews ?? {};
      if (reviews[input.itemId]) return reviews[input.itemId];
      const review = {
        ...input,
        reviewedBy: req.user.id,
        reviewedAt: new Date().toISOString(),
      };
      if (input.decision === 'accept')
        await tx.interviewNote.create({
          data: {
            interviewId: job.interviewId,
            authorId: req.user.id,
            content: input.content ?? item.content,
            isPrivate: true,
          },
        });
      await tx.interviewEvent.create({
        data: {
          interviewId: job.interviewId,
          eventType: 'AI_REVIEWED',
          actorRole: 'interviewer',
          payload: JSON.stringify({
            ...review,
            question: item.question ?? null,
            context: item.context ?? null,
          }),
        },
      });
      await tx.aIJob.update({
        where: { id: job.id },
        data: {
          output: {
            ...output,
            _reviews: { ...reviews, [input.itemId]: review },
          },
        },
      });
      return review;
    });
    res.json(result);
  }),
);
export default router;
