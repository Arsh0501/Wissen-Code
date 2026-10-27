import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma';
import authRoutes, { createSessionForUser } from '../routes/auth';
import { verifyAccessToken } from '../middleware/auth';

test('interviewer refresh, profile fetch and profile edits retain the interviewer role', async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Interviewer role fixture',
      email: `role-${randomUUID()}@test.invalid`,
      password: 'unused',
      role: 'interviewer',
    },
  });
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/auth`;
  try {
    const session = await createSessionForUser(user.id, user.email, user.name, user.role);
    const refreshed = await fetch(base + '/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    assert.equal(refreshed.status, 200);
    const refresh: any = await refreshed.json();
    assert.equal(refresh.user.role, 'interviewer');
    assert.equal((await verifyAccessToken(refresh.accessToken)).role, 'interviewer');
    const headers = {
      Authorization: `Bearer ${refresh.accessToken}`,
      'Content-Type': 'application/json',
    };
    const me = await fetch(base + '/me', { headers });
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as any).user.role, 'interviewer');
    const updated = await fetch(base + '/profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: 'Updated role fixture ' + randomUUID() }),
    });
    assert.equal(updated.status, 200);
    const profile: any = await updated.json();
    assert.equal(profile.user.role, 'interviewer');
    assert.equal((await verifyAccessToken(profile.accessToken)).role, 'interviewer');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
