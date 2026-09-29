import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAssessments, retakeAssessment, apiError } from '../../services/api';
import { formatDate, formatDuration, Spinner } from '../../components/ui';
import type { Assessment } from '../../types';
import {
  Clock, FileText, ChevronRight, Zap, Target, Calendar, CheckCircle, PlayCircle, Lock,
  ShieldCheck, Sparkles, Trophy, Timer, TrendingUp, EyeOff, ClipboardPaste, Save, XCircle, RotateCcw,
  type LucideIcon,
} from 'lucide-react';

type Tone = { pill: string; stripe: string };

function statusFor(a: Assessment): { label: string } & Tone {
  if (a.candidateStatus === 'completed') return { label: 'Completed', pill: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25', stripe: 'bg-emerald-500' };
  if (a.candidateStatus === 'in-progress') return { label: 'In progress', pill: 'bg-sky-500/10 text-sky-700 ring-sky-500/25', stripe: 'bg-sky-500' };
  if (a.availability === 'open') return { label: 'Open now', pill: 'bg-primary-500/10 text-primary-700 ring-primary-500/25', stripe: 'bg-primary-500' };
  if (a.availability === 'upcoming') return { label: 'Scheduled', pill: 'bg-amber-500/10 text-amber-700 ring-amber-500/25', stripe: 'bg-amber-400' };
  return { label: 'Closed', pill: 'bg-surface-800 text-surface-500 ring-surface-700', stripe: 'bg-surface-700' };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// "in 3 days", "in 5 hours", "in 12 minutes"
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const units: [number, string][] = [[86400000, 'day'], [3600000, 'hour'], [60000, 'minute']];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size);
      const label = `${n} ${unit}${n === 1 ? '' : 's'}`;
      return ms >= 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return ms >= 0 ? 'in under a minute' : 'just now';
}

function minutesLeft(seconds: number | null | undefined): string {
  if (!seconds) return 'time almost up';
  const m = Math.ceil(seconds / 60);
  return `${m} min left`;
}

function scoreText(pct: number) {
  return pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600';
}

function scoreFill(pct: number) {
  return pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
}

