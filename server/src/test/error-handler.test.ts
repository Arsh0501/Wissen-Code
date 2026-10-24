import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler';

test('API errors distinguish invalid input, conflicts, missing data and unavailable storage without exposing details', async () => {
  const app = express();
  app.use(express.json({ limit: 20 }));
  app.post('/body', (_req, res) => res.json({ ok: true }));
  app.get('/:code', (req, _res, next) => next(Object.assign(new Error('private database credentials'), { code: req.params.code })));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const [code, expected] of [['P2002', 409], ['P2025', 404], ['P1001', 503], ['P2021', 503], ['unexpected', 500]] as const) {
      const response = await fetch(`${base}/${code}`);
      assert.equal(response.status, expected);
      assert.ok(!(await response.text()).includes('private database credentials'));
    }
    const invalid = await fetch(`${base}/body`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
    assert.equal(invalid.status, 400);
    const oversized = await fetch(`${base}/body`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(30) }) });
    assert.equal(oversized.status, 413);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
