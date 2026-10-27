import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma';
import interviews, { handleJoinRoom } from '../routes/interviews';
import { interviewContext } from '../ai/context';

test('question feedback persists privately, preserves question metadata and enforces ownership and phase', async () => {
  const oldRedis = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  const run = randomUUID();
  const user = await prisma.user.create({
    data: {
      name: 'Feedback fixture',
      email: `feedback-${run}@test.invalid`,
      password: 'unused',
      role: 'interviewer',
    },
  });
  const question = await prisma.question.create({
    data: {
      title: 'Booking design',
      statement: 'Explain booking concurrency',
      difficulty: 'medium',
      questionType: 'written',
    },
  });
  const interview = await prisma.interview.create({
    data: {
      title: 'Feedback fixture',
      interviewerId: user.id,
      candidateName: 'Fixture',
      candidateEmail: 'fixture@test.invalid',
      roomToken: run,
      status: 'in_progress',
      startedAt: new Date(),
      currentQuestionId: question.id,
    },
  });
  await prisma.interviewQuestion.create({
    data: {
      interviewId: interview.id,
      questionId: question.id,
      notes: '{"keyDiscussionPoints":["locking"]}',
      candidateAnswer: 'PRIVATE_CANDIDATE_ANSWER',
    },
  });
  const app = express();
  app.use(express.json());
  app.get('/room/:roomToken', handleJoinRoom);
  app.use((req, _res, next) => {
    req.user = {
      id: req.headers['x-other'] ? user.id + 1000000 : user.id,
      email: user.email,
      name: user.name,
      role: 'interviewer',
    };
    next();
  });
  app.use('/interviews', interviews);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const path = `/interviews/${interview.id}/questions/${question.id}/feedback`;
  const put = (feedback: string, other = false) =>
    fetch(base + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(other ? { 'x-other': 'yes' } : {}) },
      body: JSON.stringify({ feedback }),
    });
  try {
    assert.equal((await put('Observed row locking.', true)).status, 403);
    assert.equal((await put('')).status, 400);
    assert.equal((await put('Observed row locking.')).status, 200);
    assert.equal((await put('Observed row locking; missed deadlocks.')).status, 200);
    const link = await prisma.interviewQuestion.findUniqueOrThrow({
      where: { interviewId_questionId: { interviewId: interview.id, questionId: question.id } },
    });
    assert.deepEqual(JSON.parse(link.notes).keyDiscussionPoints, ['locking']);
    assert.equal(link.candidateAnswer, 'PRIVATE_CANDIDATE_ANSWER');
    const scoped = await interviewContext(interview.id, user.id, 12000, question.id);
    assert.equal(
      scoped.sources[`question:${question.id}:feedback`],
      'Observed row locking; missed deadlocks.',
    );
    assert.equal(JSON.stringify(scoped).includes('PRIVATE_CANDIDATE_ANSWER'), false);
    const candidate = await fetch(base + `/room/${run}`);
    // Candidate room data strips private per-question discussion notes.
    assert.equal(candidate.status, 200);
    assert.equal(JSON.stringify(await candidate.json()).includes('missed deadlocks'), false);
    await prisma.interview.update({
      where: { id: interview.id },
      data: { status: 'completed', endedAt: new Date() },
    });
    assert.equal((await put('Too late')).status, 409);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    if (oldRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = oldRedis;
  }
});
