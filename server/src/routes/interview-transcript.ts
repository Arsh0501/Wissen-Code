import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOrInterviewer } from '../middleware/adminOnly';
import { enforceInterviewDeadlines } from '../services/interview-expiry';
import { questionNoteData, reviewedTranscript } from '../services/question-feedback';

const router = Router({ mergeParams: true });
router.use(adminOrInterviewer);
router.get<{ id: string; questionId: string }>('/', async (req, res, next) => {
  try {
    const id = Number(req.params.id), questionId = Number(req.params.questionId);
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(questionId)) return res.status(400).json({ error: 'Invalid interview or question' });
    const interview = await prisma.interview.findFirst({ where: { id, interviewerId: req.user!.id } });
    if (!interview) return res.status(404).json({ error: 'Assigned interview not found' });
    const link = await prisma.interviewQuestion.findUnique({ where: { interviewId_questionId: { interviewId: id, questionId } } });
    if (!link) return res.status(404).json({ error: 'Question not assigned to this interview' });
    const segments = await prisma.interviewTranscriptSegment.findMany({ where: { interviewId: id, questionId }, orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], take: 1000 });
    return res.json({ segments, evidence: reviewedTranscript(link.notes) });
  } catch (error) { next(error); }
});
router.put<{ id: string; questionId: string }>('/', async (req, res, next) => {
  try {
    const input = z.object({ segmentIds: z.array(z.string().uuid()).min(1).max(100), text: z.string().trim().min(1).max(10000).refine(v => !v.includes('\u0000')) }).strict().parse(req.body);
    if (new Set(input.segmentIds).size !== input.segmentIds.length) return res.status(400).json({ error: 'Select each segment only once' });
    const id = Number(req.params.id), questionId = Number(req.params.questionId);
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(questionId)) return res.status(400).json({ error: 'Invalid interview or question' });
    await enforceInterviewDeadlines({ id });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Interview" WHERE id = ${id} FOR UPDATE`;
      const interview = await tx.interview.findFirst({ where: { id, interviewerId: req.user!.id } });
      if (!interview) return { status: 404, error: 'Assigned interview not found' };
      if (interview.status !== 'in_progress' || interview.currentQuestionId !== questionId) return { status: 409, error: 'Select this question as the current question in an ongoing interview' };
      const link = await tx.interviewQuestion.findUnique({ where: { interviewId_questionId: { interviewId: id, questionId } } });
      if (!link) return { status: 404, error: 'Question not assigned to this interview' };
      const count = await tx.interviewTranscriptSegment.count({ where: { interviewId: id, questionId, id: { in: input.segmentIds } } });
      if (count !== input.segmentIds.length) return { status: 400, error: 'Select transcript segments belonging to this interview question' };
      const evidence = { ...input, reviewedAt: new Date().toISOString() };
      await tx.interviewQuestion.update({ where: { id: link.id }, data: { notes: JSON.stringify({ ...questionNoteData(link.notes), transcriptEvidence: evidence }) } });
      return { status: 200, evidence };
    });
    return res.status(result.status).json(result);
  } catch (error) { next(error); }
});
export default router;
