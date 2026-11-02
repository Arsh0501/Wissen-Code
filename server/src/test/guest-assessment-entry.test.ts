import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import prisma from '../database/prisma';
import { publicInviteRoutes } from '../routes/invites';
import attempts from '../routes/attempts';
import submissions from '../routes/submissions';
import { authenticate, verifyAccessToken } from '../middleware/auth';
import { canAccessAssessment } from '../services/assessments/guest-access';

test('returning guests enter a different assessment once, without accessing previous tests', async () => {
  const marker = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `guest-${marker}@test.invalid`,
      name: marker,
      password: 'unused',
      isGuest: true,
    },
  });
  const assessments = await Promise.all(
    [0, 1, 2].map(() =>
      prisma.assessment.create({
        data: { name: marker, status: 'published', maxAttempts: 1 },
      }),
    ),
  );
  const links = await Promise.all(
    [0, 1, 1, 2].map((index) =>
      prisma.inviteLink.create({
        data: {
          assessmentId: assessments[index].id,
          token: randomUUID(),
          recipientEmail: user.email,
        },
      }),
    ),
  );
  const app = express();
  app.use(express.json());
  app.use('/invite', publicInviteRoutes);
  app.use('/attempts', authenticate, attempts);
  app.use('/submissions', authenticate, submissions);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}/invite`;
  async function join(index: number, token?: string) {
    const response = await fetch(`${root}/${links[index].token}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: marker, email: user.email.toUpperCase() }),
    });
    return { status: response.status, body: (await response.json()) as any };
  }
  try {
    // Existing production-style guest with historical redemption and a completed attempt.
    await prisma.inviteRedemption.create({ data: { inviteId: links[0].id, userId: user.id } });
    await prisma.assessmentSession.create({
      data: {
        assessmentId: assessments[0].id,
        candidateUserId: user.id,
        candidateName: user.name,
        finishedAt: new Date(),
      },
    });
    assert.equal((await join(0)).status, 409);
    const results = await Promise.all([join(1), join(2)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const accepted = results.find((r) => r.status === 200)!;
    assert.equal(accepted.body.user.id, user.id);
    assert.equal(await prisma.user.count({ where: { email: user.email } }), 1);
    assert.equal(
      await prisma.guestAssessmentParticipation.count({
        where: { userId: user.id, assessmentId: assessments[1].id },
      }),
      1,
    );
    const identity = await verifyAccessToken(accepted.body.token);
    assert.equal(identity.guestAssessmentId, assessments[1].id);
    assert.equal(await canAccessAssessment({ user: identity } as any, assessments[0].id), false);
    assert.equal(await canAccessAssessment({ user: identity } as any, assessments[1].id), true);
    const oldAttempt = await prisma.assessmentSession.findFirstOrThrow({
      where: { candidateUserId: user.id, assessmentId: assessments[0].id },
    });
    const origin = root.replace('/invite', '');
    const headers = { Authorization: `Bearer ${accepted.body.token}` };
    assert.equal((await fetch(`${origin}/attempts/${oldAttempt.id}`, { headers })).status, 403);
    assert.equal(
      (await fetch(`${origin}/attempts/${oldAttempt.id}/submit`, { method: 'POST', headers }))
        .status,
      403,
    );
    assert.equal(
      (await fetch(`${origin}/submissions/${assessments[0].id}/${user.name}`, { headers })).status,
      403,
    );
    const acceptedIndex = results[0].status === 200 ? 1 : 2;
    assert.equal((await join(acceptedIndex, accepted.body.token)).status, 200);
    await prisma.userSession.deleteMany({ where: { userId: user.id } });
    assert.equal((await join(acceptedIndex)).status, 409);
    assert.equal((await join(3)).status, 200);
    assert.equal(
      await prisma.assessmentSession.count({
        where: {
          candidateUserId: user.id,
          assessmentId: assessments[0].id,
          finishedAt: { not: null },
        },
      }),
      1,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.assessment.deleteMany({ where: { id: { in: assessments.map((a) => a.id) } } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
