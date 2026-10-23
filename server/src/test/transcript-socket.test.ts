import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { io as client, Socket } from 'socket.io-client';
import prisma from '../prisma';
import { initSocketServer } from '../socket';
import { createSessionForUser } from '../routes/auth';

const request = (socket: Socket, name: string, payload: unknown = {}) => new Promise<any>((resolve, reject) => {
  socket.timeout(5000).emit(name, payload, (error: Error | null, result: unknown) => error ? reject(error) : resolve(result));
});

test('live socket transports PCM to worker and keeps saved transcripts private', async () => {
  const old = { url: process.env.TRANSCRIPTION_URL, token: process.env.TRANSCRIPTION_TOKEN, redis: process.env.REDIS_URL };
  const worker = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer socket-test-token');
    let length = 0;
    req.on('data', (chunk: Buffer) => { length += chunk.length; });
    req.on('end', () => { assert.equal(length, 96000); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ text: 'We used Redis for caching.' })); });
  });
  await new Promise<void>(resolve => worker.listen(0, '127.0.0.1', resolve));
  process.env.TRANSCRIPTION_URL = `http://127.0.0.1:${(worker.address() as { port: number }).port}`;
  process.env.TRANSCRIPTION_TOKEN = 'socket-test-token';
  delete process.env.REDIS_URL;
  const server = http.createServer();
  const io = initSocketServer(server);
  let owner: Socket | undefined;
  let candidate: Socket | undefined;
  let userId: number | undefined;
  let interviewId: number | undefined;
  try {
    const user = await prisma.user.create({ data: { name: 'Transcript test', email: `transcript-${randomUUID()}@test.invalid`, password: 'unused', role: 'interviewer' } });
    userId = user.id;
    const interview = await prisma.interview.create({ data: { title: 'Transcript transport test', interviewerId: user.id, roomToken: randomUUID(), candidateName: 'Transcript candidate', candidateEmail: 'candidate@test.invalid', status: 'in_progress', startedAt: new Date() } });
    interviewId = interview.id;
    const auth = await createSessionForUser(user.id, user.email, user.name, user.role);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const connect = async (credentials: unknown) => {
      const socket = client(url, { auth: credentials as any, autoConnect: false, reconnection: false });
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
      return socket;
    };
    owner = await connect({ token: auth.token });
    candidate = await connect({ roomToken: interview.roomToken });
    await request(owner, 'JOIN_INTERVIEW', { interviewId: interview.id });
    await request(candidate, 'JOIN_INTERVIEW', { roomToken: interview.roomToken });
    let candidateReceivedText = false;
    candidate.on('TRANSCRIPT_SEGMENT', () => { candidateReceivedText = true; });
    const notice = new Promise<any>(resolve => candidate!.once('TRANSCRIPT_CAPTURE_STATUS', resolve));
    const started = await request(owner, 'TRANSCRIPT_START', { consentConfirmed: true });
    assert.equal(started.success, true);
    assert.equal((await notice).active, true);
    const chunk = await request(owner, 'TRANSCRIPT_CHUNK', { sessionId: started.sessionId, sequence: 0, startedAt: new Date().toISOString(), audio: Buffer.alloc(96000) });
    assert.equal(chunk.success, true, JSON.stringify(chunk));
    assert.equal(chunk.segment.text, 'We used Redis for caching.');
    assert.equal((await request(owner, 'TRANSCRIPT_HISTORY')).segments.length, 1);
    assert.equal((await request(candidate, 'TRANSCRIPT_HISTORY')).success, false);
    assert.equal(candidateReceivedText, false);
    await request(owner, 'TRANSCRIPT_STOP');
  } finally {
    owner?.disconnect(); candidate?.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
    await new Promise<void>(resolve => worker.close(() => resolve()));
    if (interviewId) await prisma.interview.delete({ where: { id: interviewId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (old.url === undefined) delete process.env.TRANSCRIPTION_URL; else process.env.TRANSCRIPTION_URL = old.url;
    if (old.token === undefined) delete process.env.TRANSCRIPTION_TOKEN; else process.env.TRANSCRIPTION_TOKEN = old.token;
    if (old.redis === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = old.redis;
    await prisma.$disconnect();
  }
});
