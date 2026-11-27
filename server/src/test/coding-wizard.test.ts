import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import express from 'express';
import { z, ZodError } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import prisma from '../database/prisma';
import { createAIWorkflowRouter } from '../routes/ai-workflows';
import { cleanStarter } from '../services/questions/coding-wizard';
import type { structuredAI } from '../services/ai/structured-ai';
import type { executeCode } from '../services/execution/judge0';
const fields = {
  title: '',
  statement: 'Return the integer unchanged by implementing the named function.',
  inputFormat: 'A single integer n',
  outputFormat: 'The returned integer on one line',
  constraints: '-5 <= n <= 4',
  functionSignature: 'def solve(n: int) -> int:',
};
const py =
  'def solve(n: int) -> int:\n    # BEGIN CORE LOGIC\n    # TODO: implement\n    return 0\n    # END CORE LOGIC\nprint(solve(int(input())))';
const js =
  "const fs=require('fs');\nfunction solve(n) {\n    // BEGIN CORE LOGIC\n    // TODO: implement\n    return 0;\n    // END CORE LOGIC\n}\nconsole.log(solve(Number(fs.readFileSync(0,'utf8').trim())));";
const java =
  'import java.util.*;\npublic class Main {\n public static int solve(int n) {\n  // BEGIN CORE LOGIC\n  // TODO: implement\n  return 0;\n  // END CORE LOGIC\n }\n public static void main(String[] args) {System.out.println(solve(new Scanner(System.in).nextInt()));}\n}';
