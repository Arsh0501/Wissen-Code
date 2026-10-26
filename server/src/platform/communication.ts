import crypto from 'node:crypto';
import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { nodemailerConfigured, renderEmail, sendWithNodemailer , type MailAttachment } from './mailer';

export function appURL(path: string) {
  return new URL(
    path,
    process.env.APP_URL || 'http://localhost:3000',
  ).toString();
}
function resendConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
}
export function mailConfigured() {
  return nodemailerConfigured() || resendConfigured();
}
export async function enqueueMail(
  recipient: string,
  subject: string,
  body: string,
  authorId?: number,
  scheduledAt = new Date(),
  attachments: MailAttachment[] = [],
) {
  return prisma.outboundMessage.create({
    data: {
      recipient,
      subject,
      body,
      authorId,
      scheduledAt,
      attachments: attachments as unknown as Prisma.InputJsonValue,
    },
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
// Durable outbox: concurrent workers claim each message atomically; provider idempotency
// prevents duplicate email delivery if the worker dies after the provider accepts a request.
export async function deliverOutbox(
  send: typeof fetch = fetch,
  onlyIds?: string[],
) {
  if (!mailConfigured()) return;
  const due = await prisma.outboundMessage.findMany({
    where: {
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
      kind: 'email',
      attempts: { lt: 5 },
      scheduledAt: { lte: new Date() },
      OR: [
        { status: 'pending' },
        { status: 'sending', lockedAt: { lt: new Date(Date.now() - 120000) } },
      ],
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
      let providerId: string;
      if (nodemailerConfigured()) {
        providerId = await sendWithNodemailer({
          id: message.id,
          to: message.recipient,
          subject: message.subject,
          body: message.body,
          attachments: (message.attachments as unknown as MailAttachment[]) ?? [],
        });
      } else {
        const { html, text } = renderEmail(message.subject, message.body);
        const response = await send('https://api.resend.com/emails', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.id,
          },
          body: JSON.stringify({
            from: process.env.MAIL_FROM,
            to: [message.recipient],
            subject: message.subject,
            text,
            html,
            attachments: ((message.attachments as unknown as MailAttachment[]) ?? []).map(
              (a) => ({ filename: a.filename, content: a.content }),
            ),
          }),
        });
        if (!response.ok)
          throw new Error(`Email provider HTTP ${response.status}`);
        providerId = ((await response.json()) as { id: string }).id;
      }
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
          error: error instanceof Error ? error.message : 'Delivery failed',
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
