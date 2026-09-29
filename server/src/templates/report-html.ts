/**
 * Generates a self-contained HTML string for the assessment report PDF.
 * All styles are inline/embedded — no external dependencies needed for Puppeteer rendering.
 * Light, print-friendly design matching the web app.
 */

interface ReportQuestion {
  question_id: number;
  title: string;
  language: string;
  testcases_passed: number;
  testcases_total: number;
  score: number;
  marks: number;
  marks_obtained: number;
  attempted: boolean;
  code: string;
  failed_cases: {
    testcase_id: number;
    expected_output: string;
    actual_output: string;
    status: string;
  }[];
}

export interface ReportData {
  candidate: { id: string; name: string; email: string | null };
  assessment: { id: number; title: string; duration_minutes: number; submitted_at: string };
  overall_score: { passed: number; total: number; percentage: number };
  marks: {
    obtained: number;
    total: number;
    percentage: number;
    passing_score: number;
    passed: boolean;
    time_taken_seconds: number | null;
    questions_attempted: number;
    questions_total: number;
  };
  questions: ReportQuestion[];
  cohort: {
    rank: number | null;
    completed_count: number;
    percentile: number | null;
    average_score: number | null;
    highest_score: number | null;
    pass_rate: number | null;
  } | null;
  tab_switches: {
    count: number;
    limit: number;
    limit_exceeded: boolean;
    total_duration_ms: number;
    events: { duration_ms: number; occurred_at: string }[];
  };
  paste_events: {
    count: number;
    total_chars: number;
    large_count: number;
    large_threshold: number;
    events: { question_id: number; question_title: string; char_count: number; line_count: number; occurred_at: string }[];
  };
}

// Failed cases shown per question in the PDF; the rest are summarised to keep reports readable
const MAX_FAILED_CASES_SHOWN = 5;
// Longer submissions are cut off in the PDF (the full code is on the web report)
const MAX_CODE_LINES = 60;

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th';
  return `${n}${suffix}`;
}

