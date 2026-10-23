import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { io as client, Socket } from 'socket.io-client';
import prisma from '../prisma';
import { initSocketServer } from '../socket';
import { createSessionForUser } from '../routes/auth';
import { authenticate } from '../middleware/auth';
import interviewRoutes from '../routes/interviews';
import platformRoutes from '../platform/routes';
import { enforceInterviewDeadlines } from '../services/interview-expiry';
function event(socket: Socket, name: string) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${name}`)), 3000);
    socket.once(name, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
test('interview rooms enforce assignment, isolate private notes, and revoke active socket access', async (t) => {
  const liveQuestionIds: number[] = [];
  // This test exercises the authoritative database/socket checks; Redis transport is covered separately.
  const redisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  const previousJudgeMode = process.env.JUDGE_MODE;
  process.env.JUDGE_MODE = 'mock';
  const admin = await prisma.user.create({
    data: {
      name: 'Realtime owner',
      email: `owner-${Date.now()}@test.invalid`,
      password: 'unused',
      role: 'interviewer',
    },
  });
  const other = await prisma.user.create({
    data: {
      name: 'Other interviewer',
      email: `other-${Date.now()}@test.invalid`,
      password: 'unused',
      role: 'interviewer',
    },
  });
  const question = await prisma.question.create({ data: {
    title: 'Live grading test', statement: 'Return the input integer unchanged.', difficulty: 'easy',
    testCases: { create: [
      { input: '1', expectedOutput: '1', isSample: true },
      { input: '2', expectedOutput: '2', isSample: true },
      { input: 'PRIVATE_INPUT', expectedOutput: 'PRIVATE_EXPECTED', isSample: false },
    ] },
  } });
  const room = await prisma.interview.create({
    data: {
      title: 'Security test',
      interviewerId: admin.id,
      candidateName: 'Guest candidate',
      candidateEmail: 'guest@test.invalid',
      roomToken: `test-room-${Date.now()}`,
      status: 'in_progress',
      startedAt: new Date(),
      currentQuestionId: question.id,
      questions: { create: [{ questionId: question.id, status: 'active' }] },
    },
  });
  const ownerAuth = await createSessionForUser(
    admin.id,
    admin.email,
    admin.name,
    admin.role,
  );
  const otherAuth = await createSessionForUser(
    other.id,
    other.email,
    other.name,
    other.role,
  );
  if (!ownerAuth.token || !otherAuth.token) throw new Error('Missing session');
  const app = express();
  app.use(express.json());
  app.use('/interviews', authenticate, interviewRoutes);
  app.use('/platform', authenticate, platformRoutes);
  const server = http.createServer(app);
  const io = initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const owner = client(url, {
    auth: { token: ownerAuth.token },
    autoConnect: false,
  });
  const candidate = client(url, {
    auth: { roomToken: room.roomToken },
    autoConnect: false,
  });
  const stranger = client(url, {
    auth: { token: otherAuth.token, interviewId: room.id },
    autoConnect: false,
  });
  try {
    const connections = [
      event(owner, 'connect'),
      event(candidate, 'connect'),
      event(stranger, 'connect'),
    ];
    owner.connect();
    candidate.connect();
    stranger.connect();
    await Promise.all(connections);
    const ownerSync = event(owner, 'SYNC_STATE');
    owner.emit('JOIN_INTERVIEW', { interviewId: room.id });
    await ownerSync;
    assert.ok(await prisma.interviewSession.findFirst({ where: { interviewId: room.id, participantRole: 'interviewer' } }));
    const rejoin = await new Promise<any>((resolve, reject) => owner.timeout(3000).emit('JOIN_INTERVIEW', {}, (error: Error | null, result: any) => error ? reject(error) : resolve(result)));
    assert.equal(rejoin.success, true);
    const guestSync = event(candidate, 'SYNC_STATE');
    candidate.emit('JOIN_INTERVIEW', { roomToken: room.roomToken });
    await guestSync;
    const denied = event(stranger, 'ERROR');
    stranger.emit('JOIN_INTERVIEW', { interviewId: room.id });
    assert.match((await denied).message, /assigned/);
    const updateCode = (payload: unknown) =>
      new Promise<any>((resolve) =>
        owner.emit('UPDATE_CODE', payload, resolve),
      );
    const current = await prisma.interview.findUniqueOrThrow({
      where: { id: room.id },
    });
    const candidateUpdate = event(candidate, 'CODE_CHANGED');
    const edit = await updateCode({
      code: 'print("shared editor")',
      languageId: 71,
      baseRevision: current.codeRevision,
    });
    assert.equal(edit.success, true);
    assert.equal((await candidateUpdate).code, 'print("shared editor")');
    const conflict = await updateCode({
      code: 'stale draft must not replace code',
      languageId: 71,
      baseRevision: current.codeRevision,
    });
    assert.equal(conflict.success, false);
    assert.equal(conflict.state.currentCode, 'print("shared editor")');
    let candidateSawStaffEvent = false;
    candidate.on('INTERVIEW_EVENT', () => { candidateSawStaffEvent = true; });
    const liveEvent = event(owner, 'INTERVIEW_EVENT');
    const ownerUpdate = event(owner, 'CODE_CHANGED');
    const candidateEdit = await new Promise<any>((resolve, reject) => candidate.timeout(3000).emit('UPDATE_CODE', {
      code: 'print("candidate edit")', languageId: 71, baseRevision: conflict.state.codeRevision,
    }, (error: Error | null, result: any) => error ? reject(error) : resolve(result)));
    assert.equal(candidateEdit.success, true);
    assert.equal((await ownerUpdate).code, 'print("candidate edit")');
    const staffEvent = await liveEvent;
    assert.equal(staffEvent.eventType, 'CODE_CHANGED');
    assert.equal(staffEvent.actorRole, 'candidate');
    assert.equal(staffEvent.payload, undefined);
    assert.equal(candidateSawStaffEvent, false);
    const staffHeaders = { Authorization: `Bearer ${ownerAuth.token}` };
    const eventsResponse = await fetch(`${url}/interviews/${room.id}/events`, { headers: staffHeaders });
    assert.equal(eventsResponse.status, 200);
    assert.ok((await eventsResponse.json() as any[]).some((item) => item.id === staffEvent.id));
    const deniedEvents = await fetch(`${url}/interviews/${room.id}/events`, { headers: { Authorization: `Bearer ${otherAuth.token}` } });
    assert.equal(deniedEvents.status, 403);
    const replay = await fetch(`${url}/platform/interviews/${room.id}/replay`, { headers: staffHeaders });
    assert.equal(replay.status, 404);
    const codeEvent = await prisma.interviewEvent.findFirst({
        where: { interviewId: room.id, eventType: 'CODE_CHANGED' },
      });
    assert.ok(codeEvent);
    assert.equal(JSON.parse(codeEvent.payload).code, undefined);
    let candidateSawNote = false;
    candidate.on('NOTE_ADDED', () => (candidateSawNote = true));
    const note = event(owner, 'NOTE_ADDED');
    const response = await fetch(`${url}/interviews/${room.id}/notes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerAuth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Private interviewer evidence',
        isPrivate: true,
      }),
    });
    assert.equal(response.status, 201);
    assert.equal((await note).content, 'Private interviewer evidence');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(candidateSawNote, false);
    await t.test('interviewer and candidate can exchange video offers and answers in their room', async () => {
      const offer = event(candidate, 'RTC_SIGNAL');
      owner.emit('RTC_SIGNAL', { type: 'offer', data: { type: 'offer', sdp: 'interviewer-offer' } });
      const received = await offer;
      assert.equal(received.role, 'interviewer');
      assert.equal(received.data.sdp, 'interviewer-offer');
      const answer = event(owner, 'RTC_SIGNAL');
      candidate.emit('RTC_SIGNAL', { type: 'answer', data: { type: 'answer', sdp: 'candidate-answer' } });
      assert.equal((await answer).data.sdp, 'candidate-answer');
    });
    await t.test('Run returns sample counts; Submit returns all counts without hidden inputs', async () => {
      const emit = (name: string) => new Promise<any>((resolve, reject) => candidate.timeout(10000).emit(name, {
        code: 'print(1)', languageId: 71, questionId: question.id,
      }, (error: Error | null, result: any) => error ? reject(error) : resolve(result)));
      const runBroadcast = event(owner, 'CODE_EXECUTED');
      const run = await emit('EXECUTE_CODE');
      assert.equal(run.success, true);
      assert.equal(run.totalCount, 2);
      assert.equal(run.passedCount, 2);
      assert.equal((await runBroadcast).totalCount, 2);
      assert.equal(JSON.stringify(run).includes('PRIVATE_INPUT'), false);
      const submitted = await emit('SUBMIT_CODE');
      assert.equal(submitted.success, true);
      assert.equal(submitted.totalCount, 3);
      assert.equal(submitted.passedCount, 3);
      const hidden = submitted.results.find((item: any) => !item.isSample);
      assert.equal(hidden.input, undefined);
      assert.equal(hidden.expectedOutput, undefined);
      assert.equal(hidden.actualOutput, undefined);
    });
    await t.test('live question changes synchronize candidate state and preserve saved work on edit', async () => {
      const request = async (path: string, method: string, body?: unknown) => fetch(`${url}/interviews/${room.id}/questions${path}`, { method, headers: { Authorization: `Bearer ${ownerAuth.token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const before = await prisma.interview.findUniqueOrThrow({ where: { id: room.id } });
      const changed = event(candidate, 'QUESTION_CHANGED');
      const edited = await request(`/${question.id}`, 'PUT', { title: 'Updated live prompt', statement: 'Explain the updated problem during this live interview.', difficulty: 'easy', tags: [] });
      assert.equal(edited.status, 200);
      const edit: any = await edited.json();
      liveQuestionIds.push(edit.question.id);
      const payload = await changed;
      assert.equal(payload.question.title, 'Updated live prompt');
      assert.equal(payload.code, before.currentCode);
      assert.equal(JSON.stringify(payload).includes('PRIVATE_INPUT'), false);
      const listed = event(candidate, 'QUESTIONS_UPDATED');
      const added = await request('', 'POST', { title: 'New live question', statement: 'Describe the next task.', difficulty: 'easy', tags: [] });
      assert.equal(added.status, 201);
      const add: any = await added.json();
      liveQuestionIds.push(add.question.questionId);
      await listed;
      const next = event(candidate, 'QUESTION_CHANGED');
      assert.equal((await request(`/${edit.question.id}`, 'DELETE')).status, 200);
      assert.equal((await next).questionId, add.question.questionId);
      const cleared = event(candidate, 'QUESTION_CHANGED');
      assert.equal((await request(`/${add.question.questionId}`, 'DELETE')).status, 200);
      assert.equal((await cleared).questionId, null);
      assert.equal((await prisma.interview.findUniqueOrThrow({ where: { id: room.id } })).currentCode, '');
    });
    await prisma.userSession.deleteMany({ where: { userId: admin.id } });
    const automaticEnd = event(candidate, 'INTERVIEW_ENDED');
    await prisma.interview.update({ where: { id: room.id }, data: { startedAt: new Date(Date.now() - 61 * 60000) } });
    await enforceInterviewDeadlines({ id: room.id });
    assert.equal((await automaticEnd).reason, 'duration_elapsed');
    assert.equal((await prisma.interview.findUniqueOrThrow({ where: { id: room.id } })).status, 'completed');
    const disconnected = event(owner, 'disconnect');
    owner.emit('UPDATE_CODE', { code: 'print(1)', languageId: 71 });
    await disconnected;
  } finally {
    owner.disconnect();
    candidate.disconnect();
    stranger.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await prisma.interview.delete({ where: { id: room.id } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.question.deleteMany({ where: { id: { in: liveQuestionIds } } });
    await prisma.user.deleteMany({
      where: { id: { in: [admin.id, other.id] } },
    });
    if (redisUrl) process.env.REDIS_URL = redisUrl;
    if (previousJudgeMode === undefined) delete process.env.JUDGE_MODE;
    else process.env.JUDGE_MODE = previousJudgeMode;
  }
});

test('candidate can list assigned interviews via /api/interviews/my-interviews and join directly', async () => {
  const candidateEmail = `candidate-${Date.now()}@test.invalid`;
  const interviewer = await prisma.user.create({
    data: {
      name: 'Hiring Lead',
      email: `lead-${Date.now()}@test.invalid`,
      password: 'unused',
      role: 'admin',
    },
  });
  const candidate = await prisma.user.create({
    data: {
      name: 'Test Candidate',
      email: candidateEmail,
      password: 'unused',
      role: 'candidate',
    },
  });

  // Create an interview with matching candidateEmail before candidateId is assigned
  const interview = await prisma.interview.create({
    data: {
      title: 'Senior Frontend Round',
      description: 'React, State Management & System Architecture',
      interviewerId: interviewer.id,
      candidateName: 'Test Candidate',
      candidateEmail,
      roomToken: `room-candidate-test-${Date.now()}`,
      status: 'in_progress',
      timeLimitMinutes: 60,
    },
  });

  const candidateAuth = await createSessionForUser(
    candidate.id,
    candidate.email,
    candidate.name,
    candidate.role,
  );

  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/interviews', interviewRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${url}/interviews/my-interviews`, {
      headers: {
        Authorization: `Bearer ${candidateAuth.token}`,
      },
    });
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.ok(Array.isArray(data));
    assert.equal(data.length, 1);
    assert.equal(data[0].id, interview.id);
    assert.equal(data[0].title, 'Senior Frontend Round');
    assert.equal(data[0].status, 'in_progress');
    assert.equal(data[0].roomToken, interview.roomToken);
    assert.equal(data[0].candidateJoinUrl, `/interview/${interview.roomToken}`);
    assert.equal(data[0].interviewer.name, 'Hiring Lead');

    // Verify passive association linked candidateId
    const updated = await prisma.interview.findUnique({ where: { id: interview.id } });
    assert.equal(updated?.candidateId, candidate.id);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [interviewer.id, candidate.id] } },
    });
  }
});

