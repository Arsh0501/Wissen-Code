import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import prisma from '../prisma';
import { ownerOnly } from '../platform/permissions';
import { appURL, mailConfigured } from '../platform/communication';

const router = Router();
router.use(ownerOnly);
router.get('/candidates', async (req, res, next) => {
  try {
    const search = z.string().max(200).parse(req.query.search ?? '');
    const rows = await prisma.user.findMany({ where: { role: 'candidate', ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, email: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 101 });
    res.json({ candidates: rows.slice(0, 100), hasMore: rows.length > 100 });
  } catch (error) { next(error); }
});
const recipient = z.object({ name: z.string().trim().min(1).max(200).refine(s => !/[\u0000\r\n]/.test(s)), email: z.email().max(254).transform(s => s.toLowerCase()) }).strict();
router.get('/bulk-assessment/status', async (req, res, next) => {
  try {
    const assessmentId = z.coerce.number().int().positive().parse(req.query.assessmentId);
    const requestId = z.string().uuid().optional().parse(req.query.requestId);
    const messages = requestId ? await prisma.outboundMessage.findMany({ where: { kind: { startsWith: `bulk-assessment:${req.user!.id}:${assessmentId}:${requestId}:` } }, select: { recipient: true, status: true, attempts: true, error: true }, orderBy: { recipient: 'asc' } }) :
      await prisma.$queryRaw<{ recipient: string; status: string; attempts: number; error: string | null }[]>`SELECT DISTINCT ON (lower(recipient)) recipient, status, attempts, error FROM "OutboundMessage" WHERE kind LIKE 'bulk-assessment:%' AND split_part(kind, ':', 3) = ${String(assessmentId)} ORDER BY lower(recipient), "createdAt" DESC`;
    res.json({ messages });
  } catch (error) { next(error); }
});
router.post('/bulk-assessment', async (req, res, next) => {
  try {
    const input = z.object({ assessmentId: z.number().int().positive(), requestId: z.string().uuid(), recipients: z.array(recipient).max(500).default([]), candidateIds: z.array(z.number().int().positive()).max(500).default([]) }).strict().parse(req.body);
    if (!input.recipients.length && !input.candidateIds.length) return res.status(400).json({ error: 'Select at least one candidate' });
    if (!mailConfigured()) return res.status(503).json({ error: 'Configure Nodemailer SMTP_HOST, SMTP_USER and SMTP_PASS (or Gmail OAuth), and run the mail worker before sending assessment emails' });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Assessment" WHERE id = ${input.assessmentId} FOR UPDATE`;
      const assessment = await tx.assessment.findUnique({ where: { id: input.assessmentId } });
      if (!assessment) return { status: 404, error: 'Assessment not found' };
      if (assessment.status !== 'published' || (assessment.endAt && assessment.endAt <= new Date())) return { status: 409, error: 'Select a published assessment that has not closed' };
      const dbCandidates = await tx.user.findMany({ where: { id: { in: input.candidateIds }, role: 'candidate' }, select: { name: true, email: true } });
      if (dbCandidates.length !== new Set(input.candidateIds).size) return { status: 400, error: 'Some selected database candidates are no longer available' };
      const merged = new Map<string, z.infer<typeof recipient>>();
      for (const row of [...input.recipients, ...dbCandidates]) { const value = recipient.parse(row); merged.set(value.email, value); }
      if (merged.size > 500) return { status: 400, error: 'Send up to 500 unique candidates per batch' };
      const recipients = [...merged.values()].sort((a, b) => a.email.localeCompare(b.email));
      const digest = crypto.createHash('sha256').update(JSON.stringify(recipients)).digest('hex');
      const prefix = `bulk-assessment:${req.user!.id}:${assessment.id}:${input.requestId}:`;
      const kind = prefix + digest;
      const previous = await tx.outboundMessage.findMany({ where: { kind: { startsWith: prefix } }, select: { kind: true, status: true } });
      if (previous.length && previous.some(row => row.kind !== kind)) return { status: 409, error: 'Recipient selection changed. Start a new batch before sending' };
      if (previous.length) return { status: 200, count: previous.length, queuedCount: 0, skippedCount: previous.length, reused: true };
      // The assessment row lock serializes batches from every admin, including different request IDs.
      const existing = await tx.$queryRaw<{ recipient: string }[]>`SELECT recipient FROM "OutboundMessage" WHERE kind LIKE 'bulk-assessment:%' AND split_part(kind, ':', 3) = ${String(assessment.id)}`;
      const alreadyInvited = new Set(existing.map(row => row.recipient.toLowerCase()));
      let queuedCount = 0;
      for (const candidate of recipients) {
        if (alreadyInvited.has(candidate.email)) continue;
        const invite = await tx.inviteLink.create({ data: { assessmentId: assessment.id, recipientEmail: candidate.email, label: `${candidate.name} <${candidate.email}>`.slice(0, 300), token: crypto.randomBytes(32).toString('hex'), maxUses: 1, expiresAt: assessment.endAt } });
        const body = `Hello ${candidate.name},\n\nYou are invited to take ${assessment.name}.\nDuration: ${assessment.timeLimitMinutes} minutes\n${assessment.startAt ? `Opens: ${assessment.startAt.toISOString()}\n` : ''}${assessment.endAt ? `Closes: ${assessment.endAt.toISOString()}\n` : ''}\nStart your assessment: ${appURL(`/invite/${invite.token}`)}\n\nIf you already have an account, sign in using your registered email.`;
        await tx.outboundMessage.create({ data: { authorId: req.user!.id, recipient: candidate.email, subject: `Assessment invitation: ${assessment.name}`, body, kind } });
        queuedCount++;
      }
      return { status: queuedCount ? 202 : 200, count: recipients.length, queuedCount, skippedCount: recipients.length - queuedCount, reused: queuedCount === 0 };
    }, { timeout: 30000 });
    res.status(result.status).json(result);
  } catch (error) { next(error); }
});
export default router;
