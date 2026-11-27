import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import express from 'express';
import { ZodError } from 'zod';
import prisma from '../database/prisma';
import { createAIWorkflowRouter } from '../routes/ai-workflows';
import { referenceIsVerified } from '../services/questions/reference-verification';
import type { executeCode } from '../services/execution/judge0';

test('reviewed reference passes trusted examples, computes exact outputs, blocks bypasses, and expires on edits', async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Reference reviewer',
      email: `oracle-${randomUUID()}@test.invalid`,
      password: 'unused',
      role: 'admin',
    },
  });
  const content = {
    title: `Oracle ${randomUUID()}`,
    statement: 'Return the input integer unchanged using the provided core function.',
    difficulty: 'easy',
    questionType: 'coding',
    topics: ['integers'],
    requiredSkills: [],
    starterContractVersion: 2,
    inputFormat: 'One integer',
    outputFormat: 'One integer',
    functionSignature: 'def solve(n: int) -> int:',
    constraints: '-5 <= n <= 4',
    starterCodePython:
      'def solve(n: int) -> int:\n    # BEGIN CORE LOGIC\n    # TODO\n    return 0\n    # END CORE LOGIC\nprint(solve(int(input())))',
    starterCodes: [] as any[],
    expectedSolutionPython: 'def solve(n: int) -> int:\n    return n\nprint(solve(int(input())))',
    testCases: Array.from({ length: 10 }, (_, i) => ({
      input: String(i - 5),
      expectedOutput: 'AI MADE THIS UP',
      isSample: i < 2,
      isEdgeCase: i === 0,
      description: 'Integer input',
    })),
  };
  content.starterCodes = [
    { languageId: 71, languageName: 'Python', code: content.starterCodePython },
  ];
  const draft = await prisma.aIQuestionDraft.create({
    data: { authorId: user.id, content, requiresReferenceReview: true },
  });
  let mode = 'normal',
    calls = 0,
    mocked = false;
  const execute = (async (input) => {
    calls++;
    if (mode === 'unavailable') throw new Error('Judge offline');
    if (mode === 'racing') {
      mode = 'normal';
      await prisma.aIQuestionDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      });
    }
    const result = spawnSync('python', ['-c', input.sourceCode], {
      input: input.stdin,
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr,
      compile_output: null,
      message: null,
      status: {
        id: result.status === 0 ? 3 : 11,
        description: result.status === 0 ? 'Accepted' : 'Runtime Error',
      },
      time: '0.01',
      memory: 100,
    };
  }) as typeof executeCode;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: req.headers['x-role'] === 'candidate' ? 'candidate' : 'admin',
    } as any;
    next();
  });
  app.use('/ai', createAIWorkflowRouter({ execute, mockMode: () => mocked }));
  app.use((error: any, _req: any, res: any, _next: any) =>
    res
      .status(error instanceof ZodError ? 400 : (error.status ?? 500))
      .json({ error: error.message }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  const review = {
    revision: 1,
    reviewedIndependently: true,
    sourceNote: 'Manually reviewed identity algorithm and derived these independent answers.',
    trustedCases: [
      { input: '-5', expectedOutput: '-5' },
      { input: '4', expectedOutput: '4' },
    ],
  };
  async function request(action: string, body: any, role = 'admin') {
    const res = await fetch(
      action === 'approve'
        ? `${root}/ai/coding/${draft.id}/approve`
        : `${root}/ai/drafts/${draft.id}/${action}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-role': role },
        body: JSON.stringify(body),
      },
    );
    return { status: res.status, body: (await res.json()) as any };
  }
  try {
    for (const flag of [{ skipValidation: true }, { directApprove: true }, {}])
      assert.equal((await request('approve', { revision: 1, ...flag })).status, 409);
    assert.equal(calls, 0);
    assert.equal(
      (
        await request('test-solution', {
          revision: 1,
          sourceCode: content.expectedSolutionPython,
          languageId: 71,
        })
      ).status,
      409,
    );
    assert.equal((await request('verify-reference', review, 'candidate')).status, 403);
    assert.equal(
      (await request('verify-reference', { ...review, reviewedIndependently: false })).status,
      400,
    );
    const bad = await request('verify-reference', {
      ...review,
      trustedCases: [
        { input: '-5', expectedOutput: '123' },
        { input: '4', expectedOutput: '4' },
      ],
    });
    assert.equal(bad.status, 422);
    assert.match(bad.body.error, /Trusted test 1 failed/);
    assert.deepEqual(
      (await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: draft.id } })).content,
      content,
    );
    mocked = true;
    assert.equal((await request('verify-reference', review)).status, 503);
    mocked = false;
    mode = 'unavailable';
    assert.equal((await request('verify-reference', review)).status, 503);
    mode = 'normal';
    const verified = await request('verify-reference', review);
    assert.equal(verified.status, 200);
    assert.equal(verified.body.referenceVerified, true);
    assert.equal(verified.body.revision, 2);
    assert.equal(verified.body.referenceVerification.verifiedBy, user.id);
    for (const [i, item] of verified.body.content.testCases.entries())
      assert.equal(item.expectedOutput.replace(/\r\n/g, '\n'), `${i - 5}\n`);
    assert.equal(verified.body.content.starterCodePython, content.starterCodePython);
    assert.equal(verified.body.status, 'draft');
    assert.equal(verified.body.questionId, null);
    let saved = await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(referenceIsVerified(saved), true);
    const originalVerifiedContent = saved.content;
    if (originalVerifiedContent === null) throw new Error('Verified content must be present');
    // Even direct JSON edits that preserve a revision do not bypass the content fingerprint.
    await prisma.aIQuestionDraft.update({
      where: { id: draft.id },
      data: { content: { ...verified.body.content, constraints: 'changed' } },
    });
    saved = await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(referenceIsVerified(saved), false);
    assert.equal((await request('approve', { revision: 2, skipValidation: true })).status, 409);
    await prisma.aIQuestionDraft.update({
      where: { id: draft.id },
      data: { content: originalVerifiedContent },
    });
    assert.equal((await request('approve', { revision: 2, skipValidation: true })).status, 200);
    saved = await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: draft.id } });
    assert.ok(saved.questionId);
    const tests = await prisma.testCase.findMany({ where: { questionId: saved.questionId! } });
    assert.equal(tests.length, 10);
    assert.ok(tests.every((t) => t.expectedOutput.replace(/\r\n/g, '\n') === `${t.input}\n`));
    await prisma.question.delete({ where: { id: saved.questionId! } });
    await prisma.aIQuestionDraft.update({
      where: { id: draft.id },
      data: { status: 'draft', questionId: null },
    });
    mode = 'racing';
    assert.equal((await request('verify-reference', { ...review, revision: 2 })).status, 409);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const row = await prisma.aIQuestionDraft.findUnique({ where: { id: draft.id } });
    if (row?.questionId) await prisma.question.delete({ where: { id: row.questionId } });
    await prisma.aIQuestionDraft.delete({ where: { id: draft.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
