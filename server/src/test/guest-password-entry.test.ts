import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import prisma from '../database/prisma';
import auth from '../routes/auth';
import assessments from '../routes/assessments';
import { publicInviteRoutes } from '../routes/invites';
import { authenticate, verifyAccessToken } from '../middleware/auth';

test('first invite creates reusable credentials; blocked logins preserve the active session and attempt', async () => {
  const stamp = randomUUID();
  const email = `password-guest-${stamp}@test.invalid`;
  const password = 'Candidate@123';
  const exams = await Promise.all(
    [1, 2].map(() =>
      prisma.assessment.create({ data: { name: stamp, status: 'published', maxAttempts: 1 } }),
    ),
  );
  const links = await Promise.all(
    exams.map((exam) =>
      prisma.inviteLink.create({
        data: { assessmentId: exam.id, token: randomUUID(), recipientEmail: email, maxUses: 1 },
      }),
    ),
  );
  const app = express();
  app.use(express.json());
  app.use('/auth', auth);
  app.use('/invite', publicInviteRoutes);
  app.use('/assessments', authenticate, assessments);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = async (path: string, body: unknown, token?: string) => {
    const response = await fetch(root + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  try {
    assert.equal(
      (await post(`/invite/${links[0].token}/join`, { name: stamp, email })).status,
      400,
    );
    assert.equal(await prisma.user.count({ where: { email } }), 0);
    const joined = await post(`/invite/${links[0].token}/join`, {
      name: stamp,
      email: email.toUpperCase(),
      password,
    });
    assert.equal(joined.status, 200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.isGuest, false);
    assert.equal(await bcrypt.compare(password, user.password), true);
    const started = await post(`/assessments/${exams[0].id}/start`, {}, joined.body.token);
    assert.equal(started.status, 200);
    const sessionsBefore = await prisma.userSession.findMany({ where: { userId: user.id } });
    const attemptBefore = await prisma.assessmentSession.findFirstOrThrow({
      where: { candidateUserId: user.id },
    });
    const blocked = await Promise.all([
      post('/auth/login', { email, password }),
      post('/auth/login', { email, password }),
    ]);
    assert.deepEqual(
      blocked.map((result) => result.status),
      [403, 403],
    );
    assert.deepEqual(
      await prisma.userSession.findMany({ where: { userId: user.id } }),
      sessionsBefore,
    );
    assert.deepEqual(
      await prisma.assessmentSession.findUnique({ where: { id: attemptBefore.id } }),
      attemptBefore,
    );
    assert.equal((await verifyAccessToken(joined.body.token)).id, user.id);
    assert.equal(
      (
        await post(`/invite/${links[1].token}/join`, {
          name: stamp,
          email,
          password: 'Different@123',
        })
      ).status,
      409,
    );
    assert.equal(
      await bcrypt.compare(
        password,
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password,
      ),
      true,
    );
    await post('/auth/logout', {}, joined.body.token);
    const logins = await Promise.all([
      post('/auth/login', { email, password }),
      post('/auth/login', { email, password }),
    ]);
    assert.deepEqual(logins.map((result) => result.status).sort(), [200, 403]);
    const login = logins.find((result) => result.status === 200)!;
    const resumed = await post(`/assessments/${exams[0].id}/start`, {}, login.body.token);
    assert.equal(resumed.body.sessionId, started.body.sessionId);
    assert.equal(resumed.body.startedAt, started.body.startedAt);
    await prisma.assessmentSession.update({
      where: { id: attemptBefore.id },
      data: { finishedAt: new Date() },
    });
    assert.equal(
      (await post(`/assessments/${exams[0].id}/start`, { retake: true }, login.body.token)).status,
      403,
    );
    assert.equal(
      (await post(`/invite/${links[1].token}/join`, { name: stamp, email }, login.body.token))
        .status,
      200,
    );
    assert.equal(
      (await post(`/assessments/${exams[1].id}/start`, {}, login.body.token)).status,
      200,
    );
    assert.equal(await prisma.userSession.count({ where: { userId: user.id } }), 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.assessment.deleteMany({ where: { id: { in: exams.map((exam) => exam.id) } } });
    await prisma.user.deleteMany({ where: { email } });
  }
});