const C = {
  ink: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  border: '#e2e8f0',
  soft: '#f8fafc',
  brand: '#6d28d9',
  brandSoft: '#f5f3ff',
  green: '#047857',
  greenSoft: '#ecfdf5',
  amber: '#b45309',
  amberSoft: '#fffbeb',
  red: '#b91c1c',
  redSoft: '#fef2f2',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function scoreColor(pct: number): string {
  if (pct >= 70) return C.green;
  if (pct >= 40) return C.amber;
  return C.red;
}

function pill(text: string, color: string, bg: string): string {
  return `<span class="pill" style="color:${color};background:${bg};border-color:${color}33;">${escapeHtml(text)}</span>`;
}

function statTile(label: string, value: string, sub: string): string {
  return `
    <div class="tile">
      <div class="label">${escapeHtml(label)}</div>
      <div class="tile-value">${value}</div>
      <div class="tile-sub">${sub}</div>
    </div>`;
}

function codeBlock(code: string, language: string): string {
  if (!code.trim()) return '';
  const lines = code.replace(/\s+$/, '').split('\n');
  const shown = lines.slice(0, MAX_CODE_LINES);
  const numbered = shown
    .map((l, i) => `<span class="ln">${i + 1}</span>${escapeHtml(l) || ' '}`)
    .join('\n');
  const more = lines.length - shown.length;
  return `
    <div class="code-wrap">
      <div class="code-head"><span class="label" style="margin:0;">Submitted code</span><span class="muted small">${escapeHtml(language)} · ${lines.length} line${lines.length === 1 ? '' : 's'}</span></div>
      <pre class="code">${numbered}</pre>
      ${more > 0 ? `<div class="muted small" style="padding:4px 10px 8px;">+ ${more} more line${more === 1 ? '' : 's'} — see the web report for the full code</div>` : ''}
    </div>`;
}

// Horizontal 0–100% track showing the candidate against the pass mark and the cohort average
function cohortBar(score: number, passing: number, average: number | null, resultColor: string): string {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  // Near either end, anchor the label to that side so it stays inside the page
  const edge = (n: number) => (n < 12 ? 'edge-left' : n > 88 ? 'edge-right' : '');
  return `
    <div class="bar">
      <div class="bar-fill" style="width:${clamp(score)}%;background:${resultColor};"></div>
      <div class="bar-mark ${edge(passing)}" style="left:${clamp(passing)}%;"><span>Pass ${passing}%</span></div>
      ${average !== null ? `<div class="bar-mark avg ${edge(average)}" style="left:${clamp(average)}%;"><span>Avg ${average.toFixed(0)}%</span></div>` : ''}
    </div>`;
}

export function generateReportHTML(data: ReportData): string {
  const { candidate, assessment, overall_score, marks, questions, cohort, tab_switches, paste_events } = data;
  const resultColor = marks.passed ? C.green : C.red;
  const resultBg = marks.passed ? C.greenSoft : C.redSoft;

  // ── Integrity verdict: tab-switch limit reached, or any large paste, warrants a review ──
  const concerns: string[] = [];
  if (tab_switches.limit_exceeded) concerns.push(`Tab-switch limit reached (${tab_switches.count}/${tab_switches.limit}) — test auto-submitted`);
  else if (tab_switches.count > 0) concerns.push(`${tab_switches.count} tab switch${tab_switches.count === 1 ? '' : 'es'}`);
  if (paste_events.large_count > 0) concerns.push(`${paste_events.large_count} large paste${paste_events.large_count === 1 ? '' : 's'} (${paste_events.large_threshold}+ characters)`);
  const needsReview = tab_switches.limit_exceeded || paste_events.large_count > 0;
  const integrityColor = needsReview ? C.red : concerns.length ? C.amber : C.green;
  const integrityBg = needsReview ? C.redSoft : concerns.length ? C.amberSoft : C.greenSoft;
  const integrityLabel = needsReview ? 'Review recommended' : concerns.length ? 'Minor activity' : 'No concerns';

  // ── Question summary table ──
  const summaryRows = questions
    .map((q, i) => q.attempted ? `
      <tr>
        <td class="num">${i + 1}</td>
        <td><div class="strong">${escapeHtml(q.title)}</div><div class="muted small">${escapeHtml(q.language)}</div></td>
        <td class="right">${q.testcases_passed}/${q.testcases_total}</td>
        <td class="right">${q.marks_obtained.toFixed(q.marks_obtained % 1 ? 1 : 0)} / ${q.marks}</td>
        <td class="right strong" style="color:${scoreColor(q.score)};">${q.score.toFixed(0)}%</td>
      </tr>` : `
      <tr>
        <td class="num">${i + 1}</td>
        <td><div class="strong">${escapeHtml(q.title)}</div><div class="muted small">Not attempted</div></td>
        <td class="right muted">—</td>
        <td class="right">0 / ${q.marks}</td>
        <td class="right">${pill('Skipped', C.muted, C.soft)}</td>
      </tr>`)
    .join('');

  // ── Per-question detail ──
  const questionDetails = questions
    .map((q, i) => {
      if (!q.attempted) {
        return `
        <div class="card avoid-break" style="background:${C.soft};">
          <div class="q-head">
            <div>
              <div class="q-title">Q${i + 1}. ${escapeHtml(q.title)}</div>
              <div class="muted small">Not attempted — no code was submitted for this question</div>
            </div>
            <div class="right"><div class="muted small">0 / ${q.marks} marks</div></div>
          </div>
        </div>`;
      }
      const dots = Array.from({ length: q.testcases_total }, (_, t) => {
        const ok = t < q.testcases_passed;
        return `<span class="dot" style="background:${ok ? C.greenSoft : C.redSoft};color:${ok ? C.green : C.red};border-color:${ok ? C.green : C.red}40;">${ok ? '✓' : '✗'}</span>`;
      }).join('');

      const shown = q.failed_cases.slice(0, MAX_FAILED_CASES_SHOWN);
      const hidden = q.failed_cases.length - shown.length;
      const failed = shown
        .map((fc) => `
          <div class="case">
            <div class="case-head">
              <span class="muted small">Test case #${fc.testcase_id}</span>
              <span class="small strong" style="color:${C.red};">${escapeHtml(fc.status.replace(/_/g, ' ').toUpperCase())}</span>
            </div>
            <div class="io">
              <div>
                <div class="label">Expected output</div>
                <pre style="border-color:${C.green}40;">${escapeHtml(fc.expected_output || '(empty)')}</pre>
              </div>
              <div>
                <div class="label">Actual output</div>
                <pre style="border-color:${C.red}40;">${escapeHtml(fc.actual_output || '(no output)')}</pre>
              </div>
            </div>
          </div>`)
        .join('');

      return `
        <div class="card avoid-break">
          <div class="q-head">
            <div>
              <div class="q-title">Q${i + 1}. ${escapeHtml(q.title)}</div>
              <div class="muted small">${escapeHtml(q.language)} · ${q.testcases_passed} of ${q.testcases_total} test cases passed</div>
            </div>
            <div class="right">
              <div class="q-score" style="color:${scoreColor(q.score)};">${q.score.toFixed(0)}%</div>
              <div class="muted small">${q.marks_obtained.toFixed(q.marks_obtained % 1 ? 1 : 0)} / ${q.marks} marks</div>
            </div>
          </div>
          <div class="dots">${dots}</div>
          ${failed}
          ${hidden > 0 ? `<div class="muted small" style="margin-top:8px;">+ ${hidden} more failed test case${hidden === 1 ? '' : 's'} not shown</div>` : ''}
          ${codeBlock(q.code, q.language)}
        </div>`;
    })
    .join('');

  // ── Integrity detail tables ──
  const tabRows = tab_switches.events.length
    ? tab_switches.events
        .map((e, i) => `<tr><td class="num">${i + 1}</td><td>${formatTime(e.occurred_at)}</td><td class="right">${(e.duration_ms / 1000).toFixed(1)}s</td></tr>`)
        .join('')
    : `<tr><td colspan="3" class="empty">No tab switches detected</td></tr>`;

  const pasteRows = paste_events.events.length
    ? paste_events.events
        .map((e, i) => {
          const large = e.char_count >= paste_events.large_threshold;
          return `<tr>
            <td class="num">${i + 1}</td>
            <td>${formatTime(e.occurred_at)}</td>
            <td>${escapeHtml(e.question_title)}</td>
            <td class="right">${e.line_count}</td>
            <td class="right ${large ? 'strong' : ''}" style="${large ? `color:${C.red};` : ''}">${e.char_count}${large ? ' ⚑' : ''}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="5" class="empty">No pastes detected</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif; color: ${C.text}; background: #fff; font-size: 12px; line-height: 1.5; }
    .page { padding: 8px 4px; }
    h2 { color: ${C.ink}; font-size: 14px; font-weight: 700; margin: 22px 0 10px; }
    .label { color: ${C.muted}; font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px; }
    .muted { color: ${C.muted}; }
    .small { font-size: 10.5px; }
    .strong { font-weight: 600; color: ${C.ink}; }
    .right { text-align: right; }
    .pill { display: inline-block; padding: 3px 10px; border-radius: 999px; border: 1px solid; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
    .card { border: 1px solid ${C.border}; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; background: #fff; }
    .avoid-break { page-break-inside: avoid; }
    .page-break { page-break-before: always; }

    .brand { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 2px solid ${C.brand}; margin-bottom: 18px; }
    .brand-name { color: ${C.brand}; font-weight: 800; font-size: 14px; letter-spacing: -0.2px; }
    .hero { display: flex; justify-content: space-between; gap: 20px; align-items: stretch; }
    .who h1 { color: ${C.ink}; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
    .meta { margin-top: 8px; display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 11px; }
    .meta dt { color: ${C.muted}; }
    .meta dd { color: ${C.ink}; }
    .result { min-width: 190px; border-radius: 12px; padding: 14px 18px; text-align: center; }
    .result-score { font-size: 34px; font-weight: 800; line-height: 1.1; margin: 6px 0 2px; }

    .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
    .tile { border: 1px solid ${C.border}; border-radius: 10px; padding: 10px 12px; background: ${C.soft}; }
    .tile-value { color: ${C.ink}; font-size: 17px; font-weight: 700; }
    .tile-sub { color: ${C.muted}; font-size: 10px; }

    .integrity { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-radius: 10px; padding: 12px 16px; margin-top: 12px; border: 1px solid; }
    .integrity ul { list-style: none; font-size: 11px; }
    .integrity li::before { content: '• '; }

    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: ${C.muted}; font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 7px 10px; border-bottom: 1px solid ${C.border}; background: ${C.soft}; }
    th.right { text-align: right; }
    td { padding: 7px 10px; border-bottom: 1px solid ${C.border}; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    td.num { color: ${C.faint}; width: 28px; }
    td.empty { color: ${C.muted}; text-align: center; padding: 12px; }
    .table-card { border: 1px solid ${C.border}; border-radius: 10px; overflow: hidden; }

    .q-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .q-title { color: ${C.ink}; font-size: 13px; font-weight: 700; }
    .q-score { font-size: 20px; font-weight: 800; line-height: 1.1; }
    .dots { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
    .dot { width: 20px; height: 20px; border-radius: 5px; border: 1px solid; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
    .case { border: 1px solid ${C.border}; border-radius: 8px; padding: 8px 10px; margin-top: 8px; background: ${C.soft}; }
    .case-head { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .io { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    pre { background: #fff; border: 1px solid; border-radius: 6px; padding: 6px 8px; font-family: 'JetBrains Mono', Menlo, Consolas, monospace; font-size: 10px; white-space: pre-wrap; word-break: break-all; color: ${C.ink}; max-height: 140px; overflow: hidden; }
    .rank { margin-top: 8px; padding-top: 8px; border-top: 1px solid ${C.border}; font-size: 10.5px; color: ${C.text}; }
    .rank b { color: ${C.ink}; }
    .compare { border: 1px solid ${C.border}; border-radius: 10px; padding: 12px 16px 26px; margin-top: 12px; }
    .compare-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 22px; }
    .bar { position: relative; height: 10px; background: ${C.border}; border-radius: 999px; }
    .bar-fill { height: 100%; border-radius: 999px; }
    .bar-mark { position: absolute; top: -4px; width: 2px; height: 18px; background: ${C.ink}; }
    .bar-mark span { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 9px; color: ${C.ink}; font-weight: 600; }
    .bar-mark.edge-left span { left: 0; transform: none; }
    .bar-mark.edge-right span { left: auto; right: 0; transform: none; }
    .bar-mark.avg { background: ${C.brand}; }
    .bar-mark.avg span { color: ${C.brand}; top: -14px; }
    .code-wrap { margin-top: 10px; border: 1px solid ${C.border}; border-radius: 8px; overflow: hidden; }
    .code-head { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: ${C.soft}; border-bottom: 1px solid ${C.border}; }
    pre.code { border: none; border-radius: 0; max-height: none; margin: 0; padding: 8px 10px; background: #fff; font-size: 9.5px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
    .ln { display: inline-block; width: 26px; color: ${C.faint}; user-select: none; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .section-stats { display: flex; gap: 18px; margin-bottom: 8px; }
    .section-stats .v { color: ${C.ink}; font-size: 15px; font-weight: 700; }
  </style>
</head>
<body>
<div class="page">
  <!-- ═══ BRAND BAR ═══ -->
  <div class="brand">
    <div class="brand-name">WissenCode</div>
    <div class="muted small">Assessment Report · Generated ${formatDate(new Date().toISOString())}</div>
  </div>

  <!-- ═══ CANDIDATE + RESULT ═══ -->
  <div class="hero">
    <div class="who">
      <div class="label">Candidate</div>
      <h1>${escapeHtml(candidate.name)}</h1>
      <dl class="meta">
        <dt>Email</dt><dd>${candidate.email ? escapeHtml(candidate.email) : '<span class="muted">Not on file</span>'}</dd>
        <dt>Assessment</dt><dd>${escapeHtml(assessment.title)}</dd>
        <dt>Submitted</dt><dd>${formatDate(assessment.submitted_at)}</dd>
        <dt>Time limit</dt><dd>${assessment.duration_minutes} minutes</dd>
      </dl>
    </div>
    <div class="result" style="background:${resultBg};border:1px solid ${resultColor}33;">
      ${pill(marks.passed ? 'Passed' : 'Failed', resultColor, '#fff')}
      <div class="result-score" style="color:${resultColor};">${marks.percentage.toFixed(1)}%</div>
      <div class="muted small">Passing score ${marks.passing_score}%</div>
      ${cohort?.rank ? `<div class="rank">Ranked <b>${ordinal(cohort.rank)}</b> of ${cohort.completed_count}${cohort.percentile !== null ? ` · better than ${cohort.percentile}%` : ''}</div>` : ''}
    </div>
  </div>

  <!-- ═══ KEY NUMBERS ═══ -->
  <div class="tiles">
    ${statTile('Marks', `${marks.obtained.toFixed(marks.obtained % 1 ? 1 : 0)} / ${marks.total}`, 'Marks-weighted score')}
    ${statTile('Test cases', `${overall_score.passed} / ${overall_score.total}`, `${overall_score.percentage.toFixed(0)}% passed`)}
    ${statTile('Questions', `${marks.questions_attempted} / ${marks.questions_total}`, 'Attempted')}
    ${statTile('Time taken', formatDuration(marks.time_taken_seconds), `of ${assessment.duration_minutes} min allowed`)}
  </div>

  <!-- ═══ COMPARISON WITH OTHER CANDIDATES ═══ -->
  ${cohort && cohort.completed_count > 0 ? `
  <div class="compare">
    <div class="compare-head">
      <div class="label" style="margin:0;">Compared with ${cohort.completed_count} candidate${cohort.completed_count === 1 ? '' : 's'}</div>
      <div class="muted small">
        Average ${cohort.average_score !== null ? cohort.average_score.toFixed(1) + '%' : '—'}
        · Top ${cohort.highest_score !== null ? cohort.highest_score.toFixed(1) + '%' : '—'}
        · Pass rate ${cohort.pass_rate !== null ? cohort.pass_rate.toFixed(0) + '%' : '—'}
      </div>
    </div>
    ${cohortBar(marks.percentage, marks.passing_score, cohort.average_score, resultColor)}
  </div>` : ''}

  <!-- ═══ INTEGRITY SUMMARY ═══ -->
  <div class="integrity" style="background:${integrityBg};border-color:${integrityColor}33;">
    <div>
      <div class="label">Integrity</div>
      ${concerns.length ? `<ul style="color:${C.ink};">${concerns.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : `<div style="color:${C.ink};font-size:11px;">No tab switches or large pastes during the test.</div>`}
    </div>
    ${pill(integrityLabel, integrityColor, '#fff')}
  </div>

  <!-- ═══ QUESTION SUMMARY ═══ -->
  <h2>Question summary</h2>
  <div class="table-card">
    <table>
      <thead><tr><th>#</th><th>Question</th><th class="right">Tests</th><th class="right">Marks</th><th class="right">Score</th></tr></thead>
      <tbody>${summaryRows || '<tr><td colspan="5" class="empty">No answers submitted</td></tr>'}</tbody>
    </table>
  </div>

  <!-- ═══ QUESTION DETAIL ═══ -->
  <div class="page-break"></div>
  <h2 style="margin-top:0;">Question-wise results</h2>
  ${questionDetails}

  <!-- ═══ INTEGRITY DETAIL ═══ -->
  <div class="avoid-break">
    <h2>Proctoring activity</h2>
    <div class="grid-2">
      <div>
        <div class="section-stats">
          <div><div class="label">Tab switches</div><div class="v" style="color:${tab_switches.limit_exceeded ? C.red : C.ink};">${tab_switches.count} / ${tab_switches.limit}</div></div>
          <div><div class="label">Time away</div><div class="v">${(tab_switches.total_duration_ms / 1000).toFixed(1)}s</div></div>
        </div>
        <div class="table-card">
          <table>
            <thead><tr><th>#</th><th>Left at</th><th class="right">Away</th></tr></thead>
            <tbody>${tabRows}</tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="section-stats">
          <div><div class="label">Pastes</div><div class="v">${paste_events.count}</div></div>
          <div><div class="label">Large pastes</div><div class="v" style="color:${paste_events.large_count ? C.red : C.ink};">${paste_events.large_count}</div></div>
          <div><div class="label">Characters</div><div class="v">${paste_events.total_chars}</div></div>
        </div>
        <div class="table-card">
          <table>
            <thead><tr><th>#</th><th>Time</th><th>Question</th><th class="right">Lines</th><th class="right">Chars</th></tr></thead>
            <tbody>${pasteRows}</tbody>
          </table>
        </div>
      </div>
    </div>
    <p class="muted small" style="margin-top:8px;">⚑ marks pastes of ${paste_events.large_threshold}+ characters. Pastes include text copied from within the editor itself.</p>
  </div>
</div>
</body>
</html>`;
}
