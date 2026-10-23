import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import prisma from '../prisma';
import { createSessionForUser, hashRefreshToken } from '../routes/auth';
import { verifyAccessToken } from '../middleware/auth';
import { runAgent } from '../ai/gateway';
import { validateEvidence } from '../ai/schemas';
test('candidate session binding serializes concurrent logins and rejects expired or revoked tokens', async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Session test',
      email: `session-${Date.now()}@test.invalid`,
      password: 'unused',
    },
  });
  try {
    const attempts = await Promise.all([
      createSessionForUser(user.id, user.email, user.name, user.role),
      createSessionForUser(user.id, user.email, user.name, user.role),
    ]);
    assert.equal(attempts.filter((a) => 'error' in a).length, 1);
    const session = attempts.find((a) => 'token' in a)!;
    if (!('token' in session)) throw new Error('Missing token');
    const stored = await prisma.userSession.findFirstOrThrow({
      where: { userId: user.id },
    });
    assert.equal(stored.refreshToken, hashRefreshToken(session.refreshToken!));
    assert.notEqual(stored.refreshToken, session.refreshToken);
    assert.equal((await verifyAccessToken(session.token!)).id, user.id);
    await assert.rejects(
      verifyAccessToken(
        jwt.sign({ ...session.user, id: user.id + 1 }, process.env.JWT_SECRET!),
      ),
    );
    await prisma.userSession.update({
      where: { id: stored.id },
      data: { expiresAt: new Date(0) },
    });
    await assert.rejects(verifyAccessToken(session.token!));
    await prisma.userSession.deleteMany({ where: { userId: user.id } });
    await assert.rejects(verifyAccessToken(session.token!));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
test('gateway validates tool arguments, rejects unauthorized tools, and bounds tool execution', async () => {
  const schema = z.object({ ok: z.boolean() });
  let calls = 0;
  let rounds = 0;
  const tool = {
    name: 'search',
    description: 'Search',
    schema: z.object({ query: z.string() }),
    execute: async (args: any) => {
      calls++;
      return args.query;
    },
  };
  const output = await runAgent(
    'test_result',
    schema,
    'instructions',
    {},
    [tool],
    async () =>
      ++rounds === 1
        ? {
            output: [
              {
                type: 'function_call',
                name: 'search',
                call_id: 'x',
                arguments: '{"query":"React"}',
              },
            ],
          }
        : { status: 'completed', output: [], output_text: '{"ok":true}' },
  );
  assert.equal(output.ok, true);
  assert.equal(calls, 1);
  await assert.rejects(
    runAgent('test_result', schema, '', {}, [tool], async () => ({
      output: [
        {
          type: 'function_call',
          name: 'search',
          call_id: 'x',
          arguments: '{"query":"x","sql":"DROP TABLE"}',
        },
      ],
    })),
  );
  await assert.rejects(
    runAgent('test_result', schema, '', {}, [], async () => ({
      output: [
        {
          type: 'function_call',
          name: 'deleteDatabase',
          call_id: 'x',
          arguments: '{}',
        },
      ],
    })),
    /unauthorized/,
  );
  await assert.rejects(
    runAgent('test_result', schema, '', {}, [tool], async () => ({
      output: [
        {
          type: 'function_call',
          name: 'search',
          call_id: 'x',
          arguments: '{"query":"x"}',
        },
      ],
    })),
    /limit/,
  );
  await assert.rejects(
    runAgent('test_result', schema, '', {}, [], async () => ({
      status: 'completed',
      output: [],
      output_text: '{"ok":"wrong"}',
    })),
  );
});
test('evidence rejects invented quotes and unknown timeline events', () => {
  validateEvidence(
    {
      evidence: [{ sourceId: 'answer:1', quote: 'closures' }],
      timeline: [{ eventId: 7 }],
    },
    { 'answer:1': 'I used closures' },
    [7],
  );
  assert.throws(
    () =>
      validateEvidence(
        { evidence: [{ sourceId: 'answer:1', quote: 'event loop' }] },
        { 'answer:1': 'I used closures' },
      ),
    /unsupported/,
  );
  assert.throws(
    () => validateEvidence({ timeline: [{ eventId: 99 }] }, {}, [7]),
    /unknown/,
  );
});
test('BullMQ retries failed work and preserves job identity', async (t) => {
  if (!process.env.REDIS_URL) {
    t.skip('Redis is required for the BullMQ integration test.');
    return;
  }
  const connection = new Redis(
    process.env.REDIS_URL,
    { maxRetriesPerRequest: null },
  );
  const name = `wissen-test-${Date.now()}`;
  const queue = new Queue(name, { connection: connection as any });
  const eventConnection = connection.duplicate();
  const workerConnection = connection.duplicate();
  const events = new QueueEvents(name, { connection: eventConnection as any });
  let attempts = 0;
  const worker = new Worker(
    name,
    async () => {
      if (++attempts === 1) throw new Error('Transient failure');
      return { evidence: ['recorded answer'] };
    },
    { connection: workerConnection as any },
  );
  try {
    await events.waitUntilReady();
    const job = await queue.add(
      'evaluation',
      {},
      {
        jobId: 'same-request',
        attempts: 2,
        backoff: { type: 'fixed', delay: 20 },
      },
    );
    assert.equal(
      (await queue.add('evaluation', {}, { jobId: 'same-request' })).id,
      job.id,
    );
    assert.deepEqual(await job.waitUntilFinished(events, 10000), {
      evidence: ['recorded answer'],
    });
    assert.equal(attempts, 2);
  } finally {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
    eventConnection.disconnect();
    workerConnection.disconnect();
  }
});

test('reference validation rejects successful execution with incorrect output', async () => {
  const { questionTools } = await import('../ai/question-tools');
  const validator = questionTools(1, {
    mockMode: () => false,
    execute: async () => ({
      stdout: 'wrong',
      stderr: null,
      compile_output: null,
      message: null,
      status: { id: 3, description: 'Accepted' },
      time: '0.01',
      memory: 1,
    }),
  }).find((t) => t.name === 'validateQuestion')!;
  const result = (await validator.execute({
    question: {
      title: 'Echo integer',
      statement: 'Read an integer from standard input and print it unchanged.',
      difficulty: 'easy',
      questionType: 'coding',
      topics: ['integers'],
      requiredSkills: ['Python'],
      testCases: [
        { input: '1', expectedOutput: '1', isSample: true },
        { input: '-2', expectedOutput: '-2', isSample: false },
      ],
      starterCodePython: '',
      expectedSolutionPython: 'print(input())',
      solutionExplanation: 'Read and print the provided input unchanged.',
    },
  })) as any;
  assert.equal(result.verified, false);
});
