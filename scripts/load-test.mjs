#!/usr/bin/env node
// Exam-day load test: N candidates log in, start the same assessment, autosave every few
// seconds, run code now and then, and all submit together at the deadline.
//
//   cd server && npm run db:seed-load -- 400      (creates accounts + assessment, prints assessmentId)
//   node scripts/load-test.mjs --users 400 --assessment <id> --duration 120
//
// Options: --base http://localhost:4001  --users 400  --assessment <id>  --duration 120 (s)
//          --ramp 30 (s to bring everyone in)  --autosave 12 (s)  --run-every 40 (s, 0 = never)
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const BASE = (args.base || process.env.BASE || 'http://localhost:4001').replace(/\/$/, '');
const USERS = Number(args.users || 400);
const DURATION = Number(args.duration || 120) * 1000;
const RAMP = Number(args.ramp || 30) * 1000;
const AUTOSAVE = Number(args.autosave || 12) * 1000;
const RUN_EVERY = Number(args['run-every'] ?? 40) * 1000;
const PASSWORD = 'LoadTest@123';
let ASSESSMENT = args.assessment ? Number(args.assessment) : null;

const stats = new Map(); // op -> { ms: number[], errors: Map<string, number> }
function record(op, ms, err) {
  const s = stats.get(op) || { ms: [], errors: new Map() };
  if (err) s.errors.set(err, (s.errors.get(err) || 0) + 1);
  else s.ms.push(ms);
  stats.set(op, s);
}
async function call(op, method, path, { token, body, timeout = 60000 } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      record(op, 0, `${res.status} ${data?.error || data?.message || ''}`.trim());
      return { ok: false, status: res.status, data };
    }
    record(op, performance.now() - t0);
    return { ok: true, status: res.status, data };
  } catch (error) {
    record(op, 0, error.name === 'TimeoutError' ? 'timeout' : error.code || error.message);
    return { ok: false, status: 0, data: null };
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms * (0.8 + Math.random() * 0.4);

const CODE = 'def solve():\n    data = input().strip()\n    print(data)\n\nsolve()\n';
let submitAt = 0; // shared deadline: everyone submits at the same moment
const alive = { started: 0, inExam: 0, submitted: 0 };

async function candidate(n) {
  const email = `load-cand-${n}@loadtest.local`;
  const login = await call('login', 'POST', '/api/auth/login', {
    body: { email, password: PASSWORD, audience: 'candidate' },
  });
  if (!login.ok) return;
  const token = login.data.token || login.data.accessToken;
  await call('list-assessments', 'GET', '/api/assessments', { token });
  const start = await call('start-session', 'POST', `/api/assessments/${ASSESSMENT}/start`, {
    token,
    body: { retake: false },
  });
  if (!start.ok) return;
  const sessionId = start.data.sessionId;
  const detail = await call('assessment-detail', 'GET', `/api/assessments/${ASSESSMENT}`, { token });
  const questionIds = (detail.data?.questions || [])
    .map((q) => q.questionId ?? q.question?.id ?? q.id)
    .filter(Boolean);
  if (!questionIds.length) {
    record('assessment-detail', 0, 'no questions in payload');
    return;
  }
  alive.started++;
  alive.inExam++;
  let nextSave = Date.now() + jitter(AUTOSAVE);
  let nextRun = RUN_EVERY ? Date.now() + jitter(RUN_EVERY) : Infinity;
  let i = 0;
  while (Date.now() < submitAt) {
    const now = Date.now();
    if (now >= nextSave) {
      nextSave = now + AUTOSAVE;
      const questionId = questionIds[i++ % questionIds.length];
      await call('autosave', 'PUT', `/api/attempts/${sessionId}/answer`, {
        token,
        body: {
          questionId,
          languageId: 71,
          languageName: 'Python (3.8.1)',
          code: CODE + `# edit ${i}\n`,
          isAnswered: true,
        },
      });
    } else if (now >= nextRun) {
      nextRun = now + RUN_EVERY;
      await call('run-code', 'POST', '/api/judge/run', {
        token,
        body: { sourceCode: CODE, languageId: 71, stdin: 'hello' },
        timeout: 180000,
      });
    }
    await sleep(Math.min(250, Math.max(0, Math.min(nextSave, nextRun) - Date.now())));
  }
  alive.inExam--;
  await call('submit', 'POST', `/api/attempts/${sessionId}/submit`, { token, body: {}, timeout: 11 * 60000 });
  alive.submitted++;
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
function report() {
  const rows = [];
  for (const [op, s] of stats) {
    const sorted = [...s.ms].sort((a, b) => a - b);
    const errs = [...s.errors.values()].reduce((a, b) => a + b, 0);
    rows.push({
      op,
      ok: sorted.length,
      errors: errs,
      p50: Math.round(pct(sorted, 50)),
      p95: Math.round(pct(sorted, 95)),
      p99: Math.round(pct(sorted, 99)),
      max: Math.round(sorted.at(-1) || 0),
      'error breakdown': [...s.errors].map(([k, v]) => `${v}× ${k}`).join('; ').slice(0, 90),
    });
  }
  console.log('\nLatency in ms (lower is better):');
  console.table(rows);
}

(async () => {
  // Resolve the assessment id automatically when the seed assessment exists.
  if (!ASSESSMENT) {
    const probe = await call('login', 'POST', '/api/auth/login', {
      body: { email: 'load-cand-1@loadtest.local', password: PASSWORD, audience: 'candidate' },
    });
    if (!probe.ok) throw new Error('Run the seed first: cd server && npm run db:seed-load -- 400');
    const list = await call('list-assessments', 'GET', '/api/assessments', { token: probe.data.token });
    ASSESSMENT = (list.data || []).find((a) => a.name === 'Load test — DSA screen')?.id;
    if (!ASSESSMENT) throw new Error('Load assessment not found; run the seed');
    stats.clear();
  }
  console.log(`Target ${BASE} · ${USERS} candidates · assessment #${ASSESSMENT} · ramp ${RAMP / 1000}s · exam ${DURATION / 1000}s · autosave every ${AUTOSAVE / 1000}s · run code every ${RUN_EVERY ? RUN_EVERY / 1000 + 's' : 'never'}`);
  const t0 = Date.now();
  submitAt = t0 + RAMP + DURATION;
  const ticker = setInterval(() => {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`[${elapsed}s] started ${alive.started} · in exam ${alive.inExam} · submitted ${alive.submitted}`);
  }, 10000);
  const runs = [];
  for (let n = 1; n <= USERS; n++) {
    runs.push(candidate(n));
    await sleep(RAMP / USERS);
  }
  await Promise.all(runs);
  clearInterval(ticker);
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s · submitted ${alive.submitted}/${USERS}`);
  report();
  const totalErrors = [...stats.values()].reduce((a, s) => a + [...s.errors.values()].reduce((x, y) => x + y, 0), 0);
  process.exitCode = totalErrors ? 1 : 0;
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
