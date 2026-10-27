import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import { z } from 'zod';
import prisma from '../database/prisma';
import bulkRoutes from '../routes/bulk-assessment-invites';
import { deliverOutbox } from '../platform/mail/communication';

test('bulk invitations merge selected candidates, queue personalized mail once and enforce admin access', async () => {
  const previous = {
    key: process.env.SMTP_PASS,
    host: process.env.SMTP_HOST,
    smtpUser: process.env.SMTP_USER,
    from: process.env.MAIL_FROM,
  };
  process.env.SMTP_PASS = 'test-only-no-provider-requests';
  process.env.SMTP_HOST = 'smtp.test.invalid';
  process.env.SMTP_USER = 'sender@test.invalid';
  process.env.MAIL_FROM = 'test@test.invalid';
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: 1,
      name: 'Admin',
      email: 'admin@test.invalid',
      role: 'admin',
      accessRole: req.headers['x-role'] === 'interviewer' ? 'interviewer' : 'admin',
    };
    next();
  });
  app.use('/invites', bulkRoutes);
  app.use(
    (error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(error instanceof z.ZodError ? 400 : 500).json({ error: error.message });
    },
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/invites`;
  const suffix = crypto.randomUUID();
  const candidate = await prisma.user.create({
    data: {
      name: 'Database Candidate',
      email: `candidate-${suffix}@test.invalid`,
      password: 'unused',
      role: 'candidate',
    },
  });
  const assessment = await prisma.assessment.create({
    data: { name: 'Bulk mail fixture', status: 'published', timeLimitMinutes: 30 },
  });
  const batch = crypto.randomUUID();
  const kindPrefix = `bulk-assessment:1:${assessment.id}:`;
  const request = (body: unknown, role = 'admin') =>
    fetch(`${url}/bulk-assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-role': role },
      body: JSON.stringify(body),
    });
  const payload = {
    assessmentId: assessment.id,
    requestId: batch,
    candidateIds: [candidate.id],
    recipients: [
      { name: 'Imported Duplicate', email: candidate.email.toUpperCase() },
      { name: 'Imported Candidate', email: `imported-${suffix}@test.invalid` },
    ],
  };
  try {
    assert.equal((await request(payload, 'interviewer')).status, 403);
    assert.equal(
      (await request({ ...payload, recipients: [{ name: 'Invalid', email: 'not-email' }] })).status,
      400,
    );
    assert.equal((await request({ ...payload, recipients: [], candidateIds: [] })).status, 400);
    const selected = (await (
      await fetch(`${url}/candidates?search=${encodeURIComponent(candidate.email)}`)
    ).json()) as any;
    assert.equal(selected.candidates[0].id, candidate.id);
    const responses = await Promise.all([request(payload), request(payload)]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 202]);
    const messages = await prisma.outboundMessage.findMany({
      where: { kind: { startsWith: kindPrefix } },
    });
    assert.equal(messages.length, 2);
    assert.equal(await prisma.inviteLink.count({ where: { assessmentId: assessment.id } }), 2);
    const boundLinks = await prisma.inviteLink.findMany({
      where: { assessmentId: assessment.id },
      select: { recipientEmail: true },
    });
    assert.ok(boundLinks.every((link) => !!link.recipientEmail));
    const dbMail = messages.find((message) => message.recipient === candidate.email)!;
    assert.ok(dbMail.body.startsWith('Hello Database Candidate,'));
    assert.ok(dbMail.body.includes('/invite/'));
    assert.equal(
      (
        await request({
          ...payload,
          recipients: [{ name: 'Changed', email: 'changed@test.invalid' }],
        })
      ).status,
      409,
    );
    const status = (await (
      await fetch(`${url}/bulk-assessment/status?assessmentId=${assessment.id}&requestId=${batch}`)
    ).json()) as any;
    assert.equal(status.messages.length, 2);
    assert.equal(status.messages[0].status, 'pending');
    const newBatches = await Promise.all([
      request({ ...payload, requestId: crypto.randomUUID() }),
      request({ ...payload, requestId: crypto.randomUUID() }),
    ]);
    for (const response of newBatches) {
      assert.equal(response.status, 200);
      const result = (await response.json()) as any;
      assert.equal(result.queuedCount, 0);
      assert.equal(result.skippedCount, 2);
    }
    assert.equal(
      await prisma.outboundMessage.count({ where: { kind: { startsWith: kindPrefix } } }),
      2,
    );
    assert.equal(await prisma.inviteLink.count({ where: { assessmentId: assessment.id } }), 2);
    const assessmentStatus = (await (
      await fetch(`${url}/bulk-assessment/status?assessmentId=${assessment.id}`)
    ).json()) as any;
    assert.equal(assessmentStatus.messages.length, 2);
    await deliverOutbox(
      async () => {
        throw new Error(`SMTP authentication failed ${process.env.SMTP_PASS}`);
      },
      messages.map((message) => message.id),
    );
    const rejected = await prisma.outboundMessage.findUniqueOrThrow({
      where: { id: messages[0].id },
    });
    assert.ok(rejected.error?.includes('SMTP authentication failed'));
    assert.ok(!rejected.error?.includes(process.env.SMTP_PASS!));
    await prisma.outboundMessage.updateMany({
      where: { id: { in: messages.map((message) => message.id) } },
      data: { scheduledAt: new Date() },
    });
    let delivered = 0;
    await deliverOutbox(
      async (message) => {
        assert.ok(message.to);
        delivered++;
        return `fake-${delivered}`;
      },
      messages.map((message) => message.id),
    );
    assert.equal(delivered, 2);
    assert.equal(
      await prisma.outboundMessage.count({
        where: { kind: { startsWith: kindPrefix }, status: 'sent' },
      }),
      2,
    );
    const sentAgain = await request({ ...payload, requestId: crypto.randomUUID() });
    assert.equal(((await sentAgain.json()) as any).queuedCount, 0);
    const done = (await (
      await fetch(`${url}/bulk-assessment/status?assessmentId=${assessment.id}`)
    ).json()) as any;
    assert.ok(done.messages.every((row: any) => row.status === 'sent'));
    await prisma.assessment.update({ where: { id: assessment.id }, data: { status: 'draft' } });
    assert.equal((await request({ ...payload, requestId: crypto.randomUUID() })).status, 409);
    delete process.env.SMTP_PASS;
    assert.equal((await request(payload)).status, 503);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.outboundMessage.deleteMany({ where: { kind: { startsWith: kindPrefix } } });
    await prisma.assessment.delete({ where: { id: assessment.id } });
    await prisma.user.delete({ where: { id: candidate.id } });
    if (previous.host === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = previous.host;
    if (previous.smtpUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = previous.smtpUser;
    if (previous.key === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = previous.key;
    if (previous.from === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = previous.from;
    await prisma.$disconnect();
  }
});
