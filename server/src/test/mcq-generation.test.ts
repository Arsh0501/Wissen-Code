import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { createAIWorkflowRouter } from '../routes/ai-workflows';
import { generationSchema, mcqContentSchema } from '../services/workflow-schemas';
import { generationTopics } from '../services/studio-generation';
import { structuredAI } from '../services/structured-ai';
import { candidatePayload } from '../platform/questions';
import { gradeAnswer } from '../services/grading';

const fixture = {
  title: 'Single-choice fixture', statement: 'Which expression evaluates to four in ordinary integer arithmetic?',
  difficulty: 'easy', questionType: 'mcq', topics: ['Arithmetic'], requiredSkills: [],
  options: [{ id: 'a', text: '2 + 2' }, { id: 'b', text: '2 + 3' }, { id: 'c', text: '2 + 4' }],
  correctOptionId: 'a', solutionExplanation: 'Adding two and two gives four; the other results are five and six.',
};

test('MCQ schemas reject ambiguous option structures and topic settings are bounded', () => {
  assert.equal(mcqContentSchema.parse(fixture).questionType, 'mcq');
  for (const invalid of [
    { ...fixture, correctOptionId: 'missing' }, { ...fixture, correctOptionId: ['a', 'b'] },
    { ...fixture, options: [fixture.options[0]] },
    { ...fixture, options: [fixture.options[0], fixture.options[0]] },
    { ...fixture, options: [{ id: 'a', text: 'Same' }, { id: 'b', text: 'same' }] },
  ]) assert.equal(mcqContentSchema.safeParse(invalid).success, false);
  const settings = generationSchema.parse({ topic: 'Arrays, SQL; Arrays', questionType: 'mcq', count: 3, difficulty: 'easy' });
  assert.deepEqual(generationTopics(settings), ['Arrays', 'SQL']);
  assert.throws(() => generationTopics({ ...settings, count: 1 }), /one question per topic/);
  assert.throws(() => generationTopics({ ...settings, topic: undefined }), /Enter 1/);
});

test('multi-topic MCQs generate, review without a judge, publish by topic, and grade in assessments', async () => {
  const run = randomUUID();
  const user = await prisma.user.create({ data: { name: 'MCQ fixture', email: `${run}@test.invalid`, password: 'unused', role: 'admin' } });
  const published: number[] = [];
  let assessmentId: number | undefined;
  let aiCalls = 0;
  const requestedTopics: string[] = [];
  const ai = (async (name: string, _schema: unknown, instructions: string, input: any) => {
    if (name === 'question_validation') {
      assert.match(instructions, /single-choice MCQ/);
      return { checks: ['duplicate', 'correctness', 'ambiguity', 'difficulty', 'testCases', 'expectedSolution', 'edgeCases'].map(key => ({ key, passed: true, evidence: 'Verified independently' })), feedback: 'One correct answer.' };
    }
    aiCalls++;
    requestedTopics.push(input.topic);
    return { questions: [{ ...fixture, title: `${run} ${aiCalls}`, statement: `${fixture.statement} Fixture ${run} ${aiCalls}`, topics: ['Incorrect model topic'] }] };
  }) as typeof structuredAI;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: user.id, name: user.name, email: user.email, role: 'admin' }; next(); });
  app.use('/ai', createAIWorkflowRouter({ ai, mockMode: () => true, execute: (async () => { throw new Error('MCQs must never invoke the judge'); }) as any }));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(err instanceof z.ZodError ? 400 : err.status ?? 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (path: string, body: unknown, method = 'POST') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const input = { requestId: randomUUID(), topics: ['Arrays', 'SQL'], count: 3, difficulty: 'easy', questionType: 'mcq' };
    const generated = await request('/ai/generate', input);
    assert.equal(generated.status, 201, JSON.stringify(generated.body));
    assert.ok(generated.body.every((d: any) => d.content.solutionExplanation === ''));
    assert.deepEqual(requestedTopics, ['Arrays', 'SQL', 'Arrays']);
    assert.deepEqual(generated.body.map((d: any) => d.content.topics), [['Arrays'], ['SQL'], ['Arrays']]);
    assert.equal((await request('/ai/generate', input)).body.length, 3);
    assert.equal(aiCalls, 3);
    const first = generated.body[0];
    assert.equal((await request(`/ai/drafts/${first.id}`, { content: { ...first.content, correctOptionId: 'missing' }, revision: 1 }, 'PUT')).status, 400);
    const validated = await request(`/ai/drafts/${first.id}/validate`, {});
    assert.equal(validated.status, 200);
    assert.equal(validated.body.status, 'validated');
    assert.deepEqual(validated.body.validation.executions, []);
    for (const [index, draft] of generated.body.entries()) {
      const approved = await request(`/ai/drafts/${draft.id}/approve`, { revision: 1, directApprove: index > 0 });
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      published.push(approved.body.questionId);
    }
    const questions = await prisma.question.findMany({ where: { id: { in: published } }, include: { testCases: true, starterCodes: true } });
    const queue = await request('/ai/drafts', undefined, 'GET');
    assert.equal(queue.status, 200);
    assert.ok(!queue.body.some((d: any) => generated.body.some((approved: any) => approved.id === d.id)));
    for (const q of questions) {
      assert.equal(q.questionType, 'mcq');
      assert.deepEqual((q.settings as any).correctOptionIds, ['a']);
      assert.equal((q.settings as any).multiple, false);
      assert.equal(q.testCases.length, 0);
      assert.equal(q.starterCodes.length, 0);
      const safe = candidatePayload(q);
      assert.equal((safe.settings as any).correctOptionIds, undefined);
      assert.equal((safe.settings as any).explanation, undefined);
    }
    assert.equal(await prisma.question.count({ where: { id: { in: published }, tags: { contains: JSON.stringify('Arrays') } } }), 2);
    const assessment = await prisma.assessment.create({ data: { name: run, questionTypes: '["mcq"]', topics: '["Arrays","SQL"]', questions: { create: published.map((questionId, orderIndex) => ({ questionId, orderIndex })) } } });
    assessmentId = assessment.id;
    const correct = await gradeAnswer(assessment.id, run, { questionId: published[0], languageId: 0, languageName: 'MCQ', code: '["a"]' });
    assert.equal(correct.score, 100);
    const wrong = await gradeAnswer(assessment.id, run, { questionId: published[0], languageId: 0, languageName: 'MCQ', code: '["a","b"]' });
    assert.equal(wrong.score, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (assessmentId) await prisma.assessment.delete({ where: { id: assessmentId } });
    await prisma.aIQuestionDraft.deleteMany({ where: { authorId: user.id } });
    await prisma.aIJob.deleteMany({ where: { authorId: user.id } });
    await prisma.question.deleteMany({ where: { id: { in: published } } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
