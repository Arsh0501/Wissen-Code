import crypto from 'node:crypto';
import prisma from '../prisma';
import { nodemailerConfigured, sendWithNodemailer } from './mailer';

export function appURL(path: string) {
  return new URL(
    path,
    process.env.APP_URL || 'http://localhost:3000',
  ).toString();
}
export function mailConfigured() {
  return nodemailerConfigured();
}
function redactMailError(error: unknown) {
  let message = error instanceof Error ? error.message : 'Delivery failed';
  for (const secret of [process.env.SMTP_PASS, process.env.GOOGLE_MAIL_CLIENT_SECRET, process.env.GOOGLE_MAIL_REFRESH_TOKEN]) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  return message.replace(/[\r\n\u0000]/g, ' ').slice(0, 600);
}
export async function enqueueMail(
  recipient: string,
  subject: string,
  body: string,
  authorId?: number,
  scheduledAt = new Date(),
) {
  return prisma.outboundMessage.create({
    data: { recipient, subject, body, authorId, scheduledAt },
  });
}
export function tokenHash(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
export async function accountLink(userId: number, purpose: 'reset' | 'verify') {
  const raw = crypto.randomBytes(32).toString('hex');
  await prisma.$transaction([
    prisma.accountToken.deleteMany({
      where: { userId, purpose, consumedAt: null },
    }),
    prisma.accountToken.create({
      data: {
        userId,
        purpose,
        tokenHash: tokenHash(raw),
        expiresAt: new Date(
          Date.now() + (purpose === 'reset' ? 30 * 60000 : 86400000),
        ),
      },
    }),
  ]);
  return appURL(`/account/${purpose}?token=${raw}`);
}
// Durable outbox: concurrent workers claim each message atomically. SMTP retries use
// a stable Message-ID, but delivery after an ambiguous disconnect may be duplicated.
export async function deliverOutbox(
  send: typeof sendWithNodemailer = sendWithNodemailer,
  onlyIds?: string[],
) {
  if (!mailConfigured()) return;
  const due = await prisma.outboundMessage.findMany({
    where: {
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
      OR: [
        { kind: 'email' },
        { kind: { startsWith: 'bulk-assessment:' } },
      ],
      attempts: { lt: 5 },
      scheduledAt: { lte: new Date() },
      AND: [{ OR: [
        { status: 'pending' },
        { status: 'sending', lockedAt: { lt: new Date(Date.now() - 120000) } },
      ] }],
    },
    take: 20,
    orderBy: { scheduledAt: 'asc' },
  });
  for (const message of due) {
    const claim = await prisma.outboundMessage.updateMany({
      where: {
        id: message.id,
        status: message.status,
        attempts: message.attempts,
      },
      data: {
        status: 'sending',
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) continue;
    try {
      const providerId = await send({ id: message.id, to: message.recipient, subject: message.subject, body: message.body });
      await prisma.outboundMessage.update({
        where: { id: message.id },
        data: {
          status: 'sent',
          deliveredAt: new Date(),
          providerId,
          error: null,
        },
      });
    } catch (error) {
      await prisma.outboundMessage.update({
        where: { id: message.id },
        data: {
          status: message.attempts + 1 >= 5 ? 'failed' : 'pending',
          scheduledAt: new Date(
            Date.now() + Math.min(3600000, 30000 * 2 ** message.attempts),
          ),
          error: redactMailError(error),
        },
      });
    }
  }
}
export function calendarEvent(input: {
  id: number;
  title: string;
  candidateEmail: string;
  scheduledAt: Date;
  timeLimitMinutes: number;
  roomToken: string;
}) {
  const escape = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  const date = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wissen Code//Interview//EN',
    'BEGIN:VEVENT',
    `UID:interview-${input.id}@wissen-code`,
    `DTSTAMP:${date(new Date())}`,
    `DTSTART:${date(input.scheduledAt)}`,
    `DTEND:${date(new Date(input.scheduledAt.getTime() + input.timeLimitMinutes * 60000))}`,
    `SUMMARY:${escape(input.title)}`,
    `DESCRIPTION:${escape(appURL(`/interview/${input.roomToken}`))}`,
    `ATTENDEE:mailto:${input.candidateEmail.replace(/[\r\n]/g, '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
