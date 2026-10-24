import '../config/environment';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import prisma from '../prisma';
import { createAIWorkflowRouter } from '../routes/ai-workflows';
import { createInterviewWorkflowRouter } from '../routes/interview-workflows';
import { structuredAI, WorkflowError } from '../services/structured-ai';
import { ZodError } from 'zod';

const prefix = `Workflow test ${Date.now()}`;
const content = {
  title: prefix,
  statement:
    'Read a single integer from stdin and print that same integer on stdout.',
  difficulty: 'easy',
  questionType: 'coding',
  topics: ['integers'],
  requiredSkills: ['Python'],
  testCases: [
    { input: '1', expectedOutput: '1', isSample: true },
    { input: '-2', expectedOutput: '-2', isSample: false },
  ],
  starterCodePython: 'n = input()',
  expectedSolutionPython: 'print(input())',
  solutionExplanation:
    'Read the integer without modifying it and print it once.',
};
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
const ai = (async (
  name: string,
  _schema: unknown,
  _instructions: unknown,
  input: any,
) => {
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
        observation: 'Uses stdin parsing',
        evidence: [
          {
            source: 'code',
            quote: unsupportedEvidence ? 'invented code' : 'print(input())',
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
      role: req.headers['x-test-role'] === 'candidate' ? 'candidate' : 'admin',
    };
    next();
  });
  const execute = (async (input: any) => ({
    stdout: input.stdin,
    stderr: null,
    compile_output: null,
    message: null,
    status: { id: 3, description: 'Accepted' },
    time: '0.01',
    memory: 1000,
    token: 'test',
  })) as any;
  app.use(
    '/ai',
    createAIWorkflowRouter({ ai, execute, mockMode: () => false }),
  );
  app.use('/interviews', createInterviewWorkflowRouter(ai));
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(
          error instanceof WorkflowError
            ? error.status
            : error instanceof ZodError
              ? 400
              : 500,
        )
        .json({ error: error.message });
    },
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (
    path: string,
    method = 'GET',
    body?: unknown,
    role = 'admin',
  ) => {
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
    await t.test(
      'generation preserves drafts and rejects invalid counts',
      async () => {
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
          requiredSkills: ['Python'],
        });
        assert.equal(r.status, 201);
        draftId = r.body[0].id;
        assert.equal(
          await prisma.question.count({ where: { title: prefix } }),
          0,
        );
        assert.equal(
          (
            await request(`/ai/drafts/${draftId}/approve`, 'POST', {
              revision: 1,
            })
          ).status,
          409,
        );
        assert.equal(
          (await request('/ai/drafts', 'GET', undefined, 'candidate')).status,
          403,
        );
      },
    );
    await t.test(
      'editing invalidates validation and stale writes are rejected',
      async () => {
        assert.equal(
          (await request(`/ai/drafts/${draftId}/validate`, 'POST')).body.status,
          'validated',
        );
        const r = await request(`/ai/drafts/${draftId}`, 'PUT', {
          content,
          revision: 1,
        });
        assert.equal(r.body.revision, 2);
        assert.equal(r.body.status, 'draft');
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
              content,
              revision: 1,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      'approval inserts one bank question and duplicates cannot pass',
      async () => {
        assert.equal(
          (await request(`/ai/drafts/${draftId}/validate`, 'POST')).body.status,
          'validated',
        );
        const approved = await request(
          `/ai/drafts/${draftId}/approve`,
          'POST',
          { revision: 2 },
        );
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
        assert.equal(
          await prisma.question.count({ where: { title: prefix } }),
          1,
        );
        const duplicate = await request('/ai/drafts', 'POST', content);
        const validation = await request(
          `/ai/drafts/${duplicate.body.id}/validate`,
          'POST',
        );
        assert.equal(validation.body.status, 'needs_changes');
        assert.equal(
          validation.body.validation.checks.find(
            (c: any) => c.key === 'duplicate',
          ).passed,
          false,
        );
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
    const input = {
      jobRequirements: 'Build Python services',
      candidateExperience: '3 years',
      requiredSkills: ['Python'],
      durationMinutes: 30,
    };
    await t.test(
      'plans are editable and duration sums are enforced',
      async () => {
        const plan = await request(
          `/interviews/${interviewId}/plan/generate`,
          'POST',
          input,
        );
        assert.equal(plan.status, 200);
        const sections = [{ ...plan.body.sections[0], minutes: 29 }];
        assert.equal(
          (
            await request(`/interviews/${interviewId}/plan`, 'PUT', {
              ...input,
              sections,
            })
          ).status,
          400,
        );
        sections[0].minutes = 30;
        assert.equal(
          (
            await request(`/interviews/${interviewId}/plan`, 'PUT', {
              ...input,
              sections,
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      'planned discussion questions support skill evaluation',
      async () => {
        const statement = 'How do you parse an integer?';
        let hash = 5381;
        for (const char of `Python:${statement}`)
          hash = (Math.imul(hash, 33) ^ char.charCodeAt(0)) | 0;
        const questionId = -(Math.abs(hash) || 1);
        const result = await request(
          `/interviews/${interviewId}/evaluations`,
          'PUT',
          {
            questionId,
            candidateAnswer: 'Use int() with validation',
            candidateCode: '',
            notes: 'Answered verbally',
            skills: [
              { skill: 'Python', rating: 4, rationale: 'Explained validation' },
            ],
            status: 'final',
          },
        );
        assert.equal(result.status, 200);
        assert.equal(
          result.body.executionResults.questionSnapshot.statement,
          statement,
        );
      },
    );
    await t.test(
      'skill evaluation requires rationale and AI quotes must exist in evidence',
      async () => {
        const input = {
          questionId,
          candidateAnswer: 'I read from stdin',
          candidateCode: 'print(input())',
          notes: 'Explained parsing',
          skills: [
            { skill: 'Python', rating: 4, rationale: 'Correct stdin parsing' },
          ],
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
        const evaluation = await request(
          `/interviews/${interviewId}/evaluations`,
          'PUT',
          input,
        );
        assert.equal(evaluation.status, 200);
        const path = `/interviews/${interviewId}/evaluations/${evaluation.body.id}/observe`;
        unsupportedEvidence = true;
        assert.equal((await request(path, 'POST')).status, 502);
        unsupportedEvidence = false;
        const result = await request(path, 'POST');
        assert.equal(result.status, 200);
        assert.equal(
          result.body.observations[0].evidence[0].quote,
          'print(input())',
        );
        const revised = await request(
          `/interviews/${interviewId}/evaluations`,
          'PUT',
          { ...input, candidateCode: 'print(1)', status: 'draft' },
        );
        assert.deepEqual(revised.body.observations, []);
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (interviewId)
      await prisma.interview.delete({ where: { id: interviewId } });
    await prisma.aIQuestionDraft.deleteMany({ where: { authorId: user.id } });
    if (questionId) await prisma.question.delete({ where: { id: questionId } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
