import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import prisma from '../database/prisma';
import assessments from '../routes/assessments';
import attempts from '../routes/attempts';
import jobs from '../routes/ai-jobs';
import { AuthUser } from '../middleware/auth';
import { closeQueue } from '../ai/queue';

test('assessment attempts serialize starts, protect ownership, submit and enforce retake limits', async () => {
  const nonce = Date.now();
  const user = await prisma.user.create({
    data: {
      name: `Lifecycle ${nonce}`,
      email: `lifecycle-${nonce}@test.invalid`,
      password: 'unused',
    },
  });
  const other = await prisma.user.create({
    data: {
      name: `Other lifecycle ${nonce}`,
      email: `other-lifecycle-${nonce}@test.invalid`,
      password: 'unused',
    },
  });
  const question = await prisma.question.create({
    data: {
      title: 'Echo lifecycle',
      statement: 'Print the input',
      difficulty: 'easy',
      testCases: {
        create: [{ input: '1', expectedOutput: '1', isSample: true }],
      },
    },
  });
  const assessment = await prisma.assessment.create({
    data: {
      name: 'Lifecycle test',
      status: 'published',
      maxAttempts: 2,
      questions: {
        create: [{ questionId: question.id, orderIndex: 0, marks: 10 }],
      },
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.headers['x-other'] ? other.id : user.id;
    req.user = {
      id,
      email: user.email,
      name: id === user.id ? user.name : other.name,
      role: 'candidate',
    };
    next();
  });
  app.use('/assessments', assessments);
  app.use('/attempts', attempts);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, method = 'GET', body?: unknown, otherUser = false) =>
    fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(otherUser ? { 'x-other': 'yes' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const starts = await Promise.all([
      request(`/assessments/${assessment.id}/start`, 'POST', {}),
      request(`/assessments/${assessment.id}/start`, 'POST', {}),
    ]);
    assert.equal(starts[0].status, 200);
    assert.equal(starts[1].status, 200);
    const first = (await starts[0].json()) as any;
    assert.equal(((await starts[1].json()) as any).sessionId, first.sessionId);
    assert.equal(
      (await request(`/attempts/${first.sessionId}`, 'GET', undefined, true)).status,
      403,
    );
    assert.equal(
      (
        await request(`/attempts/${first.sessionId}/answer`, 'PUT', {
          questionId: question.id,
          languageId: 71,
          languageName: 'Python',
          code: 'print(input())',
          isAnswered: true,
        })
      ).status,
      200,
    );
    assert.equal((await request(`/attempts/${first.sessionId}/submit`, 'POST', {})).status, 200);
    assert.equal(
      (
        await prisma.assessmentSession.findUniqueOrThrow({
          where: { id: first.sessionId },
        })
      ).gradingStatus,
      'completed',
    );
    assert.equal(
      (
        await request(`/attempts/${first.sessionId}/answer`, 'PUT', {
          questionId: question.id,
          languageId: 71,
          languageName: 'Python',
          code: 'changed',
        })
      ).status,
      400,
    );
    const retake = await request(`/assessments/${assessment.id}/start`, 'POST', { retake: true });
    assert.equal(retake.status, 200);
    const second = (await retake.json()) as any;
    assert.equal(second.attemptNumber, 2);
    assert.equal((await request(`/attempts/${second.sessionId}/submit`, 'POST', {})).status, 200);
    assert.equal(
      (
        await request(`/assessments/${assessment.id}/start`, 'POST', {
          retake: true,
        })
      ).status,
      403,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.assessment.delete({ where: { id: assessment.id } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
  }
});

test('accepting generated notes twice records only one private note', async () => {
  const user = await prisma.user.create({
    data: {
      name: 'AI note reviewer',
      email: `review-${Date.now()}@test.invalid`,
      password: 'unused',
      role: 'interviewer',
    },
  });
  const interview = await prisma.interview.create({
    data: {
      title: 'Review test',
      interviewerId: user.id,
      candidateName: 'Candidate',
      candidateEmail: 'candidate@test.invalid',
      roomToken: `review-${Date.now()}`,
    },
  });
  const job = await prisma.aIJob.create({
    data: {
      authorId: user.id,
      interviewId: interview.id,
      kind: 'note-writer',
      status: 'completed',
      input: {},
      output: {
        technicalNotes: [
          {
            content: 'Explained closures',
            evidence: [{ sourceId: 'answer:1', quote: 'closures' }],
          },
        ],
        codingNotes: [],
        problemSolvingNotes: [],
        communicationNotes: [],
        keyObservations: [],
        timeline: [],
      },
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'interviewer',
    } as AuthUser;
    next();
  });
  app.use('/jobs', jobs);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as { port: number };
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`http://127.0.0.1:${address.port}/jobs/${job.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: `${job.id}-technicalNotes-0`,
          decision: 'accept',
          content: 'Edited human notes about closures',
        }),
      });
      assert.equal(response.status, 200);
    }
    const notes = await prisma.interviewNote.findMany({
      where: { interviewId: interview.id },
    });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].isPrivate, true);
    assert.equal(notes[0].content, 'Edited human notes about closures');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.aIJob.delete({ where: { id: job.id } });
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await closeQueue();
  }
});
