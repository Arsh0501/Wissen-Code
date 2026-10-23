import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ZodError } from 'zod';
import prisma from '../prisma';
import interviews, { handleJoinRoom } from '../routes/interviews';
import { REQUIRED_FEEDBACK_CRITERIA } from '../services/interview-feedback';

const criteria = Object.entries(REQUIRED_FEEDBACK_CRITERIA).map(([key, label]) => ({
  key, label, rating: 4, feedback: `Observed evidence for ${label}.`,
}));

test('interview-wide feedback enforces required criteria, ownership, status, revision and privacy', async () => {
  const marker = `feedback-${Date.now()}`;
  const owner = await prisma.user.create({ data: { name: marker, email: `${marker}@test.invalid`, password: 'unused', role: 'interviewer' } });
  const other = await prisma.user.create({ data: { name: marker, email: `${marker}-other@test.invalid`, password: 'unused', role: 'interviewer' } });
  const interview = await prisma.interview.create({ data: { title: marker, interviewerId: owner.id, candidateName: 'Fixture', candidateEmail: 'fixture@test.invalid', roomToken: marker } });
  const app = express();
  app.use(express.json());
  app.get('/room/:roomToken', handleJoinRoom);
  app.use((req, _res, next) => {
    req.user = { id: req.header('other') ? other.id : owner.id, name: owner.name, email: owner.email, role: (req.header('role') || 'interviewer') as 'admin' | 'interviewer' | 'candidate' };
    next();
  });
  app.use('/interviews', interviews);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error instanceof ZodError ? 400 : error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  async function save(body: unknown, final = false, headers: Record<string, string> = {}) {
    const response = await fetch(`http://127.0.0.1:${port}/interviews/${interview.id}/feedback${final ? '' : '/criteria'}`, { method: final ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  }
  const finalInput = { finalFeedback: 'Evidence-backed final summary.', finalRating: 4, finalRecommendation: 'Hire' };
  try {
    assert.equal((await save({ criteria, revision: 0 })).status, 409);
    await prisma.interview.update({ where: { id: interview.id }, data: { status: 'in_progress', startedAt: new Date() } });
    assert.equal((await save({ criteria: criteria.slice(1), revision: 0 })).status, 400);
    assert.equal((await save({ criteria: criteria.map(c => ({ ...c, feedback: '\u0000' })), revision: 0 })).status, 400);
    assert.equal((await save({ criteria: criteria.map(c => ({ ...c, rating: 0 })), revision: 0 })).status, 400);
    assert.equal((await save({ criteria, revision: 0 }, false, { role: 'admin' })).status, 403);
    assert.equal((await save({ criteria, revision: 0 }, false, { other: 'yes' })).status, 403);
    assert.equal((await save({ criteria, revision: 0 }, false, { role: 'candidate' })).status, 403);
    const saved = await save({ criteria: criteria.map(({ feedback: _feedback, ...criterion }) => criterion), revision: 0 });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.interview.feedbackCriteria, criteria.map(criterion => ({ ...criterion, feedback: '' })));
    assert.equal(saved.body.interview.feedbackRevision, 1);
    assert.equal(saved.body.interview.finalFeedback, null);
    assert.equal((await save({ criteria, revision: 0 })).status, 409);
    assert.equal((await save({ ...finalInput, criteria, revision: 1 }, true)).status, 409);
    const publicRoom: any = await (await fetch(`http://127.0.0.1:${port}/room/${marker}`)).json();
    assert.equal(publicRoom.feedbackCriteria, undefined);
    assert.ok(!JSON.stringify(publicRoom).includes('Observed evidence'));

    await prisma.interview.update({ where: { id: interview.id }, data: { status: 'completed', endedAt: new Date() } });
    assert.equal((await save({ ...finalInput, revision: 1 }, true)).status, 400);
    const custom = { key: 'custom_design', label: 'System design', rating: 3, feedback: '' };
    const finalized = await save({ ...finalInput, criteria: [...criteria, custom], revision: 1 }, true);
    assert.equal(finalized.status, 200);
    assert.equal(finalized.body.interview.finalRating, 4);
    assert.equal(finalized.body.interview.feedbackCriteria.length, 4);
    assert.equal(finalized.body.interview.feedbackRevision, 2);
    assert.equal(finalized.body.report.status, 'ready');
    const download = await fetch(`http://127.0.0.1:${port}/interviews/${interview.id}/feedback/report/download`);
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-type') || '', /application\/pdf/);
    assert.ok(Buffer.from(await download.arrayBuffer()).subarray(0, 5).equals(Buffer.from('%PDF-')));
    const deniedReport = await fetch(`http://127.0.0.1:${port}/interviews/${interview.id}/feedback/report/download`, { headers: { other: 'yes' } });
    assert.equal(deniedReport.status, 403);
    const afterEnd = await save({ criteria, revision: 2 });
    assert.equal(afterEnd.status, 200);
    assert.equal(afterEnd.body.interview.finalFeedback, finalInput.finalFeedback);
    assert.equal(afterEnd.body.interview.feedbackCriteria.length, 3);
    const staleReport = await fetch(`http://127.0.0.1:${port}/interviews/${interview.id}/feedback/report/download`);
    assert.equal(staleReport.status, 409);
    const regenerated = await fetch(`http://127.0.0.1:${port}/interviews/${interview.id}/feedback/report`, { method: 'POST' });
    assert.equal(regenerated.status, 200);
    assert.equal((await regenerated.json() as any).status, 'ready');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.interview.delete({ where: { id: interview.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});
