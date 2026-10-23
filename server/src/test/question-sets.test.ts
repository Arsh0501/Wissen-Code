import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import prisma from '../prisma';
import { createQuestionSetRouter } from '../routes/interview-question-sets';
import interviewRoutes, { handleJoinRoom } from '../routes/interviews';
import { staffPermissions } from '../platform/permissions';
import { ZodError } from 'zod';

test('question set CRUD, AI review, multi-set live imports, permissions and private snapshots', async () => {
  const marker = `sets-${Date.now()}`;
  const admin = await prisma.user.create({ data: { name: marker, email: `${marker}-admin@test.invalid`, password: 'unused', role: 'admin' } });
  const interviewer = await prisma.user.create({ data: { name: marker, email: `${marker}-interviewer@test.invalid`, password: 'unused', role: 'interviewer' } });
  const interview = await prisma.interview.create({ data: { title: marker, interviewerId: interviewer.id, candidateName: 'Test', candidateEmail: 'test@test.invalid', roomToken: marker, timeLimitMinutes: 60, status: 'in_progress', startedAt: new Date() } });
  const app = express(); app.use(express.json());
  app.get('/room/:roomToken', handleJoinRoom);
  app.use((req, _res, next) => { const role = req.header('test-role') || 'admin'; req.user = { id: role === 'interviewer' ? interviewer.id : admin.id, role, email: 'test@test.invalid' } as any; next(); });
  app.use(staffPermissions);
  app.use('/interview-question-sets', createQuestionSetRouter(async input => ({ questions: [{ title: input.topics, statement: 'Explain transaction isolation.', answer: input.includeAnswers ? 'Private reference answer' : null, source: 'ai' as const }] })));
  app.use('/interviews', interviewRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error instanceof ZodError ? 400 : error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  async function request(path: string, method = 'GET', body?: unknown, role = 'admin') {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { 'Content-Type': 'application/json', 'test-role': role }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() as any };
  }
  try {
    const before = await prisma.interviewQuestionSet.count();
    const preview = await request('/interview-question-sets/generate-preview', 'POST', { topics: 'Transactions', count: 1, includeAnswers: true, answerDetail: 'detailed' });
    assert.equal(preview.status, 200); assert.equal(await prisma.interviewQuestionSet.count(), before);
    const create = await request('/interview-question-sets', 'POST', { title: marker, questions: preview.data.questions });
    const second = await request('/interview-question-sets', 'POST', { title: `${marker}-2`, questions: [{ title: 'Second question', statement: 'Explain caching.' }] });
    assert.equal(create.status, 201); assert.equal(second.status, 201);
    assert.equal((await request('/interview-question-sets', 'POST', { title: 'Forbidden', questions: [] }, 'interviewer')).status, 403);
    assert.equal((await request('/interview-question-sets', 'GET', undefined, 'candidate')).status, 403);
    assert.equal((await request(`/interview-question-sets/${create.data.id}`, 'GET', undefined, 'interviewer')).data.questions[0].answer, 'Private reference answer');
    const ids = [create.data.questions[0].id, second.data.questions[0].id];
    assert.equal((await request(`/interviews/${interview.id}/import-set-questions`, 'POST', { itemIds: ids })).status, 403);
    const imported = await request(`/interviews/${interview.id}/import-set-questions`, 'POST', { itemIds: ids }, 'interviewer');
    assert.equal(imported.status, 200); assert.equal(imported.data.count, 2);
    assert.equal((await request(`/interviews/${interview.id}/import-set-questions`, 'POST', { itemIds: ids }, 'interviewer')).data.count, 0);
    const links = await prisma.interviewQuestion.findMany({ where: { interviewId: interview.id }, orderBy: { orderIndex: 'asc' }, include: { question: true } });
    assert.equal(links[0].referenceAnswer, 'Private reference answer');
    assert.ok(links.every(q => q.question.ownerInterviewId === interview.id));
    const candidate = await request(`/room/${marker}`);
    assert.equal(candidate.status, 200); assert.ok(!JSON.stringify(candidate.data).includes('Private reference answer')); assert.ok(!('referenceAnswer' in candidate.data.questions[0]));
    const updated = await request(`/interview-question-sets/${create.data.id}`, 'PUT', { ...create.data, title: 'Updated title', questions: [{ ...create.data.questions[0], statement: 'Changed library question' }] });
    assert.equal(updated.status, 200);
    assert.equal((await request(`/interview-question-sets/${create.data.id}`, 'PUT', create.data)).status, 409);
    assert.equal((await prisma.question.findUniqueOrThrow({ where: { id: links[0].questionId } })).statement, 'Explain transaction isolation.');
    assert.equal((await request(`/interview-question-sets/${create.data.id}`, 'DELETE')).status, 200);
    assert.equal(await prisma.interviewQuestion.count({ where: { interviewId: interview.id } }), 2);
    const reversed = links.map(q => q.questionId).reverse();
    assert.equal((await request(`/interviews/${interview.id}/question-order`, 'PUT', { questionIds: reversed }, 'interviewer')).status, 200);
    assert.deepEqual((await prisma.interviewQuestion.findMany({ where: { interviewId: interview.id }, orderBy: { orderIndex: 'asc' } })).map(q => q.questionId), reversed);
    await prisma.interview.update({ where: { id: interview.id }, data: { status: 'completed', endedAt: new Date() } });
    assert.equal((await request(`/interviews/${interview.id}/import-set-questions`, 'POST', { itemIds: [ids[1]] }, 'interviewer')).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.deleteMany({ where: { ownerInterviewId: interview.id } });
    await prisma.interviewQuestionSet.deleteMany({ where: { createdById: admin.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, interviewer.id] } } });
  }
});

