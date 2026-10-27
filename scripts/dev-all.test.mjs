import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import test from 'node:test';
import { endpoint, tcpAvailable, transcriptionAlreadyRunning } from './dev-all.mjs';

test('startup checks detect available and stopped dependency ports', async () => {
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    assert.equal(await tcpAvailable('127.0.0.1', port), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(await tcpAvailable('127.0.0.1', port), false);
});

test('configuration checks support IPv6 and never include credentials in errors', () => {
  assert.deepEqual(endpoint('redis://[::1]:6380', 'REDIS_URL', 6379), {
    host: '::1',
    port: 6380,
  });
  assert.deepEqual(endpoint('postgresql://user:secret@localhost/database', 'DATABASE_URL', 5432), {
    host: 'localhost',
    port: 5432,
  });
  assert.throws(() => endpoint('secret-is-not-a-url', 'DATABASE_URL', 5432), {
    message: 'Set a valid DATABASE_URL in server/.env.',
  });
});

test('reuses only a transcription service with a healthy response', async () => {
  let healthy = true;
  const server = http.createServer((_request, response) => {
    response.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ready: healthy }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    assert.equal(await transcriptionAlreadyRunning(port), true);
    healthy = false;
    await assert.rejects(transcriptionAlreadyRunning(port), /transcription is not healthy/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(await transcriptionAlreadyRunning(port), false);
});
