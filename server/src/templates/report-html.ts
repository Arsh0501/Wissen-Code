/**
 * Generates a self-contained HTML string for the assessment report PDF.
 * All styles are inline — no external dependencies needed for Puppeteer rendering.
 */

interface ReportQuestion {
  question_id: number;
  title: string;
  language: string;
  testcases_passed: number;
  testcases_total: number;
  score: number;
  failed_cases: {
    testcase_id: number;
    expected_output: string;
    actual_output: string;
    status: string;
  }[];
}

interface ReportData {
  candidate: { id: string; name: string; email: string };
  assessment: { id: number; title: string; duration_minutes: number; submitted_at: string };
  overall_score: { passed: number; total: number; percentage: number };
  questions: ReportQuestion[];
  // Real data captured during the exam session
  tab_switches: {
    count: number;
    total_duration_ms: number;
    events: { duration_ms: number; occurred_at: string }[];
  };
  integrity_placeholder: {
    is_placeholder: boolean;
    copy_paste: {
      count: number;
      events: { action: string; char_count: number; question_id: string }[];
    };
    screenshots: {
      average_confidence_score: number;
      snapshot_count: number;
      flagged_snapshots: any[];
    };
    plagiarism: { status: string; matches: any[] };
    ai_code_detection: { status: string; flags: any[] };
  };
}

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
    return new Date(dateStr).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return dateStr;
  }
}

function scoreColor(pct: number): string {
  if (pct >= 70) return '#10b981';
  if (pct >= 40) return '#f59e0b';
  return '#ef4444';
}

