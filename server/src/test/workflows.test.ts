import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import prisma from '../database/prisma';
import { createAIWorkflowRouter } from '../routes/ai-workflows';
import { createInterviewWorkflowRouter } from '../routes/interview-workflows';
import { structuredAI, WorkflowError } from '../services/ai/structured-ai';
import { ZodError } from 'zod';

const prefix = `Workflow test ${Date.now()}`;
const content = {
  title: prefix,
  statement: 'Read a single integer from stdin and print that same integer on stdout.',
  inputFormat: 'One integer n on standard input.',
  outputFormat: 'The returned integer on one line.',
  functionSignature: 'def solve(n: int) -> int:',
  constraints: '-1000000 <= n <= 1000000',
  difficulty: 'easy',
  questionType: 'coding',
  topics: ['integers'],
  requiredSkills: ['Python'],
  testCases: [
    { input: '1', expectedOutput: '1', isSample: true },
    { input: '-2', expectedOutput: '-2', isSample: false },
  ],
  starterCodePython:
    'def solve(n: int) -> int:\n    # BEGIN CORE LOGIC\n    # TODO: implement core logic\n    return 0\n    # END CORE LOGIC\n\nif __name__ == "__main__":\n    n = int(input())\n    print(solve(n))',
  expectedSolutionPython: 'def solve(n: int) -> int:\n    return n\n\nprint(solve(int(input())))',
  solutionExplanation: 'Read the integer without modifying it and print it once.',
};
const starterCodes = [{ languageId: 71, languageName: 'Python', code: content.starterCodePython }];
const checks = [
  'duplicate',
  'correctness',
  'ambiguity',
  'difficulty',
  'testCases',
  'expectedSolution',
  'edgeCases',
].map((key) => ({ key, passed: true, evidence: `Verified ${key}` }));
let unsupportedEvidence = false;
let rationaleEvidence = false;
const ai = (async (name: string, _schema: unknown, _instructions: unknown, input: any) => {
  if (name === 'question_validation')
    return {
      checks: checks.map((c) => ({ ...c })),
      feedback: 'All checks evaluated',
    };
  if (name === 'generated_questions')
    return {
      questions: [
        {
          ...content,
          starterContractVersion: 2,
          difficulty: input.difficulty,
          questionType: input.questionType,
        },
      ],
    };
  if (name === 'interview_plan')
    return {
      sections: [
        {
          skill: 'Python',
          minutes: input.durationMinutes,
          objective: 'Check parsing',
          questions: ['How do you parse an integer?'],
          followUps: ['What about negative numbers?'],
        },
      ],
    };
  return {
    observations: [
      {
        skill: 'Python',
        observation: rationaleEvidence
          ? 'Interviewer reports clear parsing explanation'
          : 'Uses stdin parsing',
        evidence: [
          {
            source: rationaleEvidence ? 'notes' : 'code',
            quote: rationaleEvidence
              ? 'Explained parsing clearly'
              : unsupportedEvidence
                ? 'invented code'
                : 'print(input())',
          },
        ],
      },
    ],
  };
}) as typeof structuredAI;

