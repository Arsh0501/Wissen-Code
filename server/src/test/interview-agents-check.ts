import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../prisma';
import jobs from '../routes/ai-jobs';
import workflows from '../routes/interview-workflows';
import { closeQueue } from '../ai/queue';
import { interviewContext } from '../ai/context';

async function main() {
  const user = await prisma.user.create({ data: { name: 'Interview agents check', email: `agents-${randomUUID()}@test.invalid`, password: 'unused', role: 'interviewer' } });
  const interview = await prisma.interview.create({ data: { title: 'Python discussion', interviewerId: user.id, candidateName: 'Fixture', candidateEmail: 'fixture@test.invalid', roomToken: randomUUID(), status: 'in_progress', startedAt: new Date(), currentCode: 'n = int(input())\nprint(n)' } });
  const question = await prisma.question.create({ data: { title: 'Integer input', statement: 'Explain integer parsing and output in Python.', difficulty: 'easy' } });
  await prisma.interviewQuestion.create({ data: { interviewId: interview.id, questionId: question.id, orderIndex: 0, candidateAnswer: 'I use int(input()) to read an integer and print(n) to write it.' } });
  await prisma.interview.update({ where: { id: interview.id }, data: { currentQuestionId: question.id } });
  await prisma.interviewSubmission.create({ data: { interviewId: interview.id, questionId: question.id, submittedBy: 'candidate', languageId: 71, languageName: 'Python', code: 'n = int(input())\nprint(n)', results: '[{"input":"42","expectedOutput":"42","passed":true}]', score: 100 } });
  await prisma.interviewNote.create({ data: { interviewId: interview.id, authorId: user.id, content: 'Candidate explained integer input and output.', isPrivate: true } });
  await prisma.interviewEvent.create({ data: { interviewId: interview.id, eventType: 'ANSWER_UPDATED', actorRole: 'candidate', payload: JSON.stringify({ answer: 'I use int(input()) to read an integer.' }) } });
  await prisma.interview.update({ where: { id: interview.id }, data: { candidateResumeUrl: 'data:application/pdf;base64,' + 'A'.repeat(400000) } });
  await prisma.interviewEvent.createMany({ data: Array.from({ length: 200 }, () => ({ interviewId: interview.id, eventType: 'CODE_CHANGED', actorRole: 'candidate', payload: JSON.stringify({ code: 'print(42)\n'.repeat(500) }) })) });
  console.log('Bounded AI context characters:', JSON.stringify(await interviewContext(interview.id, user.id)).length);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: user.id, name: user.name, email: user.email, role: 'interviewer' }; next(); });
  app.use('/jobs', jobs);
  app.use('/workflows', workflows);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status || 500).json({ error: String(error.message).slice(0, 1200) }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const kind of ['interview-assistant', 'note-writer', 'evaluation']) {
      if (kind === 'evaluation') {
        await prisma.interview.update({ where: { id: interview.id }, data: { status: 'completed', endedAt: new Date() } });
        await prisma.interviewEvaluation.create({ data: { interviewId: interview.id, questionId: question.id, authorId: user.id, status: 'final', executionResults: {}, observations: [], skills: [{ skill: 'Python', rating: 4, rationale: 'Explained integer parsing and formatted output correctly.' }] } });
      }
      const response = await fetch(base + '/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, interviewId: interview.id, input: {} }), signal: AbortSignal.timeout(180000) });
      const result: any = await response.json();
      console.log(JSON.stringify({ kind, httpStatus: response.status, status: result.status, error: result.error, outputKeys: result.output ? Object.keys(result.output) : [], timelineCount: result.output?.timeline?.length }));
      if (!response.ok) process.exitCode = 1;
    }
    const response = await fetch(base + `/workflows/${interview.id}/ai-results`);
    const result: any = await response.json();
    console.log(JSON.stringify({ resultsStatus: response.status, configured: result.configured, followUps: result.results?.followUps?.length, notes: result.results?.notes?.length, timeline: result.results?.timeline?.length, skills: result.results?.evaluation?.skills?.length }));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.aIJob.deleteMany({ where: { authorId: user.id } });
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await closeQueue();
    await prisma.$disconnect();
  }
}
void main();
