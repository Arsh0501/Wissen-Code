import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../database/prisma';
import { adminOrInterviewer } from '../middleware/adminOnly';
import { WorkflowError } from '../services/ai/structured-ai';
import { recordInterviewEvent } from '../socket/interview-handler';
import {
  currentSubquestion,
  setCurrentSubquestion,
} from '../services/interviews/current-subquestion';

const createSchema = z.object({
  requestId: z.uuid(),
  question: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((value) => !value.includes('\u0000')),
  askNow: z.boolean().default(false),
});

async function activeQuestion(
  tx: Prisma.TransactionClient,
  interviewId: number,
  questionId: number,
  userId: number,
  role: string,
) {
  await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${interviewId} FOR UPDATE`;
  const interview = await tx.interview.findUniqueOrThrow({ where: { id: interviewId } });
  if (role !== 'interviewer' || interview.interviewerId !== userId) {
    throw new WorkflowError('Only the assigned interviewer can manage follow-ups.', 403);
  }
  if (interview.status !== 'in_progress')
    throw new WorkflowError(
      'Follow-ups can only be added or asked during an ongoing interview.',
      409,
    );
  if (interview.currentQuestionId !== questionId)
    throw new WorkflowError(
      'Select this question as the current question before asking a follow-up.',
      409,
    );
  const link = await tx.interviewQuestion.findUnique({
    where: { interviewId_questionId: { interviewId, questionId } },
  });
  if (!link) throw new WorkflowError('Question is not assigned to this interview.', 404);
}

const router = Router({ mergeParams: true });
type QuestionParams = { id: string; questionId: string };
router.use(adminOrInterviewer);
router.use((req, _res, next) => {
  try {
    z.coerce.number().int().positive().parse(req.params.questionId);
    next();
  } catch (error) {
    next(error);
  }
});

router.get<QuestionParams>('/', async (req, res, next) => {
  try {
    res.json(
      await prisma.interviewFollowUp.findMany({
        where: { interviewId: Number(req.params.id), questionId: Number(req.params.questionId) },
        orderBy: { createdAt: 'asc' },
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.get<QuestionParams>('/current', async (req, res, next) => {
  try {
    const interviewId = Number(req.params.id),
      questionId = Number(req.params.questionId);
    const interview = await prisma.interview.findFirst({
      where: { id: interviewId, interviewerId: req.user!.id },
    });
    if (!interview) throw new WorkflowError('Assigned interview not found.', 404);
    const link = await prisma.interviewQuestion.findUnique({
      where: { interviewId_questionId: { interviewId, questionId } },
    });
    if (!link) throw new WorkflowError('Question not assigned to this interview.', 404);
    res.json(currentSubquestion(link.notes));
  } catch (error) {
    next(error);
  }
});

router.post<QuestionParams>('/', async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const interviewId = Number(req.params.id),
      questionId = Number(req.params.questionId);
    const result = await prisma.$transaction(async (tx) => {
      await activeQuestion(
        tx,
        interviewId,
        questionId,
        req.user!.id,
        req.user!.accessRole ?? req.user!.role,
      );
      const existing = await tx.interviewFollowUp.findUnique({ where: { id: input.requestId } });
      if (existing) {
        if (
          existing.interviewId !== interviewId ||
          existing.questionId !== questionId ||
          existing.question !== input.question
        ) {
          throw new WorkflowError('This request ID was already used for another follow-up.', 409);
        }
        return { followUp: existing, created: false };
      }
      const followUp = await tx.interviewFollowUp.create({
        data: {
          id: input.requestId,
          interviewId,
          questionId,
          question: input.question,
          createdById: req.user!.id,
          status: input.askNow ? 'asked' : 'pending',
          askedAt: input.askNow ? new Date() : null,
        },
      });
      if (input.askNow) await setCurrentSubquestion(tx, interviewId, questionId, followUp);
      return { followUp, created: true };
    });
    if (result.created)
      await recordInterviewEvent(
        interviewId,
        input.askNow ? 'FOLLOW_UP_ASKED' : 'FOLLOW_UP_ADDED',
        'interviewer',
        { questionId, followUpId: result.followUp.id, question: result.followUp.question },
      );
    res.status(result.created ? 201 : 200).json(result.followUp);
  } catch (error) {
    next(error);
  }
});

router.delete<QuestionParams>('/current', async (req, res, next) => {
  try {
    const interviewId = Number(req.params.id),
      questionId = Number(req.params.questionId);
    await prisma.$transaction(async (tx) => {
      await activeQuestion(
        tx,
        interviewId,
        questionId,
        req.user!.id,
        req.user!.accessRole ?? req.user!.role,
      );
      await setCurrentSubquestion(tx, interviewId, questionId, null);
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.put<QuestionParams & { followUpId: string }>('/:followUpId', async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['asked', 'dismissed']) }).parse(req.body);
    const interviewId = Number(req.params.id),
      questionId = Number(req.params.questionId);
    const result = await prisma.$transaction(async (tx) => {
      await activeQuestion(
        tx,
        interviewId,
        questionId,
        req.user!.id,
        req.user!.accessRole ?? req.user!.role,
      );
      const followUp = await tx.interviewFollowUp.findFirst({
        where: { id: req.params.followUpId, interviewId, questionId },
      });
      if (!followUp) throw new WorkflowError('Follow-up not found for this question.', 404);
      if (followUp.status === status) return { followUp, changed: false };
      if (followUp.status !== 'pending')
        throw new WorkflowError('This follow-up has already been asked or dismissed.', 409);
      const updated = await tx.interviewFollowUp.update({
        where: { id: followUp.id },
        data: { status, askedAt: status === 'asked' ? new Date() : null },
      });
      if (status === 'asked') await setCurrentSubquestion(tx, interviewId, questionId, updated);
      return { followUp: updated, changed: true };
    });
    if (result.changed)
      await recordInterviewEvent(
        interviewId,
        status === 'asked' ? 'FOLLOW_UP_ASKED' : 'FOLLOW_UP_DISMISSED',
        'interviewer',
        { questionId, followUpId: result.followUp.id, question: result.followUp.question },
      );
    res.json(result.followUp);
  } catch (error) {
    next(error);
  }
});

export default router;
