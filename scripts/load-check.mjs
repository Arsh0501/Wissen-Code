import assert from 'node:assert/strict';
const target = process.env.LOAD_TEST_URL || 'http://localhost:3000/api/health';
const concurrency = Number(process.env.LOAD_CONCURRENCY || 10);
const requests = Number(process.env.LOAD_REQUESTS || 100);
assert.ok(
  Number.isInteger(concurrency) && concurrency > 0 && concurrency <= 100,
);
assert.ok(
  Number.isInteger(requests) && requests >= concurrency && requests <= 10000,
);
let sent = 0;
let failed = 0;
const timings = [];
const start = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (sent++ < requests) {
      const before = performance.now();
      try {
        const response = await fetch(target, {
          signal: AbortSignal.timeout(15000),
          headers: process.env.LOAD_AUTH_TOKEN
            ? { Authorization: `Bearer ${process.env.LOAD_AUTH_TOKEN}` }
            : {},
        });
        await response.arrayBuffer();
        if (!response.ok) failed++;
      } catch {
        failed++;
      }
      timings.push(performance.now() - before);
    }
  }),
);
timings.sort((a, b) => a - b);
const result = {
  requests,
  concurrency,
  failed,
  elapsedSeconds: Math.round((performance.now() - start) / 10) / 100,
  p50ms: Math.round(timings[Math.ceil(timings.length * 0.5) - 1]),
  p95ms: Math.round(timings[Math.ceil(timings.length * 0.95) - 1]),
};
console.log(JSON.stringify(result));
if (failed) process.exitCode = 1;
