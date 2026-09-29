import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getReportData, downloadReportPdf } from '../../services/api';
import { PassFailBadge, formatDuration } from '../../components/ui';
import {
  Code2, Download, CheckCircle, XCircle,
  BarChart3, AlertTriangle, Shield, ShieldCheck, EyeOff, ClipboardPaste, Clock,
  ChevronDown, Copy, Check, Users, Target, ListChecks, FileText,
} from 'lucide-react';

interface FailedCase {
  testcase_id: number;
  expected_output: string;
  actual_output: string;
  status: string;
}

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
  failed_cases: FailedCase[];
}

interface ReportDataType {
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

export default function CandidateReport() {
  const { candidateName, assessmentId } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const [report, setReport] = useState<ReportDataType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Route guard: admin only
  useEffect(() => {
    if (role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [role, navigate]);

  useEffect(() => {
    if (!candidateName || !assessmentId || role !== 'admin') return;
    loadReport();
  }, [candidateName, assessmentId, role]);

  async function loadReport() {
    try {
      setLoading(true);
      setError('');
      const data = await getReportData(candidateName!, parseInt(assessmentId!));
      setReport(data);
    } catch (err: any) {
      console.error('Failed to load report:', err);
      setError(
        err?.response?.status === 403
          ? 'Access denied. Admin role required.'
          : err?.response?.status === 404
          ? 'No submissions found for this candidate.'
          : 'Failed to load report data.'
      );
    } finally {
      setLoading(false);
    }
  }

  const handleDownload = useCallback(async () => {
    if (!candidateName || !assessmentId) return;
    setDownloading(true);
    try {
      const blob = await downloadReportPdf(candidateName, parseInt(assessmentId));
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `report-${candidateName}-assessment-${assessmentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoking immediately can cancel the download in some browsers (e.g. Safari)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download report. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [candidateName, assessmentId]);

  if (role !== 'admin') return null;

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return dateStr;
    }
  }

  if (loading) {
    return (
      <div className="text-center py-24">
        <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-surface-500 text-sm">Loading report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-md mx-auto card text-center py-12 mt-10">
        <AlertTriangle className="w-10 h-10 text-red-600 mx-auto mb-3" />
        <p className="text-red-700 mb-4">{error || 'Report not available.'}</p>
        <button onClick={loadReport} className="btn-outline">Retry</button>
      </div>
    );
  }

  const { candidate, assessment, marks, overall_score, cohort, questions } = report;
  const resultTone = marks.passed
    ? { text: 'text-emerald-600', panel: 'bg-emerald-500/[0.07] ring-emerald-500/20', bar: 'bg-emerald-500' }
    : { text: 'text-red-600', panel: 'bg-red-500/[0.07] ring-red-500/20', bar: 'bg-red-500' };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* ═══ HERO: candidate + result ═══ */}
      <section className="card p-0 overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-primary-500/10 text-primary-700 flex items-center justify-center text-lg font-bold shrink-0">
                  {initials(candidate.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-primary-600 uppercase tracking-wider">Candidate report</p>
                  <h1 className="text-2xl font-bold text-white leading-tight break-words">{candidate.name}</h1>
                  {candidate.email ? (
                    <a href={`mailto:${candidate.email}`} className="text-sm text-surface-500 hover:text-primary-700">{candidate.email}</a>
                  ) : (
                    <span className="text-sm text-surface-500">No email on file</span>
                  )}
                </div>
              </div>
              <button onClick={handleDownload} disabled={downloading} className="btn-primary shrink-0" id="download-report-btn">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">{downloading ? 'Generating PDF...' : 'Download PDF'}</span>
              </button>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mt-6 pt-5 border-t border-surface-800 text-sm">
              <Detail label="Assessment" value={assessment.title} wide />
              <Detail label="Submitted" value={formatDate(assessment.submitted_at)} />
              <Detail label="Time limit" value={`${assessment.duration_minutes} minutes`} />
            </dl>
          </div>

          {/* Result panel */}
          <div className={`md:w-64 p-6 ring-1 ring-inset flex flex-col items-center justify-center text-center ${resultTone.panel}`}>
            <PassFailBadge passed={marks.passed} />
            <div className={`text-5xl font-extrabold tabular-nums tracking-tight mt-3 ${resultTone.text}`}>
              {marks.percentage.toFixed(1)}<span className="text-2xl">%</span>
            </div>
            <p className="text-xs text-surface-500 mt-1">Passing score {marks.passing_score}%</p>
            {cohort?.rank && (
              <p className="text-xs text-surface-400 mt-3 pt-3 border-t border-surface-700/60 w-full">
                Ranked <span className="font-semibold text-white">{ordinal(cohort.rank)}</span> of {cohort.completed_count}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ═══ KEY NUMBERS ═══ */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Target} label="Marks" value={`${formatMarks(marks.obtained)} / ${marks.total}`} hint="Marks-weighted score" />
        <StatTile icon={ListChecks} label="Test cases" value={`${overall_score.passed} / ${overall_score.total}`} hint={`${overall_score.percentage.toFixed(0)}% passed`} />
        <StatTile icon={FileText} label="Questions" value={`${marks.questions_attempted} / ${marks.questions_total}`} hint="Attempted" />
        <StatTile icon={Clock} label="Time taken" value={formatDuration(marks.time_taken_seconds)} hint={`of ${assessment.duration_minutes} min allowed`} />
      </section>

      {/* ═══ COMPARISON + INTEGRITY ═══ */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className={cohort && cohort.completed_count > 0 ? 'lg:col-span-2' : 'hidden'}>
          {cohort && cohort.completed_count > 0 && (
            <ComparisonCard score={marks.percentage} passing={marks.passing_score} passed={marks.passed} cohort={cohort} />
          )}
        </div>
        <IntegrityCard report={report} className={cohort && cohort.completed_count > 0 ? '' : 'lg:col-span-3'} />
      </section>

      {/* ═══ QUESTION SUMMARY ═══ */}
      <section className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-600" /> Question summary
          </h2>
          <span className="text-xs text-surface-500">Click a question for details</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-surface-500 uppercase tracking-wider border-b border-surface-800 bg-surface-950">
                <th className="text-left font-medium px-5 py-2.5 w-10 hidden sm:table-cell">#</th>
                <th className="text-left font-medium pl-5 sm:pl-3 pr-3 py-2.5">Question</th>
                <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Language</th>
                <th className="text-right font-medium px-3 py-2.5 hidden sm:table-cell">Tests</th>
                <th className="text-right font-medium px-3 py-2.5">Marks</th>
                <th className="text-right font-medium px-5 py-2.5 sm:w-40">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {questions.map((q, i) => (
                <tr key={q.question_id} className="hover:bg-surface-950 cursor-pointer" onClick={() => document.getElementById(`q-${q.question_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <td className="px-5 py-3 text-surface-500 tabular-nums hidden sm:table-cell">{i + 1}</td>
                  <td className="pl-5 sm:pl-3 pr-3 py-3 font-medium text-white">{q.title}</td>
                  <td className="px-3 py-3 text-surface-400 hidden md:table-cell">{q.attempted ? q.language : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-surface-300 hidden sm:table-cell">{q.attempted ? `${q.testcases_passed}/${q.testcases_total}` : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-surface-300">{formatMarks(q.marks_obtained)} / {q.marks}</td>
                  <td className="px-5 py-3">
                    {q.attempted ? <ScoreBar pct={q.score} /> : <div className="text-right"><span className="badge bg-surface-800 text-surface-500 ring-1 ring-surface-700">Skipped</span></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══ QUESTION DETAILS ═══ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Question details</h2>
        {questions.map((q, i) => <QuestionCard key={q.question_id} q={q} index={i} />)}
      </section>

      {/* ═══ PROCTORING ACTIVITY ═══ */}
      <section id="proctoring" className="scroll-mt-20">
        <ProctoringSection report={report} formatDate={formatDate} />
      </section>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

// Marks can be fractional (partial test-case credit) — show at most one decimal, and none for whole numbers
function formatMarks(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function scoreText(pct: number): string {
  if (pct >= 70) return 'text-emerald-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function scoreFill(pct: number): string {
  if (pct >= 70) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function Detail({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">{label}</dt>
      <dd className="text-surface-100 mt-0.5">{value}</dd>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 text-surface-500" />
      </div>
      <div className="text-2xl font-bold text-white tabular-nums mt-1.5">{value}</div>
      <div className="text-xs text-surface-500 mt-0.5">{hint}</div>
    </div>
  );
}

function ScoreBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <div className="hidden sm:block w-20 h-1.5 rounded-full bg-surface-800 overflow-hidden">
        <div className={`h-full rounded-full ${scoreFill(pct)}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className={`w-10 text-right font-semibold tabular-nums ${scoreText(pct)}`}>{pct.toFixed(0)}%</span>
    </div>
  );
}

// Integrity verdict at a glance, linking down to the full proctoring log
function IntegrityCard({ report, className = '' }: { report: ReportDataType; className?: string }) {
  const { tab_switches: tabs, paste_events: pastes } = report;
  const needsReview = tabs.limit_exceeded || pastes.large_count > 0;
  const minor = !needsReview && (tabs.count > 0 || pastes.count > 0);
  const tone = needsReview
    ? { label: 'Review recommended', icon: AlertTriangle, box: 'bg-red-500/[0.06] ring-red-500/20', text: 'text-red-700', iconText: 'text-red-600' }
    : minor
      ? { label: 'Minor activity', icon: Shield, box: 'bg-amber-500/[0.06] ring-amber-500/20', text: 'text-amber-700', iconText: 'text-amber-600' }
      : { label: 'No concerns', icon: ShieldCheck, box: 'bg-emerald-500/[0.06] ring-emerald-500/20', text: 'text-emerald-700', iconText: 'text-emerald-600' };
  const Icon = tone.icon;
  const rows = [
    { label: 'Tab switches', value: `${tabs.count} / ${tabs.limit}`, alert: tabs.limit_exceeded },
    { label: 'Pastes', value: String(pastes.count), alert: false },
    { label: `Large pastes (${pastes.large_threshold}+ chars)`, value: String(pastes.large_count), alert: pastes.large_count > 0 },
  ];
  return (
    <div className={`rounded-xl ring-1 ring-inset p-5 flex flex-col ${tone.box} ${className}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${tone.iconText}`} />
        <h3 className={`text-sm font-semibold ${tone.text}`}>{tone.label}</h3>
      </div>
      {tabs.limit_exceeded && <p className="text-xs text-red-700 mt-1">Tab-switch limit reached. The test was auto-submitted.</p>}
      <dl className="mt-3 space-y-2 text-sm flex-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <dt className="text-surface-400">{r.label}</dt>
            <dd className={`font-semibold tabular-nums ${r.alert ? 'text-red-600' : 'text-white'}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <a href="#proctoring" className="text-xs font-medium text-primary-600 hover:text-primary-700 mt-3">View activity log →</a>
    </div>
  );
}

// Failed cases shown before the "show all" toggle, so long lists don't dominate the page
const FAILED_PREVIEW = 3;

function QuestionCard({ q, index }: { q: ReportQuestion; index: number }) {
  const [showAll, setShowAll] = useState(false);

  if (!q.attempted) {
    return (
      <div id={`q-${q.question_id}`} className="card p-5 bg-surface-950 flex items-center justify-between gap-4 scroll-mt-20">
        <div className="flex items-center gap-3 min-w-0">
          <QuestionNumber n={index + 1} muted />
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate">{q.title}</h3>
            <p className="text-xs text-surface-500">Not attempted. No code was submitted.</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="badge bg-surface-800 text-surface-500 ring-1 ring-surface-700">Skipped</span>
          <div className="text-xs text-surface-500 mt-1 tabular-nums">0 / {q.marks} marks</div>
        </div>
      </div>
    );
  }

  const failed = showAll ? q.failed_cases : q.failed_cases.slice(0, FAILED_PREVIEW);
  const hiddenCount = q.failed_cases.length - FAILED_PREVIEW;

  return (
    <div id={`q-${q.question_id}`} className="card p-0 overflow-hidden scroll-mt-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3 min-w-0">
          <QuestionNumber n={index + 1} />
          <div className="min-w-0">
            <h3 className="font-semibold text-white">{q.title}</h3>
            <p className="text-xs text-surface-500 mt-0.5">
              {q.language} · {q.testcases_passed} of {q.testcases_total} test cases passed
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold tabular-nums leading-none ${scoreText(q.score)}`}>{q.score.toFixed(0)}%</div>
          <div className="text-xs text-surface-500 mt-1 tabular-nums">{formatMarks(q.marks_obtained)} / {q.marks} marks</div>
        </div>
      </div>

      {/* Test-case strip */}
      <div className="px-5 pb-4 flex flex-wrap gap-1.5" aria-label={`${q.testcases_passed} of ${q.testcases_total} test cases passed`}>
        {Array.from({ length: q.testcases_total }, (_, i) => {
          const ok = i < q.testcases_passed;
          return (
            <span
              key={i}
              className={`w-6 h-6 rounded-md flex items-center justify-center ${ok ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/25' : 'bg-red-500/10 text-red-600 ring-1 ring-red-500/25'}`}
            >
              {ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            </span>
          );
        })}
      </div>

      {/* Failed cases — compact table */}
      {q.failed_cases.length > 0 && (
        <div className="border-t border-surface-800">
          <div className="px-5 py-2.5 text-[11px] font-semibold text-surface-500 uppercase tracking-wider bg-surface-950">
            Failed test cases ({q.failed_cases.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-surface-500 uppercase tracking-wider border-b border-surface-800">
                  <th className="text-left font-medium px-5 py-2 w-20 hidden sm:table-cell">Case</th>
                  <th className="text-left font-medium pl-5 sm:pl-3 pr-3 py-2 sm:w-36">Verdict</th>
                  <th className="text-left font-medium px-3 py-2">Expected</th>
                  <th className="text-left font-medium px-5 py-2">Actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {failed.map((fc) => (
                  <tr key={fc.testcase_id} className="align-top">
                    <td className="px-5 py-2.5 text-surface-500 tabular-nums hidden sm:table-cell">#{fc.testcase_id}</td>
                    <td className="pl-5 sm:pl-3 pr-3 py-2.5">
                      <span className="badge bg-red-500/10 text-red-700 ring-1 ring-red-500/20 whitespace-nowrap">{verdictLabel(fc.status)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <pre className="font-mono text-emerald-700 whitespace-pre-wrap break-all max-h-32 overflow-y-auto [font-variant-ligatures:none]">{fc.expected_output || '(empty)'}</pre>
                    </td>
                    <td className="px-5 py-2.5">
                      <pre className="font-mono text-red-700 whitespace-pre-wrap break-all max-h-32 overflow-y-auto [font-variant-ligatures:none]">{fc.actual_output || '(no output)'}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full px-5 py-2 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-surface-950 border-t border-surface-800 flex items-center justify-center gap-1 cursor-pointer"
            >
              {showAll ? 'Show fewer' : `Show ${hiddenCount} more failed case${hiddenCount === 1 ? '' : 's'}`}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      <div className="px-5 pb-5 pt-1">
        <CodeViewer code={q.code} language={q.language} />
      </div>
    </div>
  );
}

function QuestionNumber({ n, muted }: { n: number; muted?: boolean }) {
  return (
    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 ${muted ? 'bg-surface-800 text-surface-500' : 'bg-primary-500/10 text-primary-700'}`}>
      Q{n}
    </span>
  );
}

function verdictLabel(status: string): string {
  const s = status.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Tab switches + pastes captured during the exam, with an overall verdict for the reviewer
function ProctoringSection({ report, formatDate }: { report: ReportDataType; formatDate: (d: string) => string }) {
  const { tab_switches: tabs, paste_events: pastes } = report;
  const needsReview = tabs.limit_exceeded || pastes.large_count > 0;
  const minor = !needsReview && (tabs.count > 0 || pastes.count > 0);
  const verdict = needsReview
    ? { label: 'Review recommended', className: 'bg-red-500/10 text-red-700 ring-red-500/25', icon: AlertTriangle, iconClass: 'text-red-600' }
    : minor
      ? { label: 'Minor activity', className: 'bg-amber-500/10 text-amber-700 ring-amber-500/25', icon: Shield, iconClass: 'text-amber-600' }
      : { label: 'No concerns', className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25', icon: ShieldCheck, iconClass: 'text-emerald-600' };
  const VerdictIcon = verdict.icon;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <VerdictIcon className={`w-5 h-5 ${verdict.iconClass}`} /> Proctoring activity
        </h3>
        <span className={`badge ring-1 ${verdict.className}`}>{verdict.label}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tab switches */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
            <h4 className="font-medium text-white text-sm flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-surface-500" /> Tab switches
            </h4>
            {tabs.limit_exceeded ? (
              <span className="badge bg-red-500/10 text-red-700 ring-1 ring-red-500/25">Limit reached · auto-submitted</span>
            ) : (
              <span className="badge bg-surface-800 text-surface-500 ring-1 ring-surface-700 tabular-nums">{tabs.count}/{tabs.limit} allowed</span>
            )}
          </div>
          <div className="grid grid-cols-2 divide-x divide-surface-800 border-b border-surface-800">
            <Metric label="Switches" value={tabs.count} alert={tabs.limit_exceeded} />
            <Metric label="Time away" value={`${(tabs.total_duration_ms / 1000).toFixed(1)}s`} />
          </div>
          <EventList
            empty="No tab switches detected"
            rows={tabs.events.map((e, i) => ({
              key: i,
              left: <span className="text-surface-300">Left the test</span>,
              right: <><span className="tabular-nums text-surface-100 font-medium">{(e.duration_ms / 1000).toFixed(1)}s</span> away</>,
              time: formatDate(e.occurred_at),
            }))}
          />
        </div>

        {/* Pastes */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
            <h4 className="font-medium text-white text-sm flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4 text-surface-500" /> Code pastes
            </h4>
            <span className="text-xs text-surface-500">Large = {pastes.large_threshold}+ characters</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-surface-800 border-b border-surface-800">
            <Metric label="Pastes" value={pastes.count} />
            <Metric label="Large" value={pastes.large_count} alert={pastes.large_count > 0} />
            <Metric label="Characters" value={pastes.total_chars} />
          </div>
          <EventList
            empty="No pastes detected"
            rows={pastes.events.map((e, i) => {
              const large = e.char_count >= pastes.large_threshold;
              return {
                key: i,
                left: <span className="text-surface-300 truncate">{e.question_title}</span>,
                right: (
                  <span className={large ? 'text-red-700 font-semibold' : ''}>
                    <span className="tabular-nums">{e.char_count}</span> chars · {e.line_count} line{e.line_count === 1 ? '' : 's'}
                    {large && <span className="badge bg-red-500/10 text-red-700 ring-1 ring-red-500/25 ml-2">Large</span>}
                  </span>
                ),
                time: formatDate(e.occurred_at),
              };
            })}
          />
        </div>
      </div>
      <p className="text-xs text-surface-500 mt-2">
        Only the size of each paste is recorded, never its content. Pastes include text copied from within the editor itself.
      </p>
    </div>
  );
}

function Metric({ label, value, alert }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${alert ? 'text-red-600' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function EventList({ rows, empty }: { rows: { key: number; left: React.ReactNode; right: React.ReactNode; time: string }[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-surface-500 text-center py-6">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-surface-800 max-h-64 overflow-y-auto">
      {rows.map((r) => (
        <li key={r.key} className="px-4 py-2.5 text-xs flex items-center justify-between gap-3">
          <div className="min-w-0 flex flex-col">
            {r.left}
            <span className="text-surface-500">{r.time}</span>
          </div>
          <div className="text-surface-500 shrink-0 text-right">{r.right}</div>
        </li>
      ))}
    </ul>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th';
  return `${n}${suffix}`;
}

// Candidate's score on a 0–100 track, with the pass mark and cohort average marked
function ComparisonCard({
  score,
  passing,
  passed,
  cohort,
}: {
  score: number;
  passing: number;
  passed: boolean;
  cohort: NonNullable<ReportDataType['cohort']>;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const pct = (n: number | null, digits = 1) => (n === null ? '—' : `${n.toFixed(digits)}%`);
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-600" /> Compared with {cohort.completed_count} candidate{cohort.completed_count === 1 ? '' : 's'}
          </h3>
          {cohort.percentile !== null && (
            <p className="text-xs text-surface-500 mt-1">Scored higher than {cohort.percentile}% of the other candidates</p>
          )}
        </div>
        <div className="flex gap-6 text-right">
          {[
            { label: 'Average', value: pct(cohort.average_score) },
            { label: 'Top score', value: pct(cohort.highest_score) },
            { label: 'Pass rate', value: pct(cohort.pass_rate, 0) },
          ].map((m) => (
            <div key={m.label}>
              <div className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">{m.label}</div>
              <div className="text-base font-bold text-white tabular-nums">{m.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative h-2.5 rounded-full bg-surface-800 mt-9 mb-8 mx-1">
        <div
          className={`h-full rounded-full ${passed ? 'bg-emerald-500' : 'bg-red-500'}`}
          style={{ width: `${clamp(score)}%` }}
        />
        <Marker at={clamp(passing)} label={`Pass ${passing}%`} className="bg-surface-100 text-surface-200" below />
        {cohort.average_score !== null && (
          <Marker at={clamp(cohort.average_score)} label={`Avg ${cohort.average_score.toFixed(0)}%`} className="bg-primary-600 text-primary-700" />
        )}
      </div>
    </div>
  );
}

function Marker({ at, label, className, below }: { at: number; label: string; className: string; below?: boolean }) {
  const [bg, text] = className.split(' ');
  // Near either end, anchor the label to that side so it never spills outside the card
  const anchor = at < 12 ? 'left-0' : at > 88 ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div className={`absolute -top-1 w-0.5 h-[18px] ${bg}`} style={{ left: `${at}%` }}>
      <span className={`absolute ${anchor} whitespace-nowrap text-[10px] font-semibold ${text} ${below ? 'top-5' : '-top-4'}`}>
        {label}
      </span>
    </div>
  );
}

// Collapsible, line-numbered view of the candidate's submitted code
function CodeViewer({ code, language }: { code: string; language: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!code.trim()) return null;
  const lines = code.replace(/\s+$/, '').split('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure context) — nothing useful to do
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-surface-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface-950 hover:bg-surface-800/60 transition-colors text-left cursor-pointer"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-medium text-surface-300">
          <Code2 className="w-3.5 h-3.5 text-surface-500" /> Submitted code
          <span className="text-surface-500 font-normal">· {language} · {lines.length} line{lines.length === 1 ? '' : 's'}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-surface-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="relative border-t border-surface-800">
          <button
            type="button"
            onClick={copy}
            className="absolute top-2 right-2 btn-ghost text-xs px-2 py-1 bg-surface-900/90"
            title="Copy code"
          >
            {copied ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </button>
          <pre className="text-xs font-mono leading-relaxed overflow-x-auto max-h-96 py-3 bg-surface-900 [font-variant-ligatures:none]">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="w-10 shrink-0 pr-3 text-right text-surface-600 select-none">{i + 1}</span>
                <span className="text-surface-100 whitespace-pre pr-4">{line || ' '}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}
