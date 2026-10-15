import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { io as client, Socket } from 'socket.io-client';
import prisma from '../prisma';
import { initSocketServer } from '../socket';
import { createSessionForUser } from '../routes/auth';
import { authenticate } from '../middleware/auth';
import interviewRoutes from '../routes/interviews';
function event(socket: Socket, name: string) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${name}`)), 3000);
    socket.once(name, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
test('interview rooms enforce assignment, isolate private notes, and revoke active socket access', async () => {
  // This test exercises the authoritative database/socket checks; Redis transport is covered separately.
  const redisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  const admin = await prisma.user.create({
    data: {
      name: 'Realtime owner',
      email: `owner-${Date.now()}@test.invalid`,
      password: 'unused',
      role: 'admin',
    },
  });
  const other = await prisma.user.create({
    data: {
      name: 'Other interviewer',
      email: `other-${Date.now()}@test.invalid`,
      password: 'unused',
      role: 'admin',
    },
  });
  const room = await prisma.interview.create({
    data: {
      title: 'Security test',
      interviewerId: admin.id,
      candidateName: 'Guest candidate',
      candidateEmail: 'guest@test.invalid',
      roomToken: `test-room-${Date.now()}`,
      status: 'in_progress',
      startedAt: new Date(),
    },
  });
  const ownerAuth = await createSessionForUser(
    admin.id,
    admin.email,
    admin.name,
    admin.role,
  );
  const otherAuth = await createSessionForUser(
    other.id,
    other.email,
    other.name,
    other.role,
  );
  if (!ownerAuth.token || !otherAuth.token) throw new Error('Missing session');
  const app = express();
  app.use(express.json());
  app.use('/interviews', authenticate, interviewRoutes);
  const server = http.createServer(app);
  const io = initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const owner = client(url, {
    auth: { token: ownerAuth.token },
    autoConnect: false,
  });
  const candidate = client(url, {
    auth: { roomToken: room.roomToken },
    autoConnect: false,
  });
  const stranger = client(url, {
    auth: { token: otherAuth.token, interviewId: room.id },
    autoConnect: false,
  });
  try {
    const connections = [
      event(owner, 'connect'),
      event(candidate, 'connect'),
      event(stranger, 'connect'),
    ];
    owner.connect();
    candidate.connect();
    stranger.connect();
    await Promise.all(connections);
    const ownerSync = event(owner, 'SYNC_STATE');
    owner.emit('JOIN_INTERVIEW', { interviewId: room.id });
    await ownerSync;
    const guestSync = event(candidate, 'SYNC_STATE');
    candidate.emit('JOIN_INTERVIEW', { roomToken: room.roomToken });
    await guestSync;
    const denied = event(stranger, 'ERROR');
    stranger.emit('JOIN_INTERVIEW', { interviewId: room.id });
    assert.match((await denied).message, /assigned/);
    const updateCode = (payload: unknown) =>
      new Promise<any>((resolve) =>
        owner.emit('UPDATE_CODE', payload, resolve),
      );
    const current = await prisma.interview.findUniqueOrThrow({
      where: { id: room.id },
    });
    const edit = await updateCode({
      code: 'print("shared editor")',
      languageId: 71,
      baseRevision: current.codeRevision,
    });
    assert.equal(edit.success, true);
    const conflict = await updateCode({
      code: 'stale draft must not replace code',
      languageId: 71,
      baseRevision: current.codeRevision,
    });
    assert.equal(conflict.success, false);
    assert.equal(conflict.state.currentCode, 'print("shared editor")');
    assert.ok(
      await prisma.interviewEvent.findFirst({
        where: { interviewId: room.id, eventType: 'CODE_CHANGED' },
      }),
    );
    let candidateSawNote = false;
    candidate.on('NOTE_ADDED', () => (candidateSawNote = true));
    const note = event(owner, 'NOTE_ADDED');
    const response = await fetch(`${url}/interviews/${room.id}/notes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerAuth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Private interviewer evidence',
        isPrivate: true,
      }),
    });
    assert.equal(response.status, 201);
    assert.equal((await note).content, 'Private interviewer evidence');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(candidateSawNote, false);
    await prisma.userSession.deleteMany({ where: { userId: admin.id } });
    const disconnected = event(owner, 'disconnect');
    owner.emit('UPDATE_CODE', { code: 'print(1)', languageId: 71 });
    await disconnected;
  } finally {
    owner.disconnect();
    candidate.disconnect();
    stranger.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await prisma.interview.delete({ where: { id: room.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [admin.id, other.id] } },
    });
    if (redisUrl) process.env.REDIS_URL = redisUrl;
  }
});