test('starters expose no approach hints and retain literal input/output strings', () => {
  const python = cleanStarter(
    py + '\n# Use binary search for the answer\n',
    71,
    fields.functionSignature,
  );
  assert.doesNotMatch(python, /binary search|return n/);
  assert.match(python, /pass/);
  const javascript = cleanStarter(
    "const marker='http://example'; // use a sliding window\n" + js,
    63,
    fields.functionSignature,
  );
  assert.match(javascript, /http:\/\/example/);
  assert.doesNotMatch(javascript, /sliding window/);
  assert.match(javascript, /BEGIN CORE LOGIC/);
});
test('coding wizard isolates LLM stages, preserves checkpoints, verifies independent answers, and publishes only reviewed drafts', async () => {
  const user = await prisma.user.create({
    data: {
      email: `wizard-${randomUUID()}@test.invalid`,
      name: 'Wizard reviewer',
      role: 'admin',
      password: 'unused',
    },
  });
  let calls: string[] = [],
    failJava = true,
    badTests = false,
    executionFailure = '';
  const ai = (async (name: string, schema: z.ZodType, instructions: string, input: any) => {
    calls.push(name);
    assert.doesNotThrow(() => zodTextFormat(schema, name));
    if (name === 'coding_wizard_question') {
      assert.ok(!('requestedLanguages' in input));
      assert.match(instructions, /only/i);
      return { ...fields, title: `Wizard ${randomUUID()}` };
    }
    if (name === 'coding_wizard_starter') {
      assert.ok(!('testCases' in input));
      assert.match(instructions, /Do not include the algorithm/);
      if (input.language.id === 62 && failJava)
        throw new Error('Transient Java generation failure');
      return { code: input.language.id === 71 ? py : input.language.id === 62 ? java : js };
    }
    if (name === 'coding_wizard_tests')
      return {
        cases: Array.from(
          { length: badTests ? 9 : input.sampleCount + input.hiddenCount },
          (_, i) => ({
            input: String(i - 5),
            expectedOutput: String(i - 5),
            isEdgeCase: i === 0,
            description: i === 0 ? 'Minimum allowed value' : 'Ordinary integer',
          }),
        ),
      };
    if (name === 'coding_wizard_solution')
      return {
        code: input.starter.code
          .replace(/pass|return 0;/, 'return n;')
          .replace('# TODO: implement core logic', ''),
      };
    throw new Error(`Unexpected AI stage ${name}`);
  }) as typeof structuredAI;
  const execute = (async (input) => {
    if (executionFailure === 'unavailable') throw new Error('Test judge unavailable');
    if (executionFailure === 'compile')
      return {
        stdout: null,
        stderr: null,
        compile_output: 'Example compiler diagnostic',
        message: null,
        status: { id: 6, description: 'Compilation Error' },
        time: null,
        memory: null,
      };
    if (input.languageId === 62)
      return {
        stdout: input.sourceCode.includes('return n;') ? input.stdin : '0',
        stderr: null,
        compile_output: null,
        message: null,
        status: { id: 3, description: 'Accepted' },
        time: '0.01',
        memory: 100,
      };
    const run = spawnSync(
      input.languageId === 71 ? 'python' : process.execPath,
      [input.languageId === 71 ? '-c' : '-e', input.sourceCode],
      { input: input.stdin, encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
    return {
      stdout: run.stdout,
      stderr: run.stderr,
      compile_output: null,
      message: null,
      status: {
        id: run.status === 0 ? 3 : 11,
        description: run.status === 0 ? 'Accepted' : 'Runtime Error',
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
  app.use('/ai', createAIWorkflowRouter({ ai, execute, mockMode: () => false }));
  app.use((error: any, _req: any, res: any, _next: any) =>
    res
      .status(error instanceof ZodError ? 400 : (error.status ?? 500))
      .json({ error: error.message }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  async function request(path: string, body?: any, method = 'POST', role = 'admin') {
    const res = await fetch(root + '/ai' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-role': role },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  const stage = (name: string, body: any) =>
    request(`/coding/generate-${name}`, { requestId: randomUUID(), ...body });
  const ids: number[] = [];
  try {
    assert.equal((await request('/generate', { questionType: 'coding' })).status, 410);
    assert.equal((await stage('question', { topic: 'Echo', difficulty: 'easy' })).status, 200);
    const questionRequest = { requestId: randomUUID(), topic: 'Echo', difficulty: 'easy' };
    let response = await request('/coding/generate-question', questionRequest);
    let d = response.body;
    ids.push(d.id);
    const before = calls.length;
    const replay = await request('/coding/generate-question', questionRequest);
    assert.equal(replay.body.id, d.id);
    assert.equal(calls.length, before);
    assert.equal(d.content.starterCodes.length, 0);
    assert.equal(d.content.testCases.length, 0);
    assert.equal(d.content.referenceSolution, null);
    assert.equal(
      (
        await stage('tests', {
          draftId: d.id,
          revision: d.revision,
          sampleCount: 2,
          hiddenCount: 8,
        })
      ).status,
      409,
    );
    assert.equal(
      (await request(`/drafts/${d.id}/approve`, { revision: d.revision, skipValidation: true }))
        .status,
      410,
    );
    d = (await stage('starter', { draftId: d.id, revision: d.revision, languageId: 71 })).body;
    assert.match(d.content.starterCodePython, /pass/);
    assert.doesNotMatch(d.content.starterCodePython, /return n/);
    const failedRequest = {
      requestId: randomUUID(),
      draftId: d.id,
      revision: d.revision,
      languageId: 62,
    };
    assert.equal((await request('/coding/generate-starter', failedRequest)).status, 500);
    assert.equal(
      (await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: d.id } })).revision,
      d.revision,
    );
    failJava = false;
    d = (await request('/coding/generate-starter', failedRequest)).body;
    assert.deepEqual(
      d.content.starterCodes.map((s: any) => s.languageId),
      [71, 62],
    );
    d = (await stage('starter', { draftId: d.id, revision: d.revision, languageId: 63 })).body;
    assert.equal(d.content.starterCodes.length, 3);
    assert.equal(
      (
        await stage('tests', {
          draftId: d.id,
          revision: d.revision,
          sampleCount: 1,
          hiddenCount: 1,
        })
      ).status,
      400,
    );
    badTests = true;
    assert.equal(
      (
        await stage('tests', {
          draftId: d.id,
          revision: d.revision,
          sampleCount: 2,
          hiddenCount: 8,
        })
      ).status,
      400,
    );
    badTests = false;
    d = (
      await stage('tests', { draftId: d.id, revision: d.revision, sampleCount: 2, hiddenCount: 8 })
    ).body;
    assert.equal(d.content.testCases.filter((t: any) => t.isSample).length, 2);
    assert.equal(d.content.testCases.filter((t: any) => !t.isSample).length, 8);
    assert.ok(d.content.testCases.every((t: any) => t.expectedOutput === t.input));
    d = (await stage('solution', { draftId: d.id, revision: d.revision, languageId: 63 })).body;
    assert.equal(d.content.referenceSolution.languageId, 63);
    assert.equal(
      (await request(`/coding/${d.id}/approve`, { revision: d.revision, skipValidation: true }))
        .status,
      409,
    );
    const check = {
      revision: d.revision,
      reviewedIndependently: true,
      sourceNote:
        'Independently derived identity examples and checked the reference implementation.',
      trustedCases: [
        { input: '-5', expectedOutput: '-5' },
        { input: '4', expectedOutput: '4' },
      ],
    };
    assert.equal(
      (
        await request(`/drafts/${d.id}/verify-reference`, {
          ...check,
          trustedCases: [
            { input: '-5', expectedOutput: '99' },
            { input: '4', expectedOutput: '4' },
          ],
        })
      ).status,
      422,
    );
    response = await request(`/drafts/${d.id}/verify-reference`, check);
    assert.equal(response.status, 200, response.body.error);
    d = response.body;
    assert.equal(d.referenceVerified, true);
    const result = await request(`/drafts/${d.id}/test-solution`, {
      revision: d.revision,
      languageId: 63,
      sourceCode: d.content.referenceSolution.code,
    });
    assert.equal(result.body.passed, 10);
    const published = await request(`/coding/${d.id}/approve`, { revision: d.revision });
    assert.equal(published.status, 200, published.body.error);
    assert.ok(published.body.questionId);
    const bank = await prisma.question.findUniqueOrThrow({
      where: { id: published.body.questionId },
      include: { starterCodes: true, testCases: true },
    });
    assert.equal(bank.starterCodes.length, 3);
    assert.equal(bank.testCases.length, 10);
    assert.ok(bank.testCases.every((t) => t.expectedOutput.trim() === t.input));
    assert.doesNotMatch(bank.starterCodes.find((s) => s.languageId === 63)!.code, /return n/);
    // A single non-Python starter/solution is sufficient; no hidden Python generation.
    let one = (await stage('question', { topic: 'Echo', difficulty: 'easy' })).body;
    ids.push(one.id);
    one = (await stage('starter', { draftId: one.id, revision: one.revision, languageId: 62 }))
      .body;
    one = (
      await stage('tests', {
        draftId: one.id,
        revision: one.revision,
        sampleCount: 3,
        hiddenCount: 7,
      })
    ).body;
    one = (await stage('solution', { draftId: one.id, revision: one.revision, languageId: 62 }))
      .body;
    // Generated verification needs no human confirmation but must reject wrong expected answers.
    const correctCases = structuredClone(one.content.testCases);
    one = (
      await request(
        `/coding/${one.id}`,
        {
          revision: one.revision,
          stage: 'tests',
          data: correctCases.map((t: any, index: number) => ({
            ...t,
            expectedOutput: index === 0 ? 'wrong' : t.expectedOutput,
          })),
        },
        'PUT',
      )
    ).body;
    const beforeFailure = await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: one.id } });
    const failed = await request(`/drafts/${one.id}/verify-reference`, {
      revision: one.revision,
      mode: 'generated',
    });
    assert.equal(failed.status, 422);
    assert.match(failed.body.error, /Test cases 1 failed/);
    assert.equal(failed.body.revision, one.revision);
    assert.equal(failed.body.executions.length, 10);
    assert.equal(failed.body.executions[0].expectedOutput, 'wrong');
    assert.equal(failed.body.executions[0].actualOutput, '-5');
    assert.equal(failed.body.executions[0].status, 'Output mismatch');
    assert.equal(failed.body.executions[0].passed, false);
    assert.ok(failed.body.executions.slice(1).every((result: any) => result.passed));
    executionFailure = 'compile';
    const compileFailure = await request(`/drafts/${one.id}/verify-reference`, {
      revision: one.revision,
      mode: 'generated',
    });
    assert.equal(compileFailure.status, 422);
    assert.equal(compileFailure.body.executions[0].actualOutput, '');
    assert.match(compileFailure.body.executions[0].details, /Example compiler diagnostic/);
    assert.equal(compileFailure.body.executions[0].status, 'Compilation Error');
    executionFailure = 'unavailable';
    const unavailable = await request(`/drafts/${one.id}/verify-reference`, {
      revision: one.revision,
      mode: 'generated',
    });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.executions.length, 10);
    assert.match(unavailable.body.executions[0].details, /Test judge unavailable/);
    executionFailure = '';
    const afterFailure = await prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: one.id } });
    assert.deepEqual(afterFailure.content, beforeFailure.content);
    assert.equal(afterFailure.revision, beforeFailure.revision);
    assert.equal(
      (await request(`/coding/${one.id}/approve`, { revision: one.revision })).status,
      409,
    );
    one = (
      await request(
        `/coding/${one.id}`,
        { revision: one.revision, stage: 'tests', data: correctCases },
        'PUT',
      )
    ).body;
    const verified = await request(`/drafts/${one.id}/verify-reference`, {
      revision: one.revision,
      mode: 'generated',
    });
    assert.equal(verified.status, 200, verified.body.error);
    one = verified.body;
    assert.equal(one.referenceVerification.method, 'generated-case-execution');
    assert.equal(one.referenceVerification.trustedTestsPassed, 10);
    assert.equal(one.referenceVerification.executions.length, 10);
    assert.ok(one.referenceVerification.executions.every((result: any) => result.passed));
    // Manual cases can be saved after execution. Their answers persist and revoke verification.
    one = (
      await request(
        `/coding/${one.id}`,
        {
          revision: one.revision,
          stage: 'tests',
          data: [
            ...one.content.testCases,
            {
              input: '5',
              expectedOutput: '5',
              isSample: false,
              isEdgeCase: false,
              description: 'Manual check',
            },
          ],
        },
        'PUT',
      )
    ).body;
    assert.equal(one.content.testCases.length, 11);
    assert.equal(one.content.testCases[10].expectedOutput, '5');
    assert.equal(one.referenceVerified, false);
    assert.equal(
      (await request(`/coding/${one.id}/approve`, { revision: one.revision })).status,
      409,
    );
    const manualVerified = await request(`/drafts/${one.id}/verify-reference`, {
      revision: one.revision,
      mode: 'generated',
    });
    assert.equal(manualVerified.status, 200, manualVerified.body.error);
    one = manualVerified.body;
    assert.equal(one.content.starterCodes.length, 1);
    assert.equal(one.content.referenceSolution.languageId, 62);
    const keptSolution = one.content.referenceSolution.code;
    one = (await stage('starter', { draftId: one.id, revision: one.revision, languageId: 63 }))
      .body;
    assert.equal(one.content.referenceSolution.code, keptSolution);
    assert.equal(one.referenceVerified, false);
    const changed = await request(
      `/coding/${one.id}`,
      {
        revision: one.revision,
        stage: 'question',
        data: {
          ...fields,
          title: one.content.title,
          statement: fields.statement + ' Updated contract.',
        },
      },
      'PUT',
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.body.content.starterCodes.length, 0);
    assert.equal(changed.body.referenceVerified, false);
    assert.equal(
      (await request(`/coding/${one.id}/approve`, { revision: changed.body.revision })).status,
      409,
    );
    assert.equal(
      (await request('/coding/generate-question', questionRequest, 'POST', 'candidate')).status,
      403,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const ds = await prisma.aIQuestionDraft.findMany({ where: { authorId: user.id } });
    await prisma.aIQuestionDraft.deleteMany({ where: { authorId: user.id } });
    await prisma.question.deleteMany({
      where: { id: { in: ds.flatMap((d) => (d.questionId ? [d.questionId] : [])) } },
    });
    await prisma.aIJob.deleteMany({ where: { authorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