void test('AI drafts, approval gates and evidence-backed interview evaluation', async (t) => {
  const user = await prisma.user.create({
    data: {
      name: prefix,
      email: `workflow-${Date.now()}@example.test`,
      password: 'test-only',
      role: 'admin',
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role:
        req.headers['x-test-role'] === 'candidate'
          ? 'candidate'
          : req.headers['x-test-role'] === 'interviewer'
            ? 'interviewer'
            : 'admin',
    };
    next();
  });
  const execute = (async (input: any) => ({
    stdout: input.sourceCode.includes('WRONG_OUTPUT') ? 'wrong' : input.stdin,
    stderr: null,
    compile_output: null,
    message: null,
    status: { id: 3, description: 'Accepted' },
    time: '0.01',
    memory: 1000,
    token: 'test',
  })) as any;
  app.use('/ai', createAIWorkflowRouter({ ai, execute, mockMode: () => false }));
  app.use('/interviews', createInterviewWorkflowRouter(ai));
  app.use(
    (error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res
        .status(
          error instanceof WorkflowError ? error.status : error instanceof ZodError ? 400 : 500,
        )
        .json({ error: error.message });
    },
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (path: string, method = 'GET', body?: unknown, role = 'admin') => {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-test-role': role },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  let draftId = 0;
  let questionId = 0;
  let interviewId = 0;
  try {
    await t.test('generation preserves drafts and rejects invalid counts', async () => {
      assert.equal(
        (
          await request('/ai/generate', 'POST', {
            topic: 'Integers',
            difficulty: 'easy',
            questionType: 'coding',
            count: 0,
            requiredSkills: ['Python'],
          })
        ).status,
        400,
      );
      const r = await request('/ai/generate', 'POST', {
        topic: 'Integers',
        difficulty: 'easy',
        questionType: 'coding',
        count: 1,
      });
      assert.equal(r.status, 201);
      draftId = r.body[0].id;
      assert.match(r.body[0].content.statement, /## Input format/);
      assert.match(r.body[0].content.statement, /## Output format/);
      assert.match(r.body[0].content.starterCodePython, /print\(solve\(n\)\)/);
      assert.equal(await prisma.question.count({ where: { title: prefix } }), 0);
      assert.equal(
        (
          await request(`/ai/drafts/${draftId}/approve`, 'POST', {
            revision: 1,
          })
        ).status,
        409,
      );
      assert.equal((await request('/ai/drafts', 'GET', undefined, 'candidate')).status, 403);
    });
    await t.test('editing invalidates validation and stale writes are rejected', async () => {
      const validation = (await request(`/ai/drafts/${draftId}/validate`, 'POST')).body;
      assert.equal(validation.status, 'validated');
      assert.equal(validation.validation.starterVerified, true);
      const r = await request(`/ai/drafts/${draftId}`, 'PUT', {
        content: { ...content, starterCodes },
        revision: 1,
      });
      assert.equal(r.body.revision, 2);
      assert.equal(r.body.status, 'draft');
      assert.equal(r.body.content.starterContractVersion, 2);
      const replay = await request(`/ai/drafts/${draftId}`, 'PUT', {
        content: { ...content, starterCodes },
        revision: 1,
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.revision, 2);
      assert.equal(
        (
          await request(`/ai/drafts/${draftId}/approve`, 'POST', {
            revision: 1,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(`/ai/drafts/${draftId}`, 'PUT', {
            content: { ...content, title: content.title + ' conflicting edit', starterCodes },
            revision: 1,
          })
        ).status,
        409,
      );
    });
    await t.test('broken starter formatting blocks validation and direct approval', async () => {
      const broken = content.starterCodePython.replace(
        'print(solve(n))',
        'print("WRONG_OUTPUT", solve(n))',
      );
      const created = await request('/ai/drafts', 'POST', {
        ...content,
        title: `${prefix} broken starter`,
        statement: content.statement + ' This fixture intentionally prints an extra label.',
        starterContractVersion: 2,
        starterCodePython: broken,
        starterCodes: [{ languageId: 71, languageName: 'Python', code: broken }],
      });
      const validation = await request(`/ai/drafts/${created.body.id}/validate`, 'POST');
      assert.equal(validation.body.status, 'needs_changes');
      assert.equal(validation.body.validation.executionVerified, true);
      assert.equal(validation.body.validation.starterVerified, false);
      assert.equal(validation.body.validation.starterExecutions[0].status, 'Output mismatch');
      assert.equal(validation.body.validation.starterExecutions[0].expectedOutput, '1');
      assert.equal(validation.body.validation.starterExecutions[0].actualOutput, 'wrong');
      assert.match(validation.body.validation.starterExecutions[0].fix, /starter driver/);
      const direct = await request(`/ai/drafts/${created.body.id}/approve`, 'POST', {
        revision: 1,
        directApprove: true,
      });
      assert.equal(direct.status, 409);
      assert.match(direct.body.error, /Starter input\/output execution failed/);
      assert.equal(direct.body.diagnostics[0].status, 'Output mismatch');
      const failedDraft = await prisma.aIQuestionDraft.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      assert.equal(failedDraft.status, 'needs_changes');
      assert.equal((failedDraft.validation as any).reviewMode, 'direct');
    });
    await t.test('approval inserts one bank question and duplicates cannot pass', async () => {
      assert.equal(
        (await request(`/ai/drafts/${draftId}/validate`, 'POST')).body.status,
        'validated',
      );
      const approved = await request(`/ai/drafts/${draftId}/approve`, 'POST', { revision: 2 });
      assert.equal(approved.status, 200);
      questionId = approved.body.questionId;
      assert.equal(
        (
          await request(`/ai/drafts/${draftId}/approve`, 'POST', {
            revision: 2,
          })
        ).body.questionId,
        questionId,
      );
      assert.equal(await prisma.question.count({ where: { title: prefix } }), 1);
      const duplicate = await request('/ai/drafts', 'POST', content);
      const validation = await request(`/ai/drafts/${duplicate.body.id}/validate`, 'POST');
      assert.equal(validation.body.status, 'needs_changes');
      assert.equal(
        validation.body.validation.checks.find((c: any) => c.key === 'duplicate').passed,
        false,
      );
    });
    await t.test(
      'queue deletion is revision checked, retry safe, and cannot delete approved drafts',
      async () => {
        const queued = await request('/ai/drafts', 'POST', {
          ...content,
          title: `${prefix} delete fixture`,
        });
        const path = `/ai/drafts/${queued.body.id}`;
        assert.equal((await request(path, 'DELETE', { revision: 1 }, 'candidate')).status, 403);
        assert.equal((await request(path, 'DELETE', { revision: 2 })).status, 409);
        assert.equal((await request(path, 'DELETE', { revision: 1 })).status, 200);
        assert.equal((await request(path, 'DELETE', { revision: 1 })).status, 200);
        assert.equal(
          await prisma.aIQuestionDraft.findUnique({ where: { id: queued.body.id } }),
          null,
        );
        assert.equal(
          (await request(`/ai/drafts/${draftId}`, 'DELETE', { revision: 2 })).status,
          409,
        );
        assert.ok(await prisma.question.findUnique({ where: { id: questionId } }));
      },
    );
    const interview = await prisma.interview.create({
      data: {
        title: prefix,
        interviewerId: user.id,
        candidateName: 'Test candidate',
        candidateEmail: 'candidate@example.test',
        roomToken: prefix,
        questions: { create: { questionId } },
      },
    });
    interviewId = interview.id;
    await t.test('retired interview planner endpoints are unavailable', async () => {
      for (const [method, path] of [
        ['GET', 'plan'],
        ['POST', 'plan/generate'],
        ['PUT', 'plan'],
      ]) {
        const response = await fetch(`${base}/interviews/${interviewId}/${path}`, {
          method,
          headers: { 'x-test-role': 'admin' },
        });
        assert.equal(response.status, 404);
      }
    });
    await t.test(
      'skill evaluation requires rationale and AI quotes must exist in evidence',
      async () => {
        const input = {
          questionId,
          candidateAnswer: 'I read from stdin',
          candidateCode: 'print(input())',
          notes: 'Explained parsing',
          skills: [{ skill: 'Python', rating: 4, rationale: 'Correct stdin parsing' }],
          status: 'final',
        };
        assert.equal(
          (
            await request(`/interviews/${interviewId}/evaluations`, 'PUT', {
              ...input,
              skills: [{ skill: 'Python', rating: null, rationale: '' }],
            })
          ).status,
          400,
        );
        const evaluation = await request(`/interviews/${interviewId}/evaluations`, 'PUT', input);
        assert.equal(evaluation.status, 200);
        const path = `/interviews/${interviewId}/evaluations/${evaluation.body.id}/observe`;
        unsupportedEvidence = true;
        assert.equal((await request(path, 'POST')).status, 502);
        unsupportedEvidence = false;
        const result = await request(path, 'POST');
        assert.equal(result.status, 200);
        assert.equal(result.body.observations[0].evidence[0].quote, 'print(input())');
        const revised = await request(`/interviews/${interviewId}/evaluations`, 'PUT', {
          ...input,
          candidateCode: 'print(1)',
          status: 'draft',
        });
        assert.deepEqual(revised.body.observations, []);
      },
    );
    await t.test(
      'observations use saved skill rationales and are cleared when only that feedback changes',
      async () => {
        const body = {
          questionId,
          candidateAnswer: '',
          candidateCode: '',
          notes: '',
          skills: [{ skill: 'Python', rating: 4, rationale: 'Explained parsing clearly' }],
          status: 'final',
        };
        const saved = await request(`/interviews/${interviewId}/evaluations`, 'PUT', body);
        assert.equal(saved.status, 200);
        rationaleEvidence = true;
        try {
          const observed = await request(
            `/interviews/${interviewId}/evaluations/${saved.body.id}/observe`,
            'POST',
          );
          assert.equal(observed.status, 200);
          assert.equal(observed.body.status, 'final');
          assert.equal(observed.body.observations[0].evidence[0].source, 'notes');
          const changed = await request(`/interviews/${interviewId}/evaluations`, 'PUT', {
            ...body,
            skills: [{ skill: 'Python', rating: 2, rationale: 'Missed parsing details' }],
          });
          assert.deepEqual(changed.body.observations, []);
          const empty = await request(`/interviews/${interviewId}/evaluations`, 'PUT', {
            ...body,
            status: 'draft',
            skills: [{ skill: 'Python', rating: null, rationale: '' }],
          });
          assert.equal(
            (
              await request(
                `/interviews/${interviewId}/evaluations/${empty.body.id}/observe`,
                'POST',
              )
            ).status,
            400,
          );
        } finally {
          rationaleEvidence = false;
        }
      },
    );
    await t.test(
      'assigned interviewers can access evaluations while candidates cannot',
      async () => {
        for (const suffix of ['evaluations', 'ai-results']) {
          const path = `/interviews/${interviewId}/${suffix}`;
          assert.equal((await request(path, 'GET', undefined, 'interviewer')).status, 200);
          assert.equal((await request(path, 'GET', undefined, 'candidate')).status, 403);
        }
        assert.equal((await request('/ai/drafts', 'GET', undefined, 'interviewer')).status, 403);
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (interviewId) await prisma.interview.delete({ where: { id: interviewId } });
    await prisma.aIQuestionDraft.deleteMany({ where: { authorId: user.id } });
    await prisma.aIJob.deleteMany({ where: { authorId: user.id } });
    if (questionId) await prisma.question.delete({ where: { id: questionId } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
