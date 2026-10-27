import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import prisma from '../database/prisma';
import { createInterviewWorkflowRouter } from '../routes/interview-workflows';
import { structuredAI } from '../services/ai/structured-ai';

test('resume generation uses the owned interview and returns drafts without saving questions', async () => {
  let status = 'scheduled';
  let found = true;
  let received: any;
  const question = {
    title: 'Project design',
    statement: 'Explain the project architecture.',
    difficulty: 'medium',
    tags: ['architecture'],
    keyDiscussionPoints: ['Tradeoffs'],
    expectedSolution: 'Explain design decisions.',
  };
  const originalFindFirst = prisma.interview.findFirst;
  prisma.interview.findFirst = (async (args: any) => {
    assert.deepEqual(args.where, { id: 20, interviewerId: 7 });
    return found
      ? {
          id: 20,
          status,
          candidateResume: 'Built a TypeScript service.',
          candidateResumeUrl: null,
          questions: [],
        }
      : null;
  }) as any;
  const ai = (async (_name: string, _schema: unknown, _instructions: string, input: any) => {
    received = input;
    return { questions: [question] };
  }) as typeof structuredAI;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: 7,
      name: 'Interviewer',
      email: 'interviewer@test.invalid',
      role: 'interviewer',
    };
    next();
  });
  app.use(createInterviewWorkflowRouter(ai));
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 400).json({ error: err.message }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/20/resume-questions`;
  const call = (body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const response = await call({ count: 1, difficulty: 'medium' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { questions: [question] });
    assert.equal(received.resume, 'Built a TypeScript service.');
    await call({ resumeText: 'Built Python tools.', count: 1 });
    assert.equal(received.resume, 'Built a TypeScript service.');
    assert.equal((await call({ count: 99 })).status, 400);
    status = 'completed';
    assert.equal((await call({})).status, 409);
    found = false;
    assert.equal((await call({})).status, 404);
  } finally {
    prisma.interview.findFirst = originalFindFirst;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
