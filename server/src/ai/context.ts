import prisma from '../prisma';
import { compactInterviewContext, scopeFollowUpContext } from './context-budget';
export async function interviewContext(id: number, authorId: number, maxChars = 12000, questionId?: number | null) {
  const interview = await prisma.interview.findFirst({
    where: { id, interviewerId: authorId },
    select: {
      id: true, title: true, status: true, currentQuestionId: true, currentCode: true,
      questions: {
        select: { questionId: true, candidateAnswer: true, notes: true, question: { select: { title: true, statement: true, questionType: true } } },
        orderBy: { orderIndex: 'asc' },
      },
      submissions: { where: questionId === undefined ? {} : { questionId: questionId ?? undefined, submittedBy: 'candidate' }, select: { id: true, questionId: true, code: true, results: true, score: true, submittedBy: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      notes: { select: { id: true, content: true }, orderBy: { createdAt: 'desc' }, take: 8 },
      events: { select: { id: true, eventType: true, actorRole: true, payload: true }, where: { eventType: { notIn: ['CODE_CHANGED', 'CURSOR_CHANGED'] } }, orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!interview)
    throw new Error('Interview not found or not owned by requester');
  if (questionId !== undefined) interview.submissions = await prisma.interviewSubmission.findMany({
    where: { interviewId: id, questionId: questionId ?? interview.currentQuestionId ?? -1, submittedBy: 'candidate' },
    select: { id: true, questionId: true, code: true, results: true, score: true, submittedBy: true }, orderBy: { createdAt: 'desc' }, take: 3,
  });
  return compactInterviewContext(questionId === undefined ? interview : scopeFollowUpContext(interview, questionId ?? interview.currentQuestionId), maxChars);
}
