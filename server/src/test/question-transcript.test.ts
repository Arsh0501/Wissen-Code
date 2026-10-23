import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import prisma from '../prisma';
import { authenticate } from '../middleware/auth';
import { createSessionForUser } from '../routes/auth';
import transcriptRoutes from '../routes/interview-transcript';
import { interviewContext } from '../ai/context';

test('reviewed transcript API enforces assignment, question ownership and active state', async () => {
  const users: number[] = [], interviews: number[] = [], questions: number[] = [];
  const app = express(); app.use(express.json());
  app.use('/interviews/:id/questions/:questionId/transcript', authenticate, transcriptRoutes);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const owner = await prisma.user.create({ data: { name: 'Transcript owner', email: `owner-${randomUUID()}@test.invalid`, password: 'unused', role: 'interviewer' } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { name: 'Other interviewer', email: `other-${randomUUID()}@test.invalid`, password: 'unused', role: 'interviewer' } }); users.push(other.id);
    const ownerAuth = await createSessionForUser(owner.id, owner.email, owner.name, owner.role);
    const otherAuth = await createSessionForUser(other.id, other.email, other.name, other.role);
    const question = await prisma.question.create({ data: { title: 'Cache design', statement: 'Explain caching.', difficulty: 'easy', questionType: 'written' } }); questions.push(question.id);
    const second = await prisma.question.create({ data: { title: 'Second question', statement: 'Explain indexing.', difficulty: 'easy', questionType: 'written' } }); questions.push(second.id);
    const interview = await prisma.interview.create({ data: { title: 'Transcript API test', interviewerId: owner.id, candidateName: 'Candidate', candidateEmail: 'test@test.invalid', roomToken: randomUUID(), status: 'in_progress', startedAt: new Date(), currentQuestionId: question.id,
      questions: { create: [{ questionId: question.id, notes: JSON.stringify({ interviewerFeedback: 'Keep interviewer notes separate.' }) }, { questionId: second.id }] } } }); interviews.push(interview.id);
    const segment = await prisma.interviewTranscriptSegment.create({ data: { id: randomUUID(), interviewId: interview.id, questionId: question.id, sessionId: randomUUID(), sequence: 0, text: 'We used readings.', startedAt: new Date(), endedAt: new Date() } });
    const foreign = await prisma.interviewTranscriptSegment.create({ data: { id: randomUUID(), interviewId: interview.id, questionId: second.id, sessionId: randomUUID(), sequence: 0, text: 'Other answer', startedAt: new Date(), endedAt: new Date() } });
    const path = `/interviews/${interview.id}/questions/${question.id}/transcript`;
    const request = (method: string, token: string, body?: unknown, target = path) => fetch(base + target, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await request('GET', otherAuth.token!)).status, 404);
    const list = await (await request('GET', ownerAuth.token!)).json() as any;
    assert.deepEqual(list.segments.map((s: any) => s.id), [segment.id]);
    assert.equal((await request('PUT', otherAuth.token!, { segmentIds: [segment.id], text: 'Answer' })).status, 404);
    assert.equal((await request('PUT', ownerAuth.token!, { segmentIds: [foreign.id], text: 'Wrong question' })).status, 400);
    assert.equal((await request('PUT', ownerAuth.token!, { segmentIds: [segment.id, segment.id], text: 'Duplicate' })).status, 400);
    assert.equal((await request('PUT', ownerAuth.token!, { segmentIds: [segment.id], text: 'We used Redis.' })).status, 200);
    const evidence = (await (await request('GET', ownerAuth.token!)).json() as any).evidence;
    assert.equal(evidence.text, 'We used Redis.');
    assert.equal((await prisma.interviewTranscriptSegment.findUniqueOrThrow({ where: { id: segment.id } })).text, 'We used readings.');
    const link = await prisma.interviewQuestion.findUniqueOrThrow({ where: { interviewId_questionId: { interviewId: interview.id, questionId: question.id } } });
    assert.equal(JSON.parse(link.notes).interviewerFeedback, 'Keep interviewer notes separate.');
    const context = await interviewContext(interview.id, owner.id, 12000, question.id);
    assert.equal(context.sources[`question:${question.id}:reviewed-transcript`], 'We used Redis.');
    assert.equal(JSON.stringify(context).includes('Other answer'), false);
    await prisma.interview.update({ where: { id: interview.id }, data: { currentQuestionId: second.id } });
    assert.equal((await request('PUT', ownerAuth.token!, { segmentIds: [segment.id], text: 'Old question' })).status, 409);
    await prisma.interview.update({ where: { id: interview.id }, data: { status: 'completed' } });
    assert.equal((await request('PUT', ownerAuth.token!, { segmentIds: [foreign.id], text: 'Ended' }, `/interviews/${interview.id}/questions/${second.id}/transcript`)).status, 409);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.interview.deleteMany({ where: { id: { in: interviews } } });
    await prisma.question.deleteMany({ where: { id: { in: questions } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
});
