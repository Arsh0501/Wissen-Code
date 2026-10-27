import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { ZodError } from 'zod';
import prisma from '../database/prisma';
import interviews, { handleJoinRoom } from '../routes/interviews';
import aiJobs from '../routes/ai-jobs';
import { buildInterviewFeedbackReport } from '../services/interviews/interview-feedback-report';
import { REQUIRED_FEEDBACK_CRITERIA } from '../services/interviews/interview-feedback';

test('manual and AI follow-ups are scoped, private, idempotent and included only when asked in reports', async () => {
  const marker = randomUUID();
  const owner = await prisma.user.create({
    data: {
      name: 'Follow-up fixture',
      email: `${marker}@test.invalid`,
      role: 'interviewer',
      password: 'unused',
    },
  });
  const other = await prisma.user.create({
    data: {
      name: 'Other',
      email: `${marker}-other@test.invalid`,
      role: 'interviewer',
      password: 'unused',
    },
  });
  const question = await prisma.question.create({
    data: {
      title: 'Concurrency',
      statement: 'Explain safe updates.',
      difficulty: 'medium',
      questionType: 'written',
    },
  });
  const alternate = await prisma.question.create({
    data: {
      title: 'Caching',
      statement: 'Explain invalidation.',
      difficulty: 'medium',
      questionType: 'written',
    },
  });
  const interview = await prisma.interview.create({
    data: {
      title: 'Follow-up fixture',
      interviewerId: owner.id,
      candidateName: 'Candidate',
      candidateEmail: 'fixture@test.invalid',
      roomToken: marker,
      status: 'in_progress',
      startedAt: new Date(),
      currentQuestionId: question.id,
      questions: { create: [{ questionId: question.id }, { questionId: alternate.id }] },
    },
  });
  const job = await prisma.aIJob.create({
    data: {
      authorId: owner.id,
      interviewId: interview.id,
      kind: 'interview-assistant',
      status: 'completed',
      input: {},
      output: {
        _question: { id: question.id },
        followUps: [
          { question: 'AI follow-up marked asked', context: 'Probe locks', evidence: [] },
          { question: 'UNASKED_AI_SECRET', context: '', evidence: [] },
        ],
        observations: [],
        areasToProbe: [],
      },
    },
  });
  const app = express();
  app.use(express.json());
  app.get('/room/:roomToken', handleJoinRoom);
  app.use((req, _res, next) => {
    req.user = {
      id: req.header('other') ? other.id : owner.id,
      name: owner.name,
      email: owner.email,
      role: req.header('admin') ? 'admin' : 'interviewer',
    };
    next();
  });
  app.use('/interviews', interviews);
  app.use('/ai/jobs', aiJobs);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res
      .status(error instanceof ZodError ? 400 : error.status || 500)
      .json({ error: error.message }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  const root = `/interviews/${interview.id}/questions/${question.id}/follow-ups`;
  async function call(
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as any };
  }
  try {
    const input = {
      requestId: randomUUID(),
      question: 'Manual follow-up marked asked',
      askNow: false,
    };
    assert.equal((await call(root, 'POST', input, { other: 'yes' })).status, 403);
    assert.equal((await call(root, 'POST', input, { admin: 'yes' })).status, 403);
    assert.equal((await call(root, 'POST', { ...input, question: '' })).status, 400);
    const saved = await call(root, 'POST', input);
    assert.equal(saved.status, 201);
    assert.equal(saved.body.status, 'pending');
    assert.equal((await call(root, 'POST', input)).status, 200);
    assert.equal(await prisma.interviewFollowUp.count({ where: { interviewId: interview.id } }), 1);
    const asked = await call(`${root}/${input.requestId}`, 'PUT', { status: 'asked' });
    assert.equal(asked.status, 200);
    assert.equal(asked.body.status, 'asked');
    assert.ok(asked.body.askedAt);
    assert.equal((await call(`${root}/current`)).body.question, input.question);
    assert.equal(
      (await call(`${root}/${input.requestId}`, 'PUT', { status: 'dismissed' })).status,
      409,
    );
    await call(root, 'POST', { requestId: randomUUID(), question: 'PENDING_MANUAL_SECRET' });
    const dismissed = await call(root, 'POST', {
      requestId: randomUUID(),
      question: 'DISMISSED_MANUAL_SECRET',
    });
    assert.equal(
      (await call(`${root}/${dismissed.body.id}`, 'PUT', { status: 'dismissed' })).status,
      200,
    );
    const mismatch = root.replace(`/questions/${question.id}/`, `/questions/${alternate.id}/`);
    assert.equal(
      (await call(mismatch, 'POST', { requestId: randomUUID(), question: 'Wrong question' }))
        .status,
      409,
    );
    const reviewPath = `/ai/jobs/${job.id}/review`;
    await prisma.interview.update({
      where: { id: interview.id },
      data: { currentQuestionId: alternate.id },
    });
    assert.equal(
      (await call(reviewPath, 'POST', { itemId: `${job.id}-0`, decision: 'ask' })).status,
      409,
    );
    await prisma.interview.update({
      where: { id: interview.id },
      data: { currentQuestionId: question.id },
    });
    assert.equal(
      (await call(reviewPath, 'POST', { itemId: `${job.id}-0`, decision: 'ask' })).status,
      200,
    );
    const aiCurrent = (await call(`${root}/current`)).body;
    assert.equal(aiCurrent.id, `${job.id}-0`);
    assert.equal(aiCurrent.parentId, input.requestId);
    assert.equal(
      (
        await call(root, 'POST', {
          requestId: randomUUID(),
          question: 'Manual ask now',
          askNow: true,
        })
      ).body.status,
      'asked',
    );
    assert.equal((await call(`${root}/current`)).body.parentId, aiCurrent.id);
    assert.equal((await call(`${root}/current`, 'DELETE')).status, 200);
    assert.equal((await call(`${root}/current`)).body, null);
    const room = await call(`/room/${marker}`);
    assert.ok(!JSON.stringify(room.body).includes('Manual follow-up marked asked'));

    await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'completed',
        endedAt: new Date(),
        finalFeedback: 'Final summary',
        feedbackRevision: 1,
        feedbackCriteria: Object.entries(REQUIRED_FEEDBACK_CRITERIA).map(([key, label]) => ({
          key,
          label,
          rating: 4,
          feedback: '',
        })),
      },
    });
    assert.equal(
      (await call(root, 'POST', { requestId: randomUUID(), question: 'Too late' })).status,
      409,
    );
    assert.equal(
      (await call(reviewPath, 'POST', { itemId: `${job.id}-1`, decision: 'ask' })).status,
      409,
    );
    const report = await buildInterviewFeedbackReport(interview.id, 1);
    const allAsked = report.questions
      .flatMap((q) => q.followUps)
      .map((followUp) => followUp.question);
    assert.deepEqual(
      allAsked.sort(),
      ['AI follow-up marked asked', 'Manual follow-up marked asked', 'Manual ask now'].sort(),
    );
    assert.ok(!JSON.stringify(report).includes('PENDING_MANUAL_SECRET'));
    assert.ok(!JSON.stringify(report).includes('DISMISSED_MANUAL_SECRET'));
    assert.ok(!JSON.stringify(report).includes('UNASKED_AI_SECRET'));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.aIJob.deleteMany({ where: { interviewId: interview.id } });
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.question.deleteMany({ where: { id: { in: [question.id, alternate.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});
