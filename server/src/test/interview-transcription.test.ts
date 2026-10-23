import 'dotenv/config';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { registerTranscription, transcriptionDependencies } from '../platform/transcription';

test('transcription isolates access, orders audio, saves question evidence and discards late results', async () => {
  const previous = { url: process.env.TRANSCRIPTION_URL, token: process.env.TRANSCRIPTION_TOKEN };
  process.env.TRANSCRIPTION_URL = 'http://127.0.0.1:8765'; process.env.TRANSCRIPTION_TOKEN = 'test-token';
  const handlers: Record<string, Function> = {};
  const notifications: unknown[] = [];
  const socket: any = { connected: true, data: { user: { role: 'interviewer', userId: 7, interviewId: 11 } },
    on: (event: string, handler: Function) => { handlers[event] = handler; },
    to: () => ({ emit: (...args: unknown[]) => notifications.push(args) }),
  };
  const call = (event: string, payload = {}): Promise<any> => new Promise(resolve => { void handlers[event](payload, resolve); });
  const interview = { id: 11, interviewerId: 7, status: 'in_progress', currentQuestionId: 13 };
  mock.method(transcriptionDependencies, 'interview', async () => interview);
  const saved: any[] = [];
  mock.method(transcriptionDependencies, 'save', async (data: any) => { saved.push(data); return data; });
  mock.method(transcriptionDependencies, 'history', async () => saved);
  const post = mock.method(axios, 'post', async () => ({ data: { text: 'We used Redis.' } }));
  try {
    registerTranscription(socket);
    socket.data.user.role = 'candidate';
    assert.equal((await call('TRANSCRIPT_HISTORY')).success, false);
    assert.equal((await call('TRANSCRIPT_START', { consentConfirmed: true })).success, false);
    assert.equal((await call('TRANSCRIPT_STOP')).success, false);
    socket.data.user.role = 'interviewer';
    assert.equal((await call('TRANSCRIPT_START')).success, false);
    const session = await call('TRANSCRIPT_START', { consentConfirmed: true });
    assert.equal(session.success, true);
    const chunk = { sessionId: session.sessionId, sequence: 0, startedAt: new Date().toISOString(), audio: Buffer.alloc(96000) };
    assert.equal((await call('TRANSCRIPT_CHUNK', { ...chunk, sequence: 1 })).success, false);
    assert.equal((await call('TRANSCRIPT_CHUNK', { ...chunk, audio: Buffer.alloc(150000) })).success, false);
    assert.equal((await call('TRANSCRIPT_CHUNK', { ...chunk, sessionId: randomUUID() })).success, false);
    assert.equal((await call('TRANSCRIPT_CHUNK', chunk)).segment.text, 'We used Redis.');
    assert.equal(saved[0].questionId, 13);
    assert.equal(saved[0].endedAt.getTime() - saved[0].startedAt.getTime(), 3000);
    assert.equal((await call('TRANSCRIPT_CHUNK', chunk)).success, false);
    assert.equal((await call('TRANSCRIPT_HISTORY')).segments.length, 1);
    let finish!: (value: any) => void;
    post.mock.mockImplementation(() => new Promise<any>(resolve => { finish = resolve; }));
    const pending = call('TRANSCRIPT_CHUNK', { ...chunk, sequence: 1 });
    await new Promise(resolve => setImmediate(resolve));
    await call('TRANSCRIPT_STOP');
    finish({ data: { text: 'Late text must not be saved.' } });
    assert.equal((await pending).success, false);
    assert.equal(saved.length, 1);
    assert.ok(notifications.length >= 2);
    interview.status = 'completed';
    assert.equal((await call('TRANSCRIPT_START', { consentConfirmed: true })).success, false);
  } finally {
    mock.restoreAll();
    if (previous.url === undefined) delete process.env.TRANSCRIPTION_URL; else process.env.TRANSCRIPTION_URL = previous.url;
    if (previous.token === undefined) delete process.env.TRANSCRIPTION_TOKEN; else process.env.TRANSCRIPTION_TOKEN = previous.token;
  }
});
