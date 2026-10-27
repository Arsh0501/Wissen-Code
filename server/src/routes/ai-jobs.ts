import { randomUUID } from 'node:crypto';
import { generationTopics } from '../services/questions/studio-generation';
import { aiConfigured } from '../ai/config';
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../database/prisma';
import { adminOrInterviewer } from '../middleware/adminOnly';
import { aiQueue } from '../ai/queue';
import { agentKinds } from '../ai/agents';
import { uiResults } from '../ai/results';
import { runInlineJob } from '../ai/inline';
import { interviewContext } from '../ai/context';
import { finalEvaluationContext } from '../ai/final-evaluation-context';
import { WorkflowError } from '../services/ai/structured-ai';
import { setCurrentSubquestion } from '../services/interviews/current-subquestion';
import { generationSchema, draftContentSchema } from '../services/questions/workflow-schemas';
const router = Router();
router.use(adminOrInterviewer);
const wrap = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);
router.post(
  '/',
  wrap(async (req: any, res: any) => {
    if (!aiConfigured())
      return res.status(503).json({ error: 'An AI provider must be configured to run AI jobs' });
    const body = z
      .object({
        kind: z.enum(agentKinds),
        interviewId: z.number().int().positive().optional(),
        input: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(req.body);
    if (body.kind.startsWith('question-') && (req.user.accessRole ?? req.user.role) !== 'admin')
      return res.status(403).json({
        error: 'Question generation and validation require administrator access',
      });
    if (body.kind === 'question-generation') {
      generationTopics(generationSchema.parse(body.input));
      body.input.requestId = randomUUID();
    }
    if (body.kind === 'question-validation') draftContentSchema.parse(body.input.question);
    if (!body.kind.startsWith('question-') && !body.interviewId)
      return res.status(400).json({ error: 'Interview ID required' });
    if (body.interviewId) {
      const interview = await prisma.interview.findFirst({
        where: { id: body.interviewId, interviewerId: req.user.id },
      });
      if (!interview) return res.status(404).json({ error: 'Interview not found' });
      if (body.kind === 'evaluation' && interview.status !== 'completed')
        return res
          .status(409)
          .json({ error: 'End the interview before generating the final evaluation' });
      if (body.kind === 'evaluation') await finalEvaluationContext(interview.id, req.user.id);
      if (body.kind === 'interview-assistant' && interview.status !== 'in_progress')
        return res
          .status(409)
          .json({ error: 'Follow-up suggestions are available during a live interview' });
      if (body.kind === 'interview-assistant') {
        body.input.questionId = z
          .number()
          .int()
          .positive()
          .parse(body.input.questionId ?? interview.currentQuestionId);
        await interviewContext(interview.id, req.user.id, 12000, body.input.questionId as number);
      }
      if (body.kind === 'note-writer' && !['in_progress', 'completed'].includes(interview.status))
        return res.status(409).json({ error: 'Start the interview before generating notes' });
    }
    const recentEvents = body.interviewId
      ? await prisma.interviewEvent.findMany({
          where: {
            interviewId: body.interviewId,
            eventType: { notIn: ['CODE_CHANGED', 'CURSOR_CHANGED', 'AI_REVIEWED'] },
          },
          orderBy: { id: 'desc' },
          take: 20,
          select: { id: true, eventType: true, createdAt: true, payload: true },
        })
      : [];
    const latestEvent =
      body.kind === 'interview-assistant'
        ? recentEvents.find((event) => {
            try {
              const payload = JSON.parse(event.payload);
              return (payload.questionId ?? payload.activeQuestionId) === body.input.questionId;
            } catch {
              return false;
            }
          })
        : recentEvents[0];
    const job = await prisma.aIJob.create({
      data: {
        authorId: req.user.id,
        kind: body.kind,
        interviewId: body.interviewId,
        input: {
          ...body.input,
          _trigger: {
            mode: 'manual',
            ...(latestEvent
              ? {
                  eventId: latestEvent.id,
                  eventType: latestEvent.eventType,
                  createdAt: latestEvent.createdAt.toISOString(),
                }
              : {}),
          },
        } as any,
      },
    });
    if (!process.env.REDIS_URL) return res.json(await runInlineJob(job.id));
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
      aiResults: job.output
        ? uiResults(job.id, job.kind, job.output, {
            createdAt: job.createdAt.toISOString(),
            trigger: (job.input as any)?._trigger,
          })
        : null,
    });
  }),
);
router.post(
  '/:id/retry',
  wrap(async (req: any, res: any) => {
    const job = await prisma.aIJob.findFirst({
      where: { id: req.params.id, authorId: req.user.id, status: 'failed' },
    });
    if (!job) return res.status(409).json({ error: 'Only failed jobs can be retried' });
    if (!process.env.REDIS_URL) return res.json(await runInlineJob(job.id));
    const queued = await aiQueue().getJob(job.id);
    if (queued && (await queued.getState()) !== 'failed')
      return res.status(409).json({ error: 'Automatic retries are still pending' });
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
      if (job.kind === 'interview-assistant' && input.decision === 'ask') {
        await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${job.interviewId} FOR UPDATE`;
        const interview = await tx.interview.findFirst({
          where: { id: job.interviewId, interviewerId: req.user.id },
        });
        if (!interview || (req.user.accessRole ?? req.user.role) !== 'interviewer')
          throw new WorkflowError('Only the assigned interviewer can ask follow-ups.', 403);
        if (
          interview.status !== 'in_progress' ||
          !item.questionId ||
          interview.currentQuestionId !== item.questionId
        ) {
          throw new WorkflowError(
            'Ask this follow-up while its question is current in an ongoing interview.',
            409,
          );
        }
        await setCurrentSubquestion(tx, job.interviewId, item.questionId, {
          id: item.id,
          question: item.question,
        });
      }
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
            questionId: item.questionId ?? null,
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
