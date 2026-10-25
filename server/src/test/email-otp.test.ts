import test from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import { issueOtp, claimOtpSendSlot, verifyOtp } from '../platform/otp';
import { renderEmail } from '../platform/mailer';

test('OTP reuses codes, isolates purposes, throttles resends, locks failures and prevents replay', async () => {
  const originalUrl = process.env.REDIS_URL;
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  const values = new Map<string, string>();
  const prototype = Redis.prototype as any;
  const originals = new Map<string, any>();
  const replace = (name: string, fn: any) => { originals.set(name, Object.getOwnPropertyDescriptor(prototype, name)); Object.defineProperty(prototype, name, { configurable: true, writable: true, value: fn }); };
  replace('set', async (key: string, value: string) => { if (values.has(key)) return null; values.set(key, value); return 'OK'; });
  replace('get', async (key: string) => values.get(key) ?? null);
  replace('ttl', async (key: string) => values.has(key) ? 600 : -2);
  replace('del', async (...keys: string[]) => { keys.forEach(key => values.delete(key)); return keys.length; });
  replace('multi', () => { const chain = { incr(key: string) { values.set(key, String(Number(values.get(key) || 0) + 1)); return chain; }, expire() { return chain; }, async exec() { return []; } }; return chain; });
  try {
    const purpose = 'email-verification';
    const email = 'person@example.com';
    assert.equal(await claimOtpSendSlot(purpose, email), true);
    assert.equal(await claimOtpSendSlot(purpose, email), false);
    const first = await issueOtp(purpose, email);
    assert.match(first.code, /^\d{6}$/);
    const second = await issueOtp(purpose, ' PERSON@example.com ');
    assert.equal(second.code, first.code);
    assert.equal(second.reused, true);
    assert.deepEqual(await verifyOtp('login', email, first.code), { ok: false, reason: 'expired' });
    assert.deepEqual(await verifyOtp(purpose, email, first.code), { ok: true });
    assert.deepEqual(await verifyOtp(purpose, email, first.code), { ok: false, reason: 'expired' });
    const next = await issueOtp(purpose, email);
    const wrong = next.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) assert.deepEqual(await verifyOtp(purpose, email, wrong), { ok: false, reason: 'invalid' });
    assert.deepEqual(await verifyOtp(purpose, email, next.code), { ok: false, reason: 'locked' });
  } finally {
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(prototype, name, descriptor); else delete prototype[name]; }
    if (originalUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = originalUrl;
  }
});

test('verification email escapes user text and renders the six-digit code', () => {
  const result = renderEmail('<unsafe>', 'Your code\n\n123456\n\n<script>alert(1)</script>');
  assert.ok(result.html.includes('&lt;script&gt;'));
  assert.ok(!result.html.includes('<script>'));
  assert.ok(result.html.includes('123456'));
  assert.ok(result.text.includes('123456'));
});