export default function ExamDashboard() {
  const { candidateName } = useAuth();
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAssessments()
      .then(setAssessments)
      .catch((err) => setError(apiError(err, 'Failed to load assessments')))
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(() => {
    // Actionable tests first: in progress, then open (soonest deadline first), then scheduled, then closed
    const rank = (a: Assessment) =>
      a.candidateStatus === 'in-progress' ? 0 : a.availability === 'open' ? 1 : a.availability === 'upcoming' ? 2 : 3;
    const deadline = (a: Assessment) => (a.endAt ? new Date(a.endAt).getTime() : Infinity);
    const pending = assessments
      .filter((a) => a.candidateStatus !== 'completed')
      .sort((x, y) => rank(x) - rank(y) || deadline(x) - deadline(y));
    const upNext = pending.filter((a) => rank(a) < 3);
    const missed = pending.filter((a) => rank(a) === 3);
    const completed = assessments
      .filter((a) => a.candidateStatus === 'completed')
      .sort((x, y) => (y.finishedAt || y.startedAt || '').localeCompare(x.finishedAt || x.startedAt || ''));

    const scored = completed.filter((a) => a.result);
    const average = scored.length ? scored.reduce((s, a) => s + a.result!.percentage, 0) / scored.length : null;
    const passed = scored.filter((a) => a.result!.passed).length;
    const timeSpent = completed.reduce((s, a) => s + (a.result?.timeTakenSeconds ?? 0), 0);
    const best = scored.length ? Math.max(...scored.map((a) => a.result!.percentage)) : null;
    const inProgress = pending.find((a) => a.candidateStatus === 'in-progress') ?? null;
    const nextOpen = pending.find((a) => a.candidateStatus !== 'in-progress' && a.availability === 'open') ?? null;

    return { upNext, missed, completed, scored, average, passed, timeSpent, best, inProgress, nextOpen };
  }, [assessments]);

  const firstName = candidateName?.split(' ')[0] || 'there';

  if (loading) return <Spinner label="Loading your dashboard..." />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden rounded-2xl border border-primary-500/15 bg-gradient-to-br from-primary-50 via-surface-900 to-sky-50 p-6 md:p-8">
        <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-500/10 rounded-full px-2.5 py-1 mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Candidate portal
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{greeting()}, {firstName}</h1>
            <p className="text-surface-500 text-sm mt-2 max-w-xl">
              {data.inProgress
                ? 'You have a test in progress. Your timer is still running.'
                : data.nextOpen
                  ? `You have ${data.upNext.filter((a) => a.availability === 'open').length} test${data.upNext.filter((a) => a.availability === 'open').length === 1 ? '' : 's'} open right now.`
                  : 'You’re all caught up. New tests will appear here when they open.'}
            </p>
          </div>
          {data.inProgress ? (
            <NextAction
              title={data.inProgress.name}
              meta={minutesLeft(data.inProgress.remainingSeconds)}
              label="Resume test"
              icon={PlayCircle}
              urgent
              onClick={() => navigate(`/exam/${data.inProgress!.id}`)}
            />
          ) : data.nextOpen ? (
            <NextAction
              title={data.nextOpen.name}
              meta={`${data.nextOpen.timeLimitMinutes} min · ${data.nextOpen._count?.questions ?? 0} questions${data.nextOpen.endAt ? ` · closes ${relativeTime(data.nextOpen.endAt)}` : ''}`}
              label="Start test"
              icon={Zap}
              onClick={() => navigate(`/exam/${data.nextOpen!.id}`)}
            />
          ) : null}
        </div>
      </section>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">{error}</div>}

      {/* ═══ STATS ═══ */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={CheckCircle} tone="bg-emerald-500/10 text-emerald-700" label="Completed" value={String(data.completed.length)} hint={`of ${assessments.length} assessment${assessments.length === 1 ? '' : 's'}`} />
        <Stat icon={Target} tone="bg-primary-500/10 text-primary-700" label="Average score" value={data.average === null ? '—' : `${data.average.toFixed(0)}%`} hint={data.best === null ? 'No results yet' : `Best ${data.best.toFixed(0)}%`} />
        <Stat icon={Trophy} tone="bg-amber-500/10 text-amber-700" label="Passed" value={data.scored.length ? `${data.passed} / ${data.scored.length}` : '—'} hint="Tests with results" />
        <Stat icon={Timer} tone="bg-sky-500/10 text-sky-700" label="Time on tests" value={data.timeSpent ? formatDuration(data.timeSpent) : '—'} hint="Across completed tests" />
      </section>

      {/* ═══ MAIN GRID ═══ */}
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* Up next */}
          <section>
            <SectionHeader title="Up next" count={data.upNext.length} />
            {data.upNext.length === 0 ? (
              <EmptyCard icon={Calendar} title="Nothing scheduled" body="When an admin opens a new assessment for you, it will show up here." />
            ) : (
              <div className="space-y-3">{data.upNext.map((a) => <UpcomingCard key={a.id} a={a} onOpen={() => navigate(`/exam/${a.id}`)} />)}</div>
            )}
          </section>

          {/* Completed */}
          <section>
            <SectionHeader title="Completed" count={data.completed.length} />
            {data.completed.length === 0 ? (
              <EmptyCard icon={FileText} title="No completed tests yet" body="Your results will appear here after you submit a test." />
            ) : (
              <div className="card p-0 overflow-hidden divide-y divide-surface-800">
                {data.completed.map((a) => <CompletedRow key={a.id} a={a} />)}
              </div>
            )}
          </section>

          {data.missed.length > 0 && (
            <section>
              <SectionHeader title="Closed" count={data.missed.length} />
              <div className="card p-0 overflow-hidden divide-y divide-surface-800">
                {data.missed.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-300 truncate">{a.name}</p>
                      <p className="text-xs text-surface-500">{a.endAt ? `Closed ${formatDate(a.endAt, false)}` : 'No longer available'}</p>
                    </div>
                    <span className="badge bg-surface-800 text-surface-500 ring-1 ring-surface-700 gap-1 shrink-0"><Lock className="w-3 h-3" /> Closed</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Side column */}
        <aside className="space-y-6 min-w-0">
          <PerformanceCard completed={data.completed} />
          <RulesCard />
        </aside>
      </div>
    </div>
  );
}

function NextAction({ title, meta, label, icon: Icon, urgent, onClick }: {
  title: string; meta: string; label: string; icon: LucideIcon; urgent?: boolean; onClick: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-900/90 ring-1 ring-surface-800 p-4 md:w-80 shrink-0 shadow-sm">
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${urgent ? 'text-sky-700' : 'text-primary-600'}`}>
        {urgent ? 'Continue where you left off' : 'Recommended next'}
      </p>
      <p className="text-sm font-semibold text-white mt-1 truncate">{title}</p>
      <p className={`text-xs mt-0.5 ${urgent ? 'text-sky-700 font-medium' : 'text-surface-500'}`}>{meta}</p>
      <button type="button" onClick={onClick} className="btn-primary w-full mt-3 text-sm">
        <Icon className="w-4 h-4" /> {label}
      </button>
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon; tone: string; label: string; value: string; hint: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-white mt-2 tabular-nums tracking-tight">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-xs text-surface-500 mt-3 pt-3 border-t border-surface-800">{hint}</p>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <span className="text-xs text-surface-500 tabular-nums">{count}</span>
    </div>
  );
}

function EmptyCard({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="card text-center py-10">
      <div className="w-12 h-12 rounded-xl bg-surface-800 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6 text-surface-500" />
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-surface-500 mt-1">{body}</p>
    </div>
  );
}

function UpcomingCard({ a, onOpen }: { a: Assessment; onOpen: () => void }) {
  const status = statusFor(a);
  const inProgress = a.candidateStatus === 'in-progress';
  const open = inProgress || a.availability === 'open';
  const when = inProgress
    ? { icon: Clock, text: minutesLeft(a.remainingSeconds), className: 'text-sky-700 font-medium' }
    : a.availability === 'upcoming'
      ? { icon: Calendar, text: `Opens ${relativeTime(a.startAt)} · ${formatDate(a.startAt)}`, className: 'text-amber-700' }
      : a.endAt
        ? { icon: Calendar, text: `Closes ${relativeTime(a.endAt)} · ${formatDate(a.endAt)}`, className: 'text-surface-400' }
        : { icon: Calendar, text: 'No deadline', className: 'text-surface-500' };
  const WhenIcon = when.icon;

  return (
    <div
      className={`card relative overflow-hidden p-0 group transition-all duration-200 ${open ? 'cursor-pointer hover:shadow-md hover:shadow-surface-700/30 hover:border-primary-500/40' : ''}`}
      onClick={() => open && onOpen()}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${status.stripe}`} aria-hidden="true" />
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 pl-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white group-hover:text-primary-700 transition-colors">{a.name}</h3>
            <span className={`badge ring-1 ${status.pill}`}>{status.label}</span>
          </div>
          {a.description && <p className="text-sm text-surface-500 mt-1 line-clamp-1">{a.description}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-surface-500">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {a.timeLimitMinutes} min</span>
            <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {a._count?.questions ?? 0} questions</span>
            <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> Pass {a.passingScore}%</span>
          </div>
          <p className={`flex items-center gap-1 mt-2 text-xs ${when.className}`}><WhenIcon className="w-3.5 h-3.5" /> {when.text}</p>
        </div>
        {open ? (
          <button type="button" className="btn-primary text-sm shrink-0" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            {inProgress ? <><PlayCircle className="w-4 h-4" /> Resume</> : <><Zap className="w-4 h-4" /> Start</>}
            <ChevronRight className="w-4 h-4 -mr-1" />
          </button>
        ) : (
          <span className="btn-outline text-sm shrink-0 pointer-events-none opacity-70"><Lock className="w-4 h-4" /> Not open yet</span>
        )}
      </div>
    </div>
  );
}

function CompletedRow({ a }: { a: Assessment }) {
  const r = a.result;
  const navigate = useNavigate();
  const [retaking, setRetaking] = useState(false);
  const [retakeError, setRetakeError] = useState('');
  async function retake() {
    setRetaking(true);
    setRetakeError('');
    try {
      await retakeAssessment(a.id);
      navigate(`/exam/${a.id}`);
    } catch (err) {
      setRetakeError(apiError(err, 'Could not start another attempt'));
      setRetaking(false);
    }
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{a.name}</p>
        <p className="text-xs text-surface-500 mt-0.5">
          Submitted {formatDate(a.finishedAt || a.startedAt, false)}
          {r?.timeTakenSeconds ? ` · ${formatDuration(r.timeTakenSeconds)}` : ''}
          {(a.maxAttempts ?? 1) > 1 && ` · attempt ${a.attempt} of ${a.maxAttempts}`}
        </p>
        {retakeError && <p className="text-xs text-red-600 mt-1">{retakeError}</p>}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {r ? (
          <>
            <div className="flex items-center gap-2 w-36">
              <div className="flex-1 h-1.5 rounded-full bg-surface-800 overflow-hidden">
                <div className={`h-full rounded-full ${scoreFill(r.percentage)}`} style={{ width: `${Math.max(2, Math.min(100, r.percentage))}%` }} />
              </div>
              <span className={`text-sm font-bold tabular-nums w-11 text-right ${scoreText(r.percentage)}`}>{r.percentage.toFixed(0)}%</span>
            </div>
            {r.passed ? (
              <span className="badge bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/25 gap-1 w-16 justify-center"><CheckCircle className="w-3 h-3" /> Pass</span>
            ) : (
              <span className="badge bg-red-500/10 text-red-700 ring-1 ring-red-500/25 gap-1 w-16 justify-center"><XCircle className="w-3 h-3" /> Fail</span>
            )}
          </>
        ) : (
          <span className="text-xs text-surface-500 w-[13.5rem] text-right">
            {a.showResults ? 'No answers were submitted' : 'Results not shared by the organiser'}
          </span>
        )}
        {a.canRetake && (
          <button onClick={retake} disabled={retaking} className="btn-outline text-xs px-2 py-1" title="Start another attempt; the latest attempt counts">
            <RotateCcw className="w-3.5 h-3.5" /> {retaking ? 'Starting...' : 'Retake'}
          </button>
        )}
        <Link to={`/exam/${a.id}/result`} className="btn-ghost text-xs px-2 py-1">
          View <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

// Score per completed test (oldest → newest), each bar marked with that test's own pass mark
function PerformanceCard({ completed }: { completed: Assessment[] }) {
  const points = [...completed].filter((a) => a.result).reverse().slice(-8);
  const trend = points.length >= 2 ? points[points.length - 1].result!.percentage - points[0].result!.percentage : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary-600" /> Your performance</h2>
        {trend !== null && (
          <span className={`text-xs font-semibold tabular-nums ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(0)} pts
          </span>
        )}
      </div>
      <p className="text-xs text-surface-500 mb-4">Score in each completed test</p>

      {points.length === 0 ? (
        <p className="text-sm text-surface-500 text-center py-8">Complete a test to see your scores here.</p>
      ) : (
        <>
          <div className="relative h-40 flex items-end gap-2 border-b border-surface-700 pb-px">
            {[25, 50, 75].map((g) => (
              <div key={g} className="absolute inset-x-0 border-t border-dashed border-surface-800" style={{ bottom: `${g}%` }} aria-hidden="true" />
            ))}
            {points.map((a) => {
              const pct = a.result!.percentage;
              return (
                <div key={a.id} className="relative flex-1 h-full flex items-end justify-center group" title={`${a.name}: ${pct.toFixed(0)}% (pass ${a.passingScore}%)`}>
                  <div className={`w-full max-w-[36px] rounded-t ${a.result!.passed ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ height: `${Math.max(2, pct)}%` }} />
                  <div className="absolute inset-x-0 mx-auto max-w-[44px] border-t-2 border-surface-100" style={{ bottom: `${a.passingScore}%` }} aria-hidden="true" />
                  <span className="absolute -top-5 text-[10px] font-semibold text-surface-300 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-1.5">
            {points.map((a) => (
              <span key={a.id} className="flex-1 text-center text-[10px] text-surface-500 truncate" title={a.name}>{a.name}</span>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 text-[11px] text-surface-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Passed</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Failed</span>
            <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-surface-100" /> Pass mark</span>
          </div>
        </>
      )}
    </div>
  );
}

function RulesCard() {
  const rules: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Timer, title: 'The timer keeps running', body: 'It starts when you click Start and continues even if you close the page.' },
    { icon: EyeOff, title: 'Stay on the test tab', body: 'Leaving the tab is recorded. The 3rd time submits your test automatically.' },
    { icon: ClipboardPaste, title: 'Pastes are recorded', body: 'Pasting code into the editor is logged for the reviewer.' },
    { icon: Save, title: 'Your work is saved', body: 'Answers auto-save every few seconds and when you switch questions.' },
  ];
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Before you start</h2>
      <ul className="space-y-3.5">
        {rules.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-950 ring-1 ring-surface-800 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-surface-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