export function generateReportHTML(data: ReportData): string {
  const { candidate, assessment, overall_score, questions, tab_switches, integrity_placeholder } = data;
  const scoreClr = scoreColor(overall_score.percentage);

  const questionsHTML = questions
    .map((q, idx) => {
      const qScoreClr = scoreColor(q.score);
      const failedHTML = q.failed_cases.length > 0
        ? q.failed_cases.map((fc) => `
          <div style="background:#1e1e2e;border:1px solid #3b3b5c;border-radius:6px;padding:10px;margin-top:8px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="color:#a0a0c0;font-size:11px;">Test Case #${fc.testcase_id}</span>
              <span style="color:#ef4444;font-size:11px;font-weight:600;">${escapeHtml(fc.status.replace(/_/g, ' ').toUpperCase())}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div>
                <div style="color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Expected Output</div>
                <pre style="background:#0d1117;color:#10b981;padding:8px;border-radius:4px;font-size:11px;white-space:pre-wrap;word-break:break-all;margin:0;border:1px solid #1a3a2a;">${escapeHtml(fc.expected_output || '(empty)')}</pre>
              </div>
              <div>
                <div style="color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Actual Output</div>
                <pre style="background:#0d1117;color:#ef4444;padding:8px;border-radius:4px;font-size:11px;white-space:pre-wrap;word-break:break-all;margin:0;border:1px solid #3a1a1a;">${escapeHtml(fc.actual_output || '(no output)')}</pre>
              </div>
            </div>
          </div>
        `).join('')
        : '';

      return `
        <div style="background:#12121f;border:1px solid #2a2a40;border-radius:8px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div>
              <span style="color:#e0e0ff;font-weight:600;font-size:14px;">Q${idx + 1}: ${escapeHtml(q.title)}</span>
              <span style="color:#6b7280;font-size:12px;margin-left:8px;">${escapeHtml(q.language)}</span>
            </div>
            <div style="text-align:right;">
              <span style="color:#a0a0c0;font-size:12px;">${q.testcases_passed}/${q.testcases_total} test cases</span>
              <span style="color:${qScoreClr};font-size:18px;font-weight:700;margin-left:12px;">${q.score.toFixed(0)}%</span>
            </div>
          </div>
          <!-- Test case dots -->
          <div style="display:flex;gap:4px;margin-bottom:${q.failed_cases.length > 0 ? '12' : '0'}px;">
            ${Array.from({ length: q.testcases_total }, (_, i) => {
              const passed = i < q.testcases_passed;
              return `<div style="width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;${
                passed
                  ? 'background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);'
                  : 'background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);'
              }">${passed ? '✓' : '✗'}</div>`;
            }).join('')}
          </div>
          ${failedHTML}
        </div>
      `;
    })
    .join('');

  // Integrity placeholder section
  const ip = integrity_placeholder;
  const tabEventsHTML = tab_switches.events.length === 0
    ? `<tr><td colspan="2" style="padding:6px 10px;color:#6b7280;font-size:12px;">No tab switches detected</td></tr>`
    : tab_switches.events.map((e) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;color:#d0d0e0;font-size:12px;">${(e.duration_ms / 1000).toFixed(1)}s</td>
      <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;color:#a0a0c0;font-size:12px;">${formatDate(e.occurred_at)}</td>
    </tr>
  `).join('');

  const copyEventsHTML = ip.copy_paste.events.map((e) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;color:#d0d0e0;font-size:12px;">${escapeHtml(e.action)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;color:#d0d0e0;font-size:12px;">${e.char_count} chars</td>
      <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;color:#a0a0c0;font-size:12px;">Q${e.question_id}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a14;
      color: #e0e0ff;
      padding: 32px;
      line-height: 1.5;
    }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <!-- ═══ HEADER ═══ -->
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #2a2a50;border-radius:12px;padding:28px;margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="color:#818cf8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Assessment Report</div>
        <div style="font-size:24px;font-weight:700;color:#ffffff;margin-bottom:4px;">${escapeHtml(candidate.name)}</div>
        <div style="color:#a0a0c0;font-size:13px;">${escapeHtml(assessment.title)}</div>
        <div style="color:#6b7280;font-size:12px;margin-top:4px;">
          Duration: ${assessment.duration_minutes} min &nbsp;|&nbsp; Submitted: ${formatDate(assessment.submitted_at)}
        </div>
      </div>
      <div style="text-align:center;background:rgba(0,0,0,0.3);border-radius:12px;padding:16px 24px;border:1px solid #2a2a50;">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Overall Score</div>
        <div style="font-size:36px;font-weight:800;color:${scoreClr};">${overall_score.percentage.toFixed(1)}%</div>
        <div style="color:#a0a0c0;font-size:12px;">${overall_score.passed}/${overall_score.total} test cases passed</div>
      </div>
    </div>
  </div>

  <!-- ═══ QUESTION RESULTS ═══ -->
  <div style="margin-bottom:24px;">
    <h2 style="color:#e0e0ff;font-size:16px;font-weight:600;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #2a2a40;">
      📊 Question-wise Results
    </h2>
    ${questionsHTML}
  </div>

  <div class="page-break"></div>
  <!-- Tab Switches -->
  <div style="background:#12121f;border:1px solid #2a2a40;border-radius:8px;padding:16px;margin-bottom:12px;position:relative;">
    <h3 style="color:#e0e0ff;font-size:14px;font-weight:600;margin-bottom:12px;">🔀 Tab Switch Detection</h3>
    <div style="display:flex;gap:24px;margin-bottom:12px;">
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Total Switches</div>
        <div style="color:#f59e0b;font-size:20px;font-weight:700;">${tab_switches.count}</div>
      </div>
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Total Away Time</div>
        <div style="color:#f59e0b;font-size:20px;font-weight:700;">${(tab_switches.total_duration_ms / 1000).toFixed(1)}s</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #3a3a5c;color:#6b7280;font-size:11px;text-transform:uppercase;">Duration</th>
          <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #3a3a5c;color:#6b7280;font-size:11px;text-transform:uppercase;">Occurred At</th>
        </tr>
      </thead>
      <tbody>${tabEventsHTML}</tbody>
    </table>
  </div>

  <!-- ═══ INTEGRITY PLACEHOLDER BANNER ═══ -->
  <div style="background:linear-gradient(135deg,#78350f,#92400e);border:2px solid #d97706;border-radius:10px;padding:20px;margin-bottom:20px;text-align:center;position:relative;">
    <div style="font-size:18px;font-weight:800;color:#fef3c7;text-transform:uppercase;letter-spacing:2px;">
      ⚠ Integrity &amp; Proctoring Signals
    </div>
    <div style="font-size:14px;color:#fde68a;margin-top:6px;">
      Sample Data for Demonstration Purposes
    </div>
    <div style="font-size:11px;color:#fbbf24;margin-top:4px;">
      The data below is hardcoded placeholder content. These modules are not yet connected to live capture mechanisms.
    </div>
  </div>

  <!-- Copy Paste -->
  <div style="background:#12121f;border:1px solid #2a2a40;border-radius:8px;padding:16px;margin-bottom:12px;position:relative;">
    <div style="position:absolute;top:8px;right:12px;background:#78350f;color:#fde68a;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:1px;">Placeholder</div>
    <h3 style="color:#e0e0ff;font-size:14px;font-weight:600;margin-bottom:12px;">📋 Copy-Paste Detection</h3>
    <div style="margin-bottom:8px;">
      <span style="color:#6b7280;font-size:11px;text-transform:uppercase;">Total Events: </span>
      <span style="color:#f59e0b;font-size:16px;font-weight:700;">${ip.copy_paste.count}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #3a3a5c;color:#6b7280;font-size:11px;text-transform:uppercase;">Action</th>
          <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #3a3a5c;color:#6b7280;font-size:11px;text-transform:uppercase;">Size</th>
          <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #3a3a5c;color:#6b7280;font-size:11px;text-transform:uppercase;">Question</th>
        </tr>
      </thead>
      <tbody>${copyEventsHTML}</tbody>
    </table>
  </div>

  <!-- Screenshot Confidence -->
  <div style="background:#12121f;border:1px solid #2a2a40;border-radius:8px;padding:16px;margin-bottom:12px;position:relative;">
    <div style="position:absolute;top:8px;right:12px;background:#78350f;color:#fde68a;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:1px;">Placeholder</div>
    <h3 style="color:#e0e0ff;font-size:14px;font-weight:600;margin-bottom:12px;">📸 Screenshot Monitoring</h3>
    <div style="display:flex;gap:24px;">
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Snapshots Captured</div>
        <div style="color:#10b981;font-size:20px;font-weight:700;">${ip.screenshots.snapshot_count}</div>
      </div>
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Avg Confidence Score</div>
        <div style="color:#10b981;font-size:20px;font-weight:700;">${(ip.screenshots.average_confidence_score * 100).toFixed(0)}%</div>
      </div>
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Flagged Snapshots</div>
        <div style="color:#10b981;font-size:20px;font-weight:700;">${ip.screenshots.flagged_snapshots.length}</div>
      </div>
    </div>
  </div>

  <!-- Plagiarism -->
  <div style="background:#12121f;border:1px solid #2a2a40;border-radius:8px;padding:16px;margin-bottom:12px;position:relative;">
    <div style="position:absolute;top:8px;right:12px;background:#78350f;color:#fde68a;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:1px;">Placeholder</div>
    <h3 style="color:#e0e0ff;font-size:14px;font-weight:600;margin-bottom:8px;">🔍 Plagiarism Detection</h3>
    <div style="display:flex;gap:24px;">
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Status</div>
        <div style="color:#10b981;font-size:14px;font-weight:600;">${escapeHtml(ip.plagiarism.status)}</div>
      </div>
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Matches Found</div>
        <div style="color:#10b981;font-size:14px;font-weight:600;">${ip.plagiarism.matches.length}</div>
      </div>
    </div>
  </div>

  <!-- AI Code Detection -->
  <div style="background:#12121f;border:1px solid #2a2a40;border-radius:8px;padding:16px;margin-bottom:12px;position:relative;">
    <div style="position:absolute;top:8px;right:12px;background:#78350f;color:#fde68a;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:1px;">Placeholder</div>
    <h3 style="color:#e0e0ff;font-size:14px;font-weight:600;margin-bottom:8px;">🤖 AI-Generated Code Detection</h3>
    <div style="display:flex;gap:24px;">
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Status</div>
        <div style="color:#10b981;font-size:14px;font-weight:600;">${escapeHtml(ip.ai_code_detection.status)}</div>
      </div>
      <div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Flags Raised</div>
        <div style="color:#10b981;font-size:14px;font-weight:600;">${ip.ai_code_detection.flags.length}</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;color:#4a4a6a;font-size:10px;margin-top:24px;padding-top:12px;border-top:1px solid #1a1a30;">
    Generated by WissenCode Assessment Platform &nbsp;|&nbsp; ${new Date().toISOString()}
  </div>
</body>
</html>`;
}
