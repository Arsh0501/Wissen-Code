import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import platformRoutes from '../routes/system';
import { interviewEventMetadata } from '../services/interviews/interview-event-metadata';

test('event metadata excludes playback snapshots and preserves evidence identifiers', () => {
  const payload = {
    code: 'old editor content',
    starterCode: 'old starter',
    codeSnapshot: 'old snapshot',
    questionId: 12,
    submissionId: 8,
    score: 75,
    revision: 4,
    languageId: 71,
  };
  assert.deepEqual(interviewEventMetadata(payload), {
    questionId: 12,
    submissionId: 8,
    score: 75,
    revision: 4,
    languageId: 71,
  });
  assert.equal(payload.code, 'old editor content');
});

test('the platform router no longer exposes interview playback, including to admins', async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 1, name: 'Fixture', email: 'fixture@test.invalid', role: 'admin' };
    next();
  });
  app.use('/platform', platformRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/platform/interviews/1/replay`);
    assert.equal(response.status, 404);
    for (const [method, path] of [
      ['GET', '/readiness'],
      ['GET', '/audit'],
      ['GET', '/templates'],
      ['POST', '/templates/draft'],
      ['GET', '/messages'],
      ['POST', '/messages/1/retry'],
      ['GET', '/assessments/1/analytics'],
      ['GET', '/assessments/1/integrity'],
      ['POST', '/assessments/1/integrity/review'],
      ['GET', '/assessments/1/reviews'],
      ['POST', '/submissions/1/review'],
      ['GET', '/assessments/1/accommodations'],
      ['POST', '/assessments/1/accommodations'],
      ['POST', '/assessments/1/invitations'],
    ]) {
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/platform${path}`, { method })).status,
        404,
        `${method} ${path} must be removed`,
      );
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
