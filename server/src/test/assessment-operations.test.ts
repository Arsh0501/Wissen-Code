import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import assessments from '../routes/assessments';
import { adminInviteRoutes } from '../routes/invites';
import prisma from '../prisma';

test('assessment management APIs create, publish, duplicate, archive, invite, revoke and delete with admin permissions', async () => {
  const ids: number[] = [];
  const question = await prisma.question.create({ data: { title: 'Assessment operations fixture', statement: 'Print the input integer unchanged.', difficulty: 'easy', testCases: { create: [{ input: '1', expectedOutput: '1', isSample: true }, { input: '2', expectedOutput: '2', isSample: false }] } } });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 0, name: 'Operations fixture', email: 'operations@test.invalid', role: req.headers['x-role'] === 'candidate' ? 'candidate' : 'admin' }; next(); });
  app.use('/assessments', assessments);
  app.use('/invites', adminInviteRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function call(path: string, method = 'GET', body?: unknown, role = 'admin') {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'x-role': role }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as any };
  }
  try {
    assert.equal((await call('/assessments', 'POST', { name: '' })).status, 400);
    assert.equal((await call('/assessments', 'POST', { name: 'Forbidden' }, 'candidate')).status, 403);
    const created = await call('/assessments', 'POST', { name: 'Operations API fixture', status: 'draft', questionCount: 1, questions: [{ questionId: question.id, marks: 10 }] });
    assert.equal(created.status, 201);
    const id = created.data.id;
    ids.push(id);
    assert.equal((await call(`/assessments/${id}`)).status, 200);
    assert.equal((await call(`/assessments/${id}`, 'PUT', { status: 'published' })).status, 200);
    const copy = await call(`/assessments/${id}/duplicate`, 'POST', {});
    assert.equal(copy.status, 201);
    ids.push(copy.data.id);
    assert.equal(copy.data.status, 'draft');
    assert.equal(copy.data.questions[0].questionId, question.id);
    const invite = await call('/invites', 'POST', { assessmentId: id, label: 'Operations fixture', maxUses: 1 });
    assert.equal(invite.status, 201);
    assert.equal((await call(`/invites?assessmentId=${id}`)).data[0].state, 'active');
    assert.equal((await call(`/invites/${invite.data.id}/revoke`, 'POST', {})).status, 200);
    assert.equal((await call(`/invites?assessmentId=${id}`)).data[0].state, 'revoked');
    assert.equal((await call(`/assessments/${id}`, 'PUT', { status: 'archived' })).status, 200);
    assert.equal((await call(`/assessments/${id}`, 'DELETE', undefined, 'candidate')).status, 403);
    for (const assessmentId of ids) assert.equal((await call(`/assessments/${assessmentId}`, 'DELETE')).status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.assessment.deleteMany({ where: { id: { in: ids } } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.$disconnect();
  }
});
