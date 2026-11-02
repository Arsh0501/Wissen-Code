import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import prisma from '../database/prisma';
import users from '../routes/users';
import auth, { createSessionForUser } from '../routes/auth';
import { authenticate, verifyAccessToken } from '../middleware/auth';

test('only admins revoke sessions, invalidating access and refresh while preserving attempts', async () => {
  const marker = randomUUID();
  const accounts = await Promise.all(
    ['admin', 'interviewer', 'candidate'].map((role) =>
      prisma.user.create({
        data: {
          email: `${role}-${marker}@test.invalid`,
          name: marker + role,
          role,
          password: 'unused',
        },
      }),
    ),
  );
  const sessions = await Promise.all(
    accounts.map(async (user) => {
      const session = await createSessionForUser(user.id, user.email, user.name, user.role);
      if ('error' in session) throw Error(session.error);
      return session;
    }),
  );
  const assessment = await prisma.assessment.create({ data: { name: marker } });
  const attempt = await prisma.assessmentSession.create({
    data: {
      assessmentId: assessment.id,
      candidateUserId: accounts[2].id,
      candidateName: accounts[2].name,
    },
  });
  const app = express();
  app.use(express.json());
  app.use('/users', authenticate, users);
  app.use('/auth', auth);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  async function revoke(actor: number) {
    return fetch(`${root}/users/${accounts[2].id}/revoke-sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessions[actor].token}` },
    });
  }
  try {
    assert.equal((await revoke(1)).status, 403);
    assert.equal((await revoke(2)).status, 403);
    await verifyAccessToken(sessions[2].token);
    const response = await revoke(0);
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as any).revokedSessions, 1);
    await assert.rejects(() => verifyAccessToken(sessions[2].token));
    const refresh = await fetch(`${root}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: sessions[2].refreshToken }),
    });
    assert.equal(refresh.status, 401);
    await verifyAccessToken(sessions[1].token);
    const preserved = await prisma.assessmentSession.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    assert.equal(preserved.startedAt.getTime(), attempt.startedAt.getTime());
    assert.equal(preserved.finishedAt, null);
    const audit = await prisma.sessionRevocationAudit.findFirstOrThrow({
      where: { targetUserId: accounts[2].id },
    });
    assert.equal(audit.actorUserId, accounts[0].id);
    assert.equal(audit.revokedSessions, 1);
    assert.equal((await revoke(0)).status, 200);
    const replacement = await createSessionForUser(
      accounts[2].id,
      accounts[2].email,
      accounts[2].name,
      'candidate',
    );
    assert.ok(!('error' in replacement));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.sessionRevocationAudit.deleteMany({
      where: { targetUserId: { in: accounts.map((u) => u.id) } },
    });
    await prisma.assessment.delete({ where: { id: assessment.id } });
    await prisma.user.deleteMany({ where: { id: { in: accounts.map((u) => u.id) } } });
  }
});
