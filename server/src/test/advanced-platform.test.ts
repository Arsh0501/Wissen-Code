import { summarizeCandidates, aggregate } from '../services/assessments/stats';
import { buildReportData } from '../routes/admin-reports';
import { ExecutionLimiter } from '../platform/jobs/execution-limit';
import { verifyAccessToken } from '../middleware/auth';
import axios from 'axios';
import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import prisma from '../database/prisma';
import {
  candidatePayload,
  scoreChoices,
  validateQuestionSettings,
} from '../services/questions/candidate-payload';
import { deliverOutbox, tokenHash, calendarEvent } from '../platform/mail/communication';
import { webhookSignature } from '../platform/mail/webhooks';
import platformRoutes from '../routes/system';
import accountRoutes from '../routes/auth/account';
import questionRoutes from '../routes/questions';
import userRoutes from '../routes/users';
import assessmentRoutes from '../routes/assessments';
import attemptRoutes from '../routes/attempts';
import { createSessionForUser } from '../routes/auth';
import { authenticate } from '../middleware/auth';
import { staffPermissions } from '../platform/auth/permissions';
import { gradeAnswer, computeEvaluation } from '../services/assessments/grading';

test('multiple choice grading requires exact unique choices and never exposes answer keys in nested payloads', () => {
  const settings = {
    options: [
      { id: 'a', text: 'First' },
      { id: 'b', text: 'Second' },
      { id: 'c', text: 'Third' },
    ],
    correctOptionIds: ['a', 'c'],
    multiple: true,
    explanation: 'Private key rationale',
  };
  assert.equal(scoreChoices('["c","a"]', settings), 100);
  for (const answer of ['["a"]', '["a","b","c"]', '["a","a","c"]', 'oops', '{}'])
    assert.equal(scoreChoices(answer, settings), 0);
  assert.throws(() => validateQuestionSettings('mcq', { ...settings, multiple: false }));
  assert.throws(() =>
    validateQuestionSettings('mcq', {
      ...settings,
      correctOptionIds: ['missing'],
    }),
  );
  const result = candidatePayload({ questions: [{ question: { settings } }] });
  assert.equal(result.questions[0].question.settings.correctOptionIds, undefined);
  assert.equal(result.questions[0].question.settings.explanation, undefined);
  assert.equal(result.questions[0].question.settings.options.length, 3);
  assert.throws(() =>
    validateQuestionSettings('project', {
      rubric: 'Review',
      files: [{ path: '../escape', content: '' }],
    }),
  );
});

test('calendar fields escape newlines and webhook signatures bind ID, timestamp, and payload', () => {
  const calendar = calendarEvent({
    id: 5,
    title: 'Interview\nATTENDEE:malicious',
    candidateEmail: 'candidate@test.invalid',
    scheduledAt: new Date('2026-11-01T10:00:00Z'),
    timeLimitMinutes: 45,
    roomToken: 'test-token',
  });
  assert.ok(calendar.includes('DTEND:20261101T104500Z'));
  assert.ok(calendar.includes('SUMMARY:Interview\\nATTENDEE:malicious'));
  assert.equal(calendar.split('\r\n').filter((line) => line.startsWith('ATTENDEE:')).length, 1);
  assert.notEqual(
    webhookSignature('a', '1', '{}', 'secret'),
    webhookSignature('b', '1', '{}', 'secret'),
  );
});

