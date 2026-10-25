import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import prisma from '../prisma';
import { publicInviteRoutes } from '../routes/invites';
import { createSessionForUser } from '../routes/auth';
import { canAccessAssessment, guestAssessmentIds } from '../services/guest-access';

test('personalized links reject different emails and accounts and recheck guest email at test access', async () => {
  const marker = randomUUID();
  const invitedEmail = `invited-${marker}@test.invalid`;
  const assessment = await prisma.assessment.create({ data: { name: 'Personalized invite fixture', status: 'published' } });
  const account = await prisma.user.create({ data: { name: 'Invited account', email: `account-${marker}@test.invalid`, password: 'unused', role: 'candidate' } });
  const wrong = await prisma.user.create({ data: { name: 'Wrong account', email: `wrong-${marker}@test.invalid`, password: 'unused', role: 'candidate' } });
  const guestLink = await prisma.inviteLink.create({ data: { assessmentId: assessment.id, token: randomUUID(), recipientEmail: invitedEmail, maxUses: 1 } });
  const accountLink = await prisma.inviteLink.create({ data: { assessmentId: assessment.id, token: randomUUID(), recipientEmail: account.email, maxUses: 1 } });
  const general = await prisma.inviteLink.create({ data: { assessmentId: assessment.id, token: randomUUID() } });
  const app = express(); app.use(express.json()); app.use('/invite', publicInviteRoutes);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}/invite`;
  async function join(token: string, email: string, bearer?: string) {
    const response = await fetch(`${root}/${token}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify({ name: 'Guest fixture', email }) });
    return { status: response.status, data: await response.json() as any };
  }
  try {
    const denied = await join(guestLink.token, wrong.email);
    assert.equal(denied.status, 403);
    assert.equal(denied.data.code, 'INVITE_EMAIL_MISMATCH');
    assert.equal(await prisma.inviteRedemption.count({ where: { inviteId: guestLink.id } }), 0);
    const accepted = await join(guestLink.token, invitedEmail.toUpperCase());
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.user.email, invitedEmail);
    assert.ok((await guestAssessmentIds(accepted.data.user.id)).includes(assessment.id));
    await prisma.user.update({ where: { id: accepted.data.user.id }, data: { email: `changed-${marker}@test.invalid` } });
    assert.equal((await guestAssessmentIds(accepted.data.user.id)).includes(assessment.id), false);
    assert.equal(await canAccessAssessment({ user: { ...accepted.data.user, email: `changed-${marker}@test.invalid` } } as any, assessment.id), false);
    const wrongSession = await createSessionForUser(wrong.id, wrong.email, wrong.name, 'candidate', false);
    assert.ok(!('error' in wrongSession));
    assert.equal((await join(accountLink.token, account.email, (wrongSession as any).token)).status, 403);
    assert.equal((await join(accountLink.token, account.email)).status, 409);
    const rightSession = await createSessionForUser(account.id, account.email, account.name, 'candidate', false);
    const right = await join(accountLink.token, account.email, (rightSession as any).token);
    assert.equal(right.status, 200);
    assert.equal(right.data.token, (rightSession as any).token);
    assert.equal(await prisma.inviteRedemption.count({ where: { inviteId: accountLink.id, userId: account.id } }), 1);
    assert.equal((await join(accountLink.token, account.email, (rightSession as any).token)).status, 200);
    assert.equal((await join(general.token, `general-${marker}@test.invalid`)).status, 200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.assessment.delete({ where: { id: assessment.id } });
    await prisma.user.deleteMany({ where: { email: { contains: marker } } });
  }
});
