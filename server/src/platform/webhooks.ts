import crypto from 'node:crypto';
import prisma from '../prisma';
export async function queueWebhook(event: string, resourceId: number) {
  if (!process.env.ATS_WEBHOOK_URL || !process.env.ATS_WEBHOOK_SECRET) return;
  const target = new URL(process.env.ATS_WEBHOOK_URL);
  if (target.protocol !== 'https:')
    throw new Error('ATS_WEBHOOK_URL requires HTTPS');
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    event,
    resourceId,
    timestamp: new Date().toISOString(),
  });
  await prisma.outboundMessage.create({
    data: {
      kind: 'webhook',
      recipient: target.toString(),
      subject: event,
      body,
    },
  });
}
export function webhookSignature(
  id: string,
  timestamp: string,
  body: string,
  secret: string,
) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest('hex');
}
export async function deliverWebhooks(send: typeof fetch = fetch) {
  const secret = process.env.ATS_WEBHOOK_SECRET;
  if (!secret) return;
  const due = await prisma.outboundMessage.findMany({
    where: {
      kind: 'webhook',
      attempts: { lt: 5 },
      scheduledAt: { lte: new Date() },
      OR: [
        { status: 'pending' },
        { status: 'sending', lockedAt: { lt: new Date(Date.now() - 120000) } },
      ],
    },
    take: 20,
  });
  for (const message of due) {
    const claim = await prisma.outboundMessage.updateMany({
      where: {
        id: message.id,
        attempts: message.attempts,
        status: message.status,
      },
      data: {
        status: 'sending',
        attempts: { increment: 1 },
        lockedAt: new Date(),
      },
    });
    if (!claim.count) continue;
    try {
      if (new URL(message.recipient).protocol !== 'https:')
        throw new Error('Webhook target requires HTTPS');
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await send(message.recipient, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          'X-Wissen-Id': message.id,
          'X-Wissen-Timestamp': timestamp,
          'X-Wissen-Signature': webhookSignature(
            message.id,
            timestamp,
            message.body,
            secret,
          ),
        },
        body: message.body,
      });
      if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
      await prisma.outboundMessage.update({
        where: { id: message.id },
        data: { status: 'sent', deliveredAt: new Date(), error: null },
      });
    } catch (error) {
      await prisma.outboundMessage.update({
        where: { id: message.id },
        data: {
          status: message.attempts >= 4 ? 'failed' : 'pending',
          scheduledAt: new Date(Date.now() + 30000 * 2 ** message.attempts),
          error: error instanceof Error ? error.message : 'Webhook failed',
        },
      });
    }
  }
}