test('durable email outbox claims concurrent delivery once and records provider failures for retry', async () => {
  const previous = {
    key: process.env.SMTP_PASS,
    host: process.env.SMTP_HOST,
    smtpUser: process.env.SMTP_USER,
    from: process.env.MAIL_FROM,
  };
  process.env.SMTP_PASS = 'test-only-not-a-real-key';
  process.env.SMTP_HOST = 'smtp.test.invalid';
  process.env.SMTP_USER = 'sender@test.invalid';
  process.env.MAIL_FROM = 'Wissen <sender@test.invalid>';
  const first = await prisma.outboundMessage.create({
    data: {
      recipient: 'recipient@test.invalid',
      subject: 'Fixture',
      body: 'Fixture email',
    },
  });
  const second = await prisma.outboundMessage.create({
    data: {
      recipient: 'failed@test.invalid',
      subject: 'Fixture',
      body: 'Failure fixture',
    },
  });
  try {
    let calls = 0;
    const transport = async (message: {
      id: string;
      to: string;
      subject: string;
      body: string;
    }) => {
      calls++;
      assert.equal(message.id, first.id);
      assert.equal(message.to, 'recipient@test.invalid');
      return 'provider-test';
    };
    await Promise.all([deliverOutbox(transport, [first.id]), deliverOutbox(transport, [first.id])]);
    assert.equal(calls, 1);
    assert.equal(
      (
        await prisma.outboundMessage.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).status,
      'sent',
    );
    await deliverOutbox(async () => {
      throw new Error('SMTP unavailable');
    }, [second.id]);
    const failed = await prisma.outboundMessage.findUniqueOrThrow({
      where: { id: second.id },
    });
    assert.equal(failed.status, 'pending');
    assert.equal(failed.attempts, 1);
    assert.ok(failed.scheduledAt > new Date());
  } finally {
    await prisma.outboundMessage.deleteMany({
      where: { id: { in: [first.id, second.id] } },
    });
    if (previous.host === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = previous.host;
    if (previous.smtpUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = previous.smtpUser;
    if (previous.key === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = previous.key;
    if (previous.from === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = previous.from;
  }
});

test('assessment API supports MCQ, provisional written answers, key redaction, and staff permissions end to end', async () => {
  const suffix = crypto.randomUUID();
  const users = await Promise.all(
    ['admin', 'candidate', 'interviewer'].map((role) =>
      prisma.user.create({
        data: {
          name: `${role}-${suffix}`,
          email: `${role}-${suffix}@test.invalid`,
          role,
          password: 'test-unused',
        },
      }),
    ),
  );
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use(staffPermissions);
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    if (req.user!.role === 'candidate')
      res.json = ((body: any) => json(candidatePayload(body))) as typeof res.json;
    next();
  });
  app.use('/questions', questionRoutes);
  app.use('/users', userRoutes);
  app.use('/assessments', assessmentRoutes);
  app.use('/attempts', attemptRoutes);
  app.use('/platform', platformRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res
      .status(error instanceof z.ZodError ? 400 : (error.status ?? 500))
      .json({ error: error.message }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const tokens: string[] = [];
  for (const user of users) {
    const auth = await createSessionForUser(user.id, user.email, user.name, user.role);
    if (!('token' in auth)) throw new Error('Session fixture failed');
    tokens.push(auth.token!);
    const claims = await verifyAccessToken(auth.token!);
    assert.equal(claims.role, user.role);
    assert.equal(claims.accessRole, user.role);
  }
  const call = (index: number, path: string, method = 'GET', body?: unknown) =>
    fetch(url + path, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[index]}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const questionIds: number[] = [];
  let assessmentId: number | undefined;
  try {
    assert.equal(
      (await call(0, `/users/${users[2].id}/role`, 'PUT', { role: 'recruiter' })).status,
      400,
    );
    assert.equal(
      (
        await call(0, '/users/invite', 'POST', {
          name: 'Removed role',
          email: `removed-${suffix}@test.invalid`,
          role: 'recruiter',
        })
      ).status,
      400,
    );
    const unsupported = await createSessionForUser(
      users[2].id,
      users[2].email,
      users[2].name,
      'recruiter',
    );
    assert.ok('error' in unsupported);
    const choices = await call(0, '/questions', 'POST', {
      title: 'MCQ fixture',
      statement: 'Choose first',
      difficulty: 'easy',
      questionType: 'mcq',
      settings: {
        options: [
          { id: 'a', text: 'First' },
          { id: 'b', text: 'Second' },
        ],
        correctOptionIds: ['a'],
      },
    });
    assert.equal((await call(1, '/questions')).status, 403);
    assert.equal(choices.status, 201);
    const mcq = (await choices.json()) as any;
    questionIds.push(mcq.id);
    const response = await call(0, '/questions', 'POST', {
      title: 'Written fixture',
      statement: 'Explain tradeoffs',
      difficulty: 'medium',
      questionType: 'written',
      settings: {
        rubric: 'Correct explanation and concrete tradeoffs earn full marks.',
      },
    });
    assert.equal(response.status, 201);
    const written = (await response.json()) as any;
    questionIds.push(written.id);
    const create = await call(0, '/assessments', 'POST', {
      name: 'Advanced fixture',
      status: 'published',
      timeLimitMinutes: 30,
      questionTypes: ['mcq', 'written'],
      questions: questionIds.map((questionId) => ({ questionId, marks: 10 })),
    });
    assert.equal(create.status, 201);
    const assessment = (await create.json()) as any;
    assessmentId = assessment.id;
    const candidateView = (await (await call(1, `/assessments/${assessmentId}`)).json()) as any;
    assert.equal(
      candidateView.questions.find((q: any) => q.questionId === mcq.id).question.settings
        .correctOptionIds,
      undefined,
    );
    assert.equal(candidateView.questionsLocked, true);
    assert.equal(candidateView.questions[0].question.statement, '');
    const start = await call(1, `/assessments/${assessmentId}/start`, 'POST', {});
    assert.equal(start.status, 200);
    const session = (await start.json()) as any;
    assert.equal(session.timeLimitMinutes, 30);
    assert.ok(session.remainingSeconds > 1700);
    const unlocked = (await (await call(1, `/assessments/${assessmentId}`)).json()) as any;
    assert.equal(unlocked.questionsLocked, false);
    assert.equal(
      unlocked.questions.find((q: any) => q.questionId === mcq.id).question.settings.options.length,
      2,
    );
    for (const [questionId, code] of [
      [mcq.id, '["a"]'],
      [written.id, 'I would compare time, memory, and maintainability.'],
    ] as const)
      assert.equal(
        (
          await call(1, `/attempts/${session.sessionId}/answer`, 'PUT', {
            questionId,
            code,
            languageId: 71,
            languageName: 'Answer',
            isAnswered: true,
          })
        ).status,
        200,
      );
    const submit = await call(1, `/attempts/${session.sessionId}/submit`, 'POST', {});
    assert.equal(submit.status, 200);
    const subs = await prisma.submission.findMany({
      where: { sessionId: session.sessionId },
    });
    assert.equal(subs.find((s) => s.questionId === mcq.id)?.score, 100);
    const manual = subs.find((s) => s.questionId === written.id)!;
    assert.equal(manual.status, 'pending_review');
    assert.equal((await call(0, '/platform/audit')).status, 404);
    assert.equal((await call(0, `/platform/assessments/${assessmentId}/analytics`)).status, 404);
    assert.equal((await call(2, '/questions', 'POST', {})).status, 403);
    const twin = await prisma.user.create({
      data: {
        name: users[1].name,
        email: `same-name-${suffix}@test.invalid`,
        role: 'candidate',
        password: 'unused',
      },
    });
    users.push(twin);
    const twinAuth = await createSessionForUser(twin.id, twin.email, twin.name, twin.role);
    tokens.push(twinAuth.token!);
    assert.equal(
      await computeEvaluation(assessmentId!, twin.name, twin.id),
      null,
      'Identical display names must not expose another candidate result',
    );
    const legacy = await prisma.assessmentSession.create({
      data: { assessmentId: assessmentId!, candidateName: twin.name },
    });
    const twinStart = await call(3, `/assessments/${assessmentId}/start`, 'POST', {});
    assert.equal(twinStart.status, 200);
    const ownSession = (await twinStart.json()) as any;
    assert.notEqual(ownSession.sessionId, legacy.id);
    assert.notEqual(ownSession.sessionId, session.sessionId);
    assert.equal((await buildReportData(String(users[1].id), assessmentId!))?.marks.percentage, 50);
    assert.equal(await buildReportData(String(twin.id), assessmentId!), null);
    // No compiler is invoked for manual answers; MCQ grading also works independently.
    const direct = await gradeAnswer(
      assessmentId!,
      users[1].name,
      {
        questionId: mcq.id,
        languageId: 71,
        languageName: 'Answer',
        code: '["b"]',
      },
      session.sessionId,
    );
    assert.equal(direct.score, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (assessmentId) {
      await prisma.assessment.delete({ where: { id: assessmentId } });
    }
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
  }
});

test('password reset tokens are single use and revoke every existing login session', async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Recovery fixture',
      email: `reset-${crypto.randomUUID()}@test.invalid`,
      password: 'old-hash',
    },
  });
  const raw = crypto.randomBytes(32).toString('hex');
  await prisma.accountToken.create({
    data: {
      userId: user.id,
      purpose: 'reset',
      tokenHash: tokenHash(raw),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await createSessionForUser(user.id, user.email, user.name, user.role);
  const app = express();
  app.use(express.json());
  app.use(accountRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(400).json({ error: error.message }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}/reset-password`;
    const reset = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: raw,
          password: 'new-secure-password-123!',
        }),
      });
    const responses = await Promise.all([reset(), reset()]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
    assert.equal(await prisma.userSession.count({ where: { userId: user.id } }), 0);
    assert.equal(
      await bcrypt.compare(
        'new-secure-password-123!',
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password,
      ),
      true,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.accountToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test('SQL is executed inside the judge with fixture setup and provider outages remain retryable', async () => {
  const oldMode = process.env.JUDGE_MODE;
  const post = axios.post;
  process.env.JUDGE_MODE = 'live';
  const question = await prisma.question.create({
    data: {
      title: 'SQL isolation fixture',
      statement: 'Query fixtures',
      difficulty: 'easy',
      questionType: 'sql',
      testCases: {
        create: {
          input: 'CREATE TABLE items (id INTEGER); INSERT INTO items VALUES (7);',
          expectedOutput: '7',
          isSample: false,
        },
      },
    },
  });
  const assessment = await prisma.assessment.create({
    data: {
      name: 'SQL fixture',
      status: 'draft',
      questions: { create: { questionId: question.id } },
    },
  });
  const session = await prisma.assessmentSession.create({
    data: { assessmentId: assessment.id, candidateName: 'SQL test fixture' },
  });
  try {
    let calls = 0;
    axios.post = (async (_url: string, body: any) => {
      calls++;
      assert.equal(body.language_id, 82);
      const source = Buffer.from(body.source_code, 'base64').toString();
      assert.match(source, /CREATE TABLE items/);
      assert.match(source, /SELECT id FROM items/);
      return {
        data: {
          stdout: Buffer.from('7\n').toString('base64'),
          status: { id: 3, description: 'Accepted' },
          time: '0.01',
          memory: 1000,
        },
      };
    }) as typeof axios.post;
    const answer = {
      questionId: question.id,
      languageId: 82,
      languageName: 'SQL',
      code: 'SELECT id FROM items;',
    };
    assert.equal(
      (await gradeAnswer(assessment.id, session.candidateName, answer, session.id)).score,
      100,
    );
    assert.equal(calls, 1);
    axios.post = (async () => {
      throw new Error('Temporary provider outage');
    }) as typeof axios.post;
    await assert.rejects(
      gradeAnswer(assessment.id, session.candidateName, answer, session.id),
      /provider unavailable/,
    );
    const failed = await prisma.submission.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    assert.equal(failed.status, 'execution_failed');
    assert.equal(failed.code, answer.code);
  } finally {
    axios.post = post;
    if (oldMode === undefined) delete process.env.JUDGE_MODE;
    else process.env.JUDGE_MODE = oldMode;
    await prisma.assessment.delete({ where: { id: assessment.id } });
    await prisma.question.delete({ where: { id: question.id } });
  }
});

test('execution limits bound provider concurrency and reject excess queued work', async () => {
  const limiter = new ExecutionLimiter(1, 1, 1000);
  let release!: () => void;
  let simultaneous = 0,
    highest = 0;
  const first = limiter.run(async () => {
    simultaneous++;
    highest = Math.max(highest, simultaneous);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    simultaneous--;
    return 'first';
  });
  const second = limiter.run(async () => {
    simultaneous++;
    highest = Math.max(highest, simultaneous);
    simultaneous--;
    return 'second';
  });
  await assert.rejects(
    limiter.run(async () => 'excess'),
    /service is busy/,
  );
  release();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.equal(highest, 1);
});

test('queued submissions acknowledge saved answers and expose pending results until the worker completes', async (t) => {
  if (!process.env.REDIS_URL)
    return t.skip('Redis is required for the queued-grading integration test.');
  const { Worker, QueueEvents } = await import('bullmq');
  const { redisConnection } = await import('../ai/queue');
  const { gradingQueue, closeGradingQueue } = await import('../platform/jobs/grading-jobs');
  const { finalizeSession } = await import('../routes/attempts');
  const { default: submissions } = await import('../routes/submissions');
  const previous = {
    async: process.env.ASYNC_GRADING,
    queue: process.env.GRADING_QUEUE_NAME,
  };
  process.env.ASYNC_GRADING = '1';
  process.env.GRADING_QUEUE_NAME = `grading-test-${crypto.randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      name: `Queued ${crypto.randomUUID()}`,
      email: `queued-${crypto.randomUUID()}@test.invalid`,
      password: 'unused',
    },
  });
  const question = await prisma.question.create({
    data: {
      title: 'Queued MCQ',
      statement: 'Select first',
      difficulty: 'easy',
      questionType: 'mcq',
      settings: {
        options: [
          { id: 'a', text: 'First' },
          { id: 'b', text: 'Other' },
        ],
        correctOptionIds: ['a'],
      },
    },
  });
  const assessment = await prisma.assessment.create({
    data: {
      name: 'Queued fixture',
      questions: { create: { questionId: question.id } },
    },
  });
  const session = await prisma.assessmentSession.create({
    data: {
      assessmentId: assessment.id,
      candidateName: user.name,
      candidateUserId: user.id,
      drafts: {
        create: {
          questionId: question.id,
          languageId: 71,
          languageName: 'Answer',
          code: '["a"]',
          isAnswered: true,
        },
      },
    },
  });
  const auth = await createSessionForUser(user.id, user.email, user.name, user.role);
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/attempts', attemptRoutes);
  app.use('/submissions', submissions);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = (path: string, method = 'GET') =>
    fetch(url + path, {
      method,
      headers: { Authorization: `Bearer ${auth.token}` },
    });
  const workerConnection = redisConnection(true);
  const eventConnection = redisConnection(true);
  const events = new QueueEvents(process.env.GRADING_QUEUE_NAME!, {
    connection: eventConnection as any,
  });
  let worker: InstanceType<typeof Worker> | undefined;
  try {
    await events.waitUntilReady();
    const submit = await call(`/attempts/${session.id}/submit`, 'POST');
    assert.equal(submit.status, 202);
    assert.ok(
      (
        await prisma.assessmentSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).finishedAt,
    );
    const path = `/submissions/${assessment.id}/${encodeURIComponent(user.name)}`;
    const pending = await call(path);
    assert.equal(pending.status, 202);
    assert.equal(((await pending.json()) as any).resultsPending, true);
    assert.equal((await call(`/attempts/${session.id}/submit`, 'POST')).status, 202);
    const queue = gradingQueue();
    const job = await queue.getJob(`attempt-${session.id}`);
    assert.ok(job);
    worker = new Worker(
      process.env.GRADING_QUEUE_NAME!,
      (job) => finalizeSession((job.data as { sessionId: number }).sessionId),
      { connection: workerConnection as any },
    );
    await job.waitUntilFinished(events, 15000);
    const completed = await call(path);
    assert.equal(completed.status, 200);
    assert.equal(((await completed.json()) as any).overallScore, 100);
    assert.equal((await call(`/attempts/${session.id}/submit`, 'POST')).status, 200);
  } finally {
    await worker?.close();
    await events.close();
    await gradingQueue().obliterate({ force: true });
    await closeGradingQueue();
    workerConnection.disconnect();
    eventConnection.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.assessment.delete({ where: { id: assessment.id } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.user.delete({ where: { id: user.id } });
    if (previous.async === undefined) delete process.env.ASYNC_GRADING;
    else process.env.ASYNC_GRADING = previous.async;
    if (previous.queue === undefined) delete process.env.GRADING_QUEUE_NAME;
    else process.env.GRADING_QUEUE_NAME = previous.queue;
  }
});

test('candidate summaries separate identical display names, latest attempts, and provisional scores', () => {
  const date = (day: number) => new Date(Date.UTC(2026, 10, day));
  const summaries = summarizeCandidates(
    [{ questionId: 1, marks: 10 }],
    60,
    [
      {
        candidateName: 'Same Name',
        questionId: 1,
        sessionId: 1,
        score: 100,
        createdAt: date(1),
        status: 'graded',
      },
      {
        candidateName: 'Same Name',
        questionId: 1,
        sessionId: 2,
        score: 0,
        createdAt: date(2),
        status: 'pending_review',
      },
      {
        candidateName: 'Same Name',
        questionId: 1,
        sessionId: 3,
        score: 50,
        createdAt: date(3),
        status: 'graded',
      },
    ],
    [
      {
        id: 1,
        candidateUserId: 10,
        candidateName: 'Same Name',
        startedAt: date(1),
        finishedAt: date(1),
        gradingStatus: 'completed',
      },
      {
        id: 2,
        candidateUserId: 20,
        candidateName: 'Same Name',
        startedAt: date(2),
        finishedAt: date(2),
        gradingStatus: 'completed',
      },
      {
        id: 3,
        candidateUserId: 10,
        candidateName: 'Same Name',
        startedAt: date(3),
        finishedAt: date(3),
        gradingStatus: 'completed',
      },
    ],
  );
  assert.equal(summaries.length, 2);
  assert.equal(summaries.find((s) => s.candidateUserId === 10)?.overallScore, 50);
  assert.equal(summaries.find((s) => s.candidateUserId === 20)?.isProvisional, true);
  assert.equal(aggregate(summaries).averageScore, 50);
});
