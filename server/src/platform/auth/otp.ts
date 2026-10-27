import crypto from 'node:crypto';
import type Redis from 'ioredis';
import { redisConnection } from '../../ai/queue';

export const OTP_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_FAILED_ATTEMPTS = 5;
export const OTP_PURPOSES = ['login', 'email-verification', 'password-reset'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

let client: Redis | undefined;
const redis = () => (client ??= redisConnection());
const key = (purpose: OtpPurpose, email: string, suffix = 'code') =>
  `otp:${purpose}:${email.trim().toLowerCase()}:${suffix}`;

/**
 * Returns the active code for this email/purpose, creating one only if none exists. The code
 * lives in Redis for 10 minutes from first issue, so a resend within that window delivers the
 * same code and any earlier email stays valid.
 */
export async function issueOtp(purpose: OtpPurpose, email: string) {
  const r = redis();
  const candidate = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  // SET NX keeps the first code; the TTL is never extended by later requests.
  const created = await r.set(key(purpose, email), candidate, 'EX', OTP_TTL_SECONDS, 'NX');
  const code = created ? candidate : await r.get(key(purpose, email));
  const ttl = await r.ttl(key(purpose, email));
  if (!code || ttl <= 0) return issueOtp(purpose, email); // expired between calls
  if (created) await r.del(key(purpose, email, 'fails'));
  return { code, reused: !created, expiresInSeconds: ttl };
}

/** Throttles how often an email can be (re)sent; true when sending is allowed now. */
export async function claimOtpSendSlot(purpose: OtpPurpose, email: string) {
  return (
    (await redis().set(
      key(purpose, email, 'cooldown'),
      '1',
      'EX',
      RESEND_COOLDOWN_SECONDS,
      'NX',
    )) === 'OK'
  );
}

export async function verifyOtp(purpose: OtpPurpose, email: string, code: string) {
  const r = redis();
  const stored = await r.get(key(purpose, email));
  if (!stored) return { ok: false as const, reason: 'expired' as const };
  const fails = Number((await r.get(key(purpose, email, 'fails'))) || 0);
  if (fails >= MAX_FAILED_ATTEMPTS) return { ok: false as const, reason: 'locked' as const };
  const match =
    stored.length === code.length && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(code));
  if (!match) {
    const ttl = await r.ttl(key(purpose, email));
    await r
      .multi()
      .incr(key(purpose, email, 'fails'))
      .expire(key(purpose, email, 'fails'), Math.max(ttl, 1))
      .exec();
    return { ok: false as const, reason: 'invalid' as const };
  }
  // A successful verification consumes the code so it cannot be replayed.
  await r.del(key(purpose, email), key(purpose, email, 'fails'), key(purpose, email, 'cooldown'));
  return { ok: true as const };
}
