import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import prisma from '../database/prisma';
import assessments from '../routes/assessments';
import attempts, { finalizeSession } from '../routes/attempts';
import { computeEvaluation } from '../services/assessments/grading';

test('unlimited audited restarts isolate identities, invalidate old writes/jobs, and require explicit closed-test permission', async () => {
  const stamp = randomUUID();
  const users = await Promise.all(
    ['admin', 'candidate', 'candidate'].map((role, i) =>
      prisma.user.create({
        data: {
          name: `restart-${stamp}-${i}`,
          email: `restart-${stamp}-${i}@test.invalid`,
          password: 'unchanged',
          role,
        },
      }),
    ),
  );
  const [admin, candidate, other] = users;
  const exams = await Promise.all(
    [1, 2].map(() =>
      prisma.assessment.create({ data: { name: stamp, status: 'published', maxAttempts: 1 } }),
    ),
  );
  const exam = exams[0];
  const question = await prisma.question.create({
    data: {
      title: stamp,
      statement: 'Pick A',
      difficulty: 'easy',
      questionType: 'mcq',
      settings: {
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        correctOptionIds: ['a'],
      },
    },
  });
  await prisma.assessmentQuestion.create({
    data: { assessmentId: exam.id, questionId: question.id, orderIndex: 0, marks: 1 },
  });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const user = users.find((u) => u.id === Number(req.headers['x-user']));
    if (!user) return res.sendStatus(401);
    req.user = {
      ...user,
      guest: user.isGuest,
      ...(user.isGuest ? { guestAssessmentId: exam.id } : {}),
    } as any;
    next();
  });
  app.use('/assessments', assessments);
  app.use('/attempts', attempts);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  async function request(
    path: string,
    body?: unknown,
    user = candidate,
    method = body === undefined ? 'GET' : 'POST',
  ) {
    const res = await fetch(root + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-user': String(user.id) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  const restart = (reason: string, allowClosed = false, user = admin) =>
    request(
      `/assessments/${exam.id}/candidates/${candidate.id}/restart`,
      { reason, allowClosed },
      user,
    );
  try {
    const original = (await request(`/assessments/${exam.id}/start`, {})).body;
    const otherAttempt = (await request(`/assessments/${exam.id}/start`, {}, other)).body;
    const anotherExam = (await request(`/assessments/${exams[1].id}/start`, {})).body;
    await prisma.draftAnswer.create({
      data: {
        sessionId: original.sessionId,
        questionId: question.id,
        languageId: 0,
        languageName: 'MCQ',
        code: '["a"]',
      },
    });
    await finalizeSession(original.sessionId);
    const oldSubmissions = await prisma.submission.findMany({
      where: { sessionId: original.sessionId },
    });
    assert.equal(oldSubmissions.length, 1);
    assert.equal((await restart('not admin', false, candidate)).status, 403);
    assert.equal((await restart(' ')).status, 400);
    assert.equal((await restart('Computer crashed')).status, 200);
    assert.equal(await computeEvaluation(exam.id, candidate.name, candidate.id), null);
    assert.equal((await request(`/attempts/${original.sessionId}/submit`, {})).status, 409);
    assert.equal(
      (await request(`/attempts/${original.sessionId}/save-all-drafts`, { drafts: [] })).status,
      409,
    );
    assert.equal((await request(`/attempts/${original.sessionId}`)).status, 409);
    assert.equal((await request(`/attempts/status/${exam.id}`)).body.exists, false);
    const concurrent = await Promise.all([
      request(`/assessments/${exam.id}/start`, {}),
      request(`/assessments/${exam.id}/start`, {}),
    ]);
    assert.equal(concurrent[0].status, 200);
    assert.equal(concurrent[0].body.sessionId, concurrent[1].body.sessionId);
    let current = concurrent[0].body;
    assert.notEqual(current.sessionId, original.sessionId);
    assert.equal(current.drafts.length, 0);
    assert.equal(current.tabSwitchCount, 0);
    assert.equal((await finalizeSession(original.sessionId)).status, 'already-finished');
    assert.equal(
      (await prisma.assessmentSession.findUniqueOrThrow({ where: { id: current.sessionId } }))
        .gradingStatus,
      'pending',
    );
    assert.deepEqual(
      await prisma.submission.findMany({ where: { sessionId: original.sessionId } }),
      oldSubmissions,
    );
    // Repeated resets never need a higher assessment-wide attempt limit.
    for (let i = 0; i < 3; i++) {
      assert.equal((await restart(`Reset ${i}`)).status, 200);
      const next = await request(`/assessments/${exam.id}/start`, {});
      assert.equal(next.status, 200);
      assert.notEqual(next.body.sessionId, current.sessionId);
      current = next.body;
    }
    await finalizeSession(current.sessionId);
    assert.equal((await request(`/assessments/${exam.id}/start`, { retake: true })).status, 403);
    await prisma.assessment.update({
      where: { id: exam.id },
      data: { endAt: new Date(Date.now() - 60000) },
    });
    assert.equal((await restart('Closed test')).status, 409);
    assert.equal((await restart('Explicit closed test restart', true)).status, 200);
    assert.equal((await request(`/assessments/${exam.id}`)).status, 200);
    assert.equal(
      (await request('/assessments')).body.find((a: any) => a.id === exam.id).availability,
      'open',
    );
    assert.equal((await request(`/assessments/${exam.id}/start`, {})).status, 200);
    assert.equal(
      (await prisma.assessment.findUniqueOrThrow({ where: { id: exam.id } })).maxAttempts,
      1,
    );
    assert.equal(
      (await prisma.assessmentSession.findUniqueOrThrow({ where: { id: otherAttempt.sessionId } }))
        .invalidatedAt,
      null,
    );
    assert.equal(
      (await prisma.assessmentSession.findUniqueOrThrow({ where: { id: anotherExam.sessionId } }))
        .invalidatedAt,
      null,
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: candidate.id } })).password,
      'unchanged',
    );
    const history = (await request(`/assessments/${exam.id}/restarts`, undefined, admin)).body;
    assert.equal(history.length, 5);
    assert.equal(history[0].adminId, admin.id);
    assert.equal(history[0].reason, 'Explicit closed test restart');
    const results = (await request(`/assessments/${exam.id}/candidates`, undefined, admin)).body;
    assert.equal(
      results.candidates.find((c: any) => c.candidateUserId === candidate.id).marksObtained,
      0,
    );
    // Superseding a pending grant still leaves exactly one usable replacement.
    assert.equal((await restart('Pending one', true)).status, 200);
    assert.equal((await restart('Pending two', true)).status, 200);
    assert.equal(
      await prisma.assessmentRestart.count({
        where: {
          assessmentId: exam.id,
          candidateUserId: candidate.id,
          revokedAt: null,
          consumedAt: null,
        },
      }),
      1,
    );
    // An admin restart restores this assessment for an existing guest even after link expiry.
    candidate.isGuest = true;
    await prisma.inviteLink.create({
      data: {
        assessmentId: exam.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() - 60000),
        recipientEmail: candidate.email,
        redemptions: { create: { userId: candidate.id } },
      },
    });
    assert.equal((await request(`/assessments/${exam.id}`)).status, 200);
    assert.equal((await request(`/assessments/${exam.id}/start`, {})).status, 200);
    assert.equal((await request(`/assessments/${exams[1].id}`)).status, 403);
    await restart('Invalidate again before unpublishing', true);
    await prisma.assessment.update({ where: { id: exam.id }, data: { status: 'draft' } });
    assert.equal((await restart('Draft', true)).status, 409);
    assert.equal((await request(`/assessments/${exam.id}/start`, {})).status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.assessment.deleteMany({ where: { id: { in: exams.map((e) => e.id) } } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.$disconnect();
  }
});
