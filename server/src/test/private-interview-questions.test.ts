import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../prisma';
import interviews from '../routes/interviews';
import questions from '../routes/questions';
import assessments from '../routes/assessments';
import { questionTools } from '../ai/question-tools';

test('resume and edited interview questions stay private and cannot be reused in another interview or assessment', async () => {
  const user = await prisma.user.create({ data: { name: 'Privacy fixture', email: `privacy-${randomUUID()}@test.invalid`, password: 'unused', role: 'interviewer' } });
  const privateIds: number[] = [];
  const owned: number[] = [];
  const bank = await prisma.question.create({ data: { title: 'Reusable DSA fixture', statement: 'Print one integer unchanged.', difficulty: 'easy' } });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: user.id, name: user.name, email: user.email, role: req.headers['x-admin'] ? 'admin' : 'interviewer' }; next(); });
  app.use('/interviews', interviews);
  app.use('/questions', questions);
  app.use('/assessments', assessments);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function call(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'x-admin': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as any };
  }
  try {
    for (let n = 0; n < 2; n++) owned.push((await prisma.interview.create({ data: { title: 'Private question fixture', interviewerId: user.id, candidateName: `Candidate ${n}`, candidateEmail: `candidate-${n}@test.invalid`, roomToken: randomUUID() } })).id);
    const draft = { title: `Resume-specific ${randomUUID()}`, statement: 'Explain the candidate project described in their resume.', difficulty: 'easy', tags: ['resume'], keyDiscussionPoints: ['Architecture'], expectedSolution: 'Discuss the project.' };
    const added = await call(`/interviews/${owned[0]}/questions`, 'POST', draft);
    assert.equal(added.status, 201);
    const id = added.data.question.questionId;
    privateIds.push(id);
    assert.equal(added.data.question.question.ownerInterviewId, owned[0]);
    const listed = await call('/questions');
    assert.ok(listed.data.some((q: any) => q.id === bank.id));
    assert.ok(!listed.data.some((q: any) => q.id === id));
    assert.equal((await call(`/questions/${id}`)).status, 404);
    assert.equal((await call(`/interviews/${owned[1]}/questions`, 'POST', { questionId: id })).status, 404);
    assert.equal((await call('/assessments', 'POST', { name: 'Should be rejected', status: 'draft', questions: [{ questionId: id, marks: 10 }] })).status, 400);
    assert.equal((await call('/interviews', 'POST', { title: 'Should be rejected', candidateName: 'Other', candidateEmail: 'other@test.invalid', interviewerId: user.id, questionIds: [id] })).status, 400);
    const search = questionTools(user.id).find((tool) => tool.name === 'searchQuestionBank')!;
    assert.deepEqual(await search.execute({ query: draft.title }), []);
    assert.equal((await call(`/interviews/${owned[1]}/questions`, 'POST', { questionId: bank.id })).status, 201);
    const edited = await call(`/interviews/${owned[0]}/questions/${id}`, 'PUT', { ...draft, title: draft.title + ' edited' });
    assert.equal(edited.status, 200);
    const current = await prisma.interviewQuestion.findFirstOrThrow({ where: { interviewId: owned[0] } });
    privateIds.push(current.questionId);
    assert.equal((await prisma.question.findUniqueOrThrow({ where: { id: current.questionId } })).ownerInterviewId, owned[0]);
    const detail = await call(`/interviews/${owned[0]}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.questions[0].question.title, draft.title + ' edited');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.interview.deleteMany({ where: { id: { in: owned } } });
    await prisma.question.deleteMany({ where: { id: { in: [bank.id, ...privateIds] } } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
