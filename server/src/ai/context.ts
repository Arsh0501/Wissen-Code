import prisma from '../prisma';
export async function interviewContext(id: number, authorId: number) {
  const interview = await prisma.interview.findFirst({
    where: { id, interviewerId: authorId },
    include: {
      questions: {
        include: { question: true },
        orderBy: { orderIndex: 'asc' },
      },
      submissions: { orderBy: { createdAt: 'desc' }, take: 50 },
      notes: { orderBy: { createdAt: 'asc' }, take: 100 },
      events: { orderBy: { createdAt: 'desc' }, take: 200 },
      plan: true,
    },
  });
  if (!interview)
    throw new Error('Interview not found or not owned by requester');
  const sources: Record<string, string> = {};
  sources['current:code'] = interview.currentCode;
  for (const q of interview.questions)
    sources[`question:${q.questionId}:answer`] = q.candidateAnswer;
  for (const s of interview.submissions) {
    sources[`submission:${s.id}:code`] = s.code;
    sources[`submission:${s.id}:execution`] = s.results;
  }
  for (const n of interview.notes) sources[`note:${n.id}`] = n.content;
  for (const e of interview.events) sources[`event:${e.id}`] = e.payload;
  return { interview, sources, judgeMode: process.env.JUDGE_MODE || 'live' };
}
