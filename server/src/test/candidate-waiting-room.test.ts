import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { io as connect, Socket } from 'socket.io-client';
import prisma from '../prisma';
import { initSocketServer } from '../socket';
import interviews, { handleJoinRoom } from '../routes/interviews';

function nextEvent(socket: Socket, name: string) {
  return new Promise<any>((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Timeout: ${name}`)), 4000); socket.once(name, (data) => { clearTimeout(timer); resolve(data); }); });
}

test('candidate HTTP and socket state hide prepared content until start, including preparation broadcasts', async () => {
  const run = randomUUID();
  const redis = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  const user = await prisma.user.create({ data: { name: 'Waiting room fixture', email: `waiting-${run}@test.invalid`, password: 'unused', role: 'interviewer' } });
  const question = await prisma.question.create({ data: { title: 'SECRET_QUESTION', statement: 'Return the input integer unchanged.', difficulty: 'easy' } });
  const interview = await prisma.interview.create({ data: { title: 'Scheduled interview', interviewerId: user.id, candidateName: 'Fixture', candidateEmail: 'fixture@test.invalid', roomToken: run, status: 'scheduled', currentQuestionId: question.id, currentCode: 'SECRET_STARTER', questions: { create: { questionId: question.id, candidateAnswer: 'SECRET_ANSWER' } } } });
  await prisma.question.update({ where: { id: question.id }, data: { ownerInterviewId: interview.id } });
  const app = express();
  app.use(express.json());
  app.get('/room/:roomToken', handleJoinRoom);
  app.use((req, _res, next) => { req.user = { id: user.id, name: user.name, email: user.email, role: 'interviewer' }; next(); });
  app.use('/interviews', interviews);
  const server = http.createServer(app);
  const io = initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const candidate = connect(base, { auth: { roomToken: run }, autoConnect: false });
  try {
    const before: any = await (await fetch(base + `/room/${run}`)).json();
    assert.equal(before.currentQuestion, null);
    assert.equal(before.currentCode, '');
    assert.deepEqual(before.questions, []);
    assert.equal(JSON.stringify(before).includes('SECRET_'), false);
    const connected = nextEvent(candidate, 'connect'); candidate.connect(); await connected;
    const waiting = nextEvent(candidate, 'SYNC_STATE'); candidate.emit('JOIN_INTERVIEW', { roomToken: run });
    const initial = await waiting;
    assert.equal(initial.status, 'scheduled');
    assert.equal(initial.currentQuestion, null);
    assert.equal(initial.currentQuestionId, null);
    assert.equal(JSON.stringify(initial).includes('SECRET_'), false);
    const broadcasts: unknown[] = [];
    candidate.on('QUESTIONS_UPDATED', (data) => broadcasts.push(data));
    candidate.on('QUESTION_CHANGED', (data) => broadcasts.push(data));
    const edit = await fetch(base + `/interviews/${interview.id}/questions/${question.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'SECRET_UPDATED_QUESTION', statement: 'Return the input integer unchanged with careful parsing.', difficulty: 'easy', tags: [] }) });
    assert.equal(edit.status, 200);
    const edited: any = await edit.json();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(broadcasts.length, 0);
    const started = nextEvent(candidate, 'INTERVIEW_STARTED');
    assert.equal((await fetch(base + `/interviews/${interview.id}/start`, { method: 'POST' })).status, 200);
    await started;
    const active: any = await (await fetch(base + `/room/${run}`)).json();
    assert.equal(active.currentQuestion.title, 'SECRET_UPDATED_QUESTION');
    const sync = nextEvent(candidate, 'SYNC_STATE'); candidate.emit('JOIN_INTERVIEW', { roomToken: run });
    assert.equal((await sync).currentQuestion.id, edited.question.id);
  } finally {
    candidate.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.deleteMany({ where: { ownerInterviewId: interview.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    if (redis === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = redis;
  }
});
