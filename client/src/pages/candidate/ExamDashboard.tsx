import { sortByCreatedAt } from '../../services/listSort';
import { readCandidateDashboardState } from '../../services/candidateDashboardState';
import { ChevronsDown, ChevronsUp, ArrowDownWideNarrow, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getAssessments,
  getCandidateInterviews,
  startSession,
  apiError,
  type CandidateInterviewSummary,
} from '../../services/api';
import { formatDate, formatDuration, Spinner } from '../../components/ui';
import type { Assessment } from '../../types';
import {
  Clock,
  FileText,
  ChevronRight,
  Zap,
  Target,
  Calendar,
  CheckCircle,
  PlayCircle,
  Lock,
  XCircle,
  Video,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';

type Tone = { pill: string; stripe: string };

function statusFor(a: Assessment): { label: string } & Tone {
  if (a.candidateStatus === 'completed')
    return {
      label: 'Completed',
      pill: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25',
      stripe: 'bg-emerald-500',
    };
  if (a.candidateStatus === 'in-progress')
    return {
      label: 'In progress',
      pill: 'bg-sky-500/10 text-sky-700 ring-sky-500/25',
      stripe: 'bg-sky-500',
    };
  if (a.availability === 'open')
    return {
      label: 'Open now',
      pill: 'bg-primary-500/10 text-primary-700 ring-primary-500/25',
      stripe: 'bg-primary-500',
    };
  if (a.availability === 'upcoming')
    return {
      label: 'Scheduled',
      pill: 'bg-amber-500/10 text-amber-700 ring-amber-500/25',
      stripe: 'bg-amber-400',
    };
  return {
    label: 'Closed',
    pill: 'bg-surface-800 text-surface-500 ring-surface-700',
    stripe: 'bg-surface-700',
  };
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
  const units: [number, string][] = [
    [86400000, 'day'],
    [3600000, 'hour'],
    [60000, 'minute'],
  ];
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
  const { candidateName, user } = useAuth();
  const stateKey = `wissen-candidate-dashboard:${user?.id ?? 'anonymous'}`;
  const [savedView] = useState(() => readCandidateDashboardState(stateKey));
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [interviews, setInterviews] = useState<CandidateInterviewSummary[]>([]);
  const [view, setView] = useState(savedView.view);
  const [assessmentFilter, setAssessmentFilter] = useState(savedView.assessmentFilter);
  const [interviewFilter, setInterviewFilter] = useState(savedView.interviewFilter);
  const [search, setSearch] = useState(savedView.search);
  const [sort, setSort] = useState(savedView.sort);
  const [showAll, setShowAll] = useState(savedView.showAll);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      sessionStorage.setItem(
        stateKey,
        JSON.stringify({ view, assessmentFilter, interviewFilter, search, sort, showAll }),
      );
    } catch {
      // Browsing still works when session storage is unavailable.
    }
  }, [stateKey, view, assessmentFilter, interviewFilter, search, sort, showAll]);

  useEffect(() => {
    let active = true;
    const refreshInterviews = () => {
      void getCandidateInterviews()
        .then((data) => {
          if (active && Array.isArray(data)) setInterviews(data);
        })
        .catch(() => {});
    };
    Promise.allSettled([getAssessments(), getCandidateInterviews()])
      .then(([assessmentsRes, interviewsRes]) => {
        if (!active) return;
        if (assessmentsRes.status === 'fulfilled') {
          setAssessments(assessmentsRes.value);
        } else {
          setError(apiError(assessmentsRes.reason, 'Failed to load assessments'));
        }
        if (interviewsRes.status === 'fulfilled' && Array.isArray(interviewsRes.value)) {
          setInterviews(interviewsRes.value);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const interval = window.setInterval(refreshInterviews, 15000);
    window.addEventListener('focus', refreshInterviews);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshInterviews);
    };
  }, []);

  const activeLiveInterview = useMemo(
    () => interviews.find((i) => i.status === 'in_progress'),
    [interviews],
  );

  const data = useMemo(() => {
    // Actionable tests first: in progress, then open (soonest deadline first), then scheduled, then closed
    const rank = (a: Assessment) =>
      a.candidateStatus === 'in-progress'
        ? 0
        : a.availability === 'open'
          ? 1
          : a.availability === 'upcoming'
            ? 2
            : 3;
    const deadline = (a: Assessment) => (a.endAt ? new Date(a.endAt).getTime() : Infinity);
    const pending = assessments
      .filter((a) => a.candidateStatus !== 'completed')
      .sort((x, y) => rank(x) - rank(y) || deadline(x) - deadline(y));
    const upNext = pending.filter((a) => rank(a) < 3);
    const missed = pending.filter((a) => rank(a) === 3);
    const completed = assessments
      .filter((a) => a.candidateStatus === 'completed')
      .sort((x, y) =>
        (y.finishedAt || y.startedAt || '').localeCompare(x.finishedAt || x.startedAt || ''),
      );

    const scored = completed.filter((a) => a.result);
    const average = scored.length
      ? scored.reduce((s, a) => s + a.result!.percentage, 0) / scored.length
      : null;
    const passed = scored.filter((a) => a.result!.passed).length;
    const timeSpent = completed.reduce((s, a) => s + (a.result?.timeTakenSeconds ?? 0), 0);
    const best = scored.length ? Math.max(...scored.map((a) => a.result!.percentage)) : null;
    const inProgress = pending.find((a) => a.candidateStatus === 'in-progress') ?? null;
    const nextOpen =
      pending.find((a) => a.candidateStatus !== 'in-progress' && a.availability === 'open') ?? null;

    return {
      upNext,
      missed,
      completed,
      scored,
      average,
      passed,
      timeSpent,
      best,
      inProgress,
      nextOpen,
    };
  }, [assessments]);

  const matchingAssessments = sortByCreatedAt(
    assessments.filter((a) => {
      const match =
        assessmentFilter === 'all' ||
        (assessmentFilter === 'completed'
          ? a.candidateStatus === 'completed'
          : assessmentFilter === 'in-progress'
            ? a.candidateStatus === 'in-progress'
            : a.candidateStatus !== 'completed' &&
              (assessmentFilter === 'available'
                ? a.availability === 'open'
                : a.availability === assessmentFilter));
      return match && a.name.toLowerCase().includes(search.toLowerCase());
    }),
    sort === 'oldest' ? 'oldest' : 'newest',
  );
  const matchingInterviews = sortByCreatedAt(
    interviews.filter(
      (i) =>
        (interviewFilter === 'all' || i.status === interviewFilter) &&
        (i.title + ' ' + i.interviewer.name).toLowerCase().includes(search.toLowerCase()),
    ),
    sort === 'oldest' ? 'oldest' : 'newest',
  );
  const dateValue = (value?: string | null) =>
    value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;
  if (sort === 'soon') {
    matchingAssessments.sort((a, b) => dateValue(a.endAt) - dateValue(b.endAt));
    matchingInterviews.sort((a, b) => dateValue(a.scheduledAt) - dateValue(b.scheduledAt));
  }
  const visibleAssessments = showAll ? matchingAssessments : matchingAssessments.slice(0, 5);
  const visibleInterviews = showAll ? matchingInterviews : matchingInterviews.slice(0, 5);
  const firstName = candidateName?.split(' ')[0] || 'there';

  if (loading) return <Spinner label="Loading your dashboard..." />;

  return (
    <div className="w-full space-y-6">
      {/* HERO */}
      <section className="card relative overflow-hidden px-6 py-6 md:px-7">
        <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
              {greeting()}, <span className="text-primary-600 font-bold">{firstName}</span>
            </h1>
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
          ) : null}
        </div>
      </section>

      {/* ACTIVE LIVE INTERVIEW ALERT */}
      {activeLiveInterview && (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-surface-900 to-teal-950/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl shadow-emerald-950/20 ring-1 ring-emerald-500/30 animate-fade-in">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 ring-1 ring-emerald-500/40">
              <Video className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold text-emerald-300 bg-emerald-500/20 ring-1 ring-emerald-500/40 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Interview Live Now
                </span>
                <span className="text-surface-400 text-xs">
                  Interviewer: {activeLiveInterview.interviewer.name}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                {activeLiveInterview.title}
              </h3>
              <p className="text-surface-400 text-xs mt-0.5">
                {activeLiveInterview.timeLimitMinutes} min session ·{' '}
                {activeLiveInterview.questionCount} question(s)
              </p>
            </div>
          </div>
          <Link
            to={`/interview/${activeLiveInterview.roomToken}`}
            className="btn-primary bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 px-6 py-3 font-semibold rounded-xl shadow-lg shadow-emerald-600/30 transition-all text-sm whitespace-nowrap"
          >
            <Video className="w-4 h-4" />
            Join Live Interview
            <ExternalLink className="w-4 h-4 opacity-75" />
          </Link>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <nav className="interview-tab-bar" aria-label="Candidate dashboard sections">
          {(['assessments', 'interviews'] as const).map((item) => (
            <button
              key={item}
              className="interview-tab-button capitalize"
              aria-pressed={view === item}
              onClick={() => {
                setView(item);
                setShowAll(false);
                setSearch('');
                setSort('newest');
              }}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              className="input pl-9"
              type="search"
              aria-label="Search dashboard"
              placeholder={
                view === 'assessments' ? 'Search assessments...' : 'Search interviews...'
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowAll(false);
              }}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              className="input w-auto"
              aria-label="Filter dashboard"
              value={view === 'assessments' ? assessmentFilter : interviewFilter}
              onChange={(e) => {
                view === 'assessments'
                  ? setAssessmentFilter(e.target.value)
                  : setInterviewFilter(e.target.value);
                setShowAll(false);
              }}
            >
              {(view === 'assessments'
                ? [
                    ['all', 'All'],
                    ['available', 'Available'],
                    ['in-progress', 'In progress'],
                    ['upcoming', 'Upcoming'],
                    ['completed', 'Completed'],
                    ['closed', 'Closed'],
                  ]
                : [
                    ['all', 'All'],
                    ['in_progress', 'Live'],
                    ['scheduled', 'Upcoming'],
                    ['completed', 'Completed'],
                    ['cancelled', 'Cancelled'],
                    ['expired', 'Ended'],
                  ]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <details className="relative group">
              <summary
                aria-label="Sort dashboard"
                title="Sort dashboard"
                className="btn-outline cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden"
              >
                <ArrowDownWideNarrow className="w-4 h-4 text-primary-600" />
              </summary>
              <div className="absolute right-0 top-full mt-2 z-30 w-44 rounded-xl border border-surface-700 bg-surface-900 p-1 shadow-xl">
                {(['newest', 'oldest', 'soon'] as const).map((order) => (
                  <button
                    key={order}
                    type="button"
                    aria-pressed={sort === order}
                    className={
                      'w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-primary-500/10 ' +
                      (sort === order ? 'bg-primary-500/10 text-primary-600 font-semibold' : '')
                    }
                    onClick={(e) => {
                      setSort(order);
                      setShowAll(false);
                      e.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                  >
                    {order === 'newest'
                      ? 'Newest'
                      : order === 'oldest'
                        ? 'Oldest'
                        : view === 'assessments'
                          ? 'Closing soon'
                          : 'Scheduled soon'}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
        {view === 'interviews' ? (
          <div className="grid md:grid-cols-2 gap-4">
            {visibleInterviews.map((interview) => {
              const isLive = interview.status === 'in_progress';
              const isScheduled = interview.status === 'scheduled';
              const isCompleted = interview.status === 'completed';
              return (
                <div
                  key={interview.id}
                  className={`card relative overflow-hidden transition-all duration-200 flex flex-col justify-between ${
                    isLive
                      ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 to-surface-900 ring-1 ring-emerald-500/25'
                      : 'hover:border-surface-700'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isLive
                            ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                            : isScheduled
                              ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                              : 'bg-surface-800 text-surface-400 ring-1 ring-surface-700'
                        }`}
                      >
                        {isLive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        )}
                        {interview.status === 'expired'
                          ? 'Ended — not started'
                          : isLive
                            ? 'Live Now'
                            : isScheduled
                              ? 'Scheduled'
                              : interview.status === 'cancelled'
                                ? 'Cancelled'
                                : 'Completed'}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-white">{interview.title}</h3>
                    {interview.description && (
                      <details className="text-sm text-surface-500 mt-2">
                        <summary className="cursor-pointer">Description</summary>
                        <p className="mt-2 whitespace-pre-wrap">{interview.description}</p>
                      </details>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs text-surface-400 my-3 py-2 border-y border-surface-800">
                      <div>
                        <span className="text-surface-500 block">Interviewer</span>
                        <span className="font-medium text-surface-300">
                          {interview.interviewer.name}
                        </span>
                      </div>
                      <div>
                        <span className="text-surface-500 block">Time Limit</span>
                        <span className="font-medium text-surface-300">
                          {interview.timeLimitMinutes} min
                        </span>
                      </div>
                      <div>
                        <span className="text-surface-500 block">Schedule</span>
                        <span className="font-medium text-surface-300">
                          {interview.scheduledAt ? formatDate(interview.scheduledAt) : 'Flexible'}
                        </span>
                      </div>
                      <div>
                        <span className="text-surface-500 block">Questions</span>
                        <span className="font-medium text-surface-300">
                          {interview.questionCount} question(s)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2">
                    {interview.status === 'expired' ? (
                      <span className="text-sm text-surface-400">
                        Interview ended without being started
                      </span>
                    ) : interview.status === 'cancelled' ? (
                      <span className="text-sm text-surface-400">Interview cancelled</span>
                    ) : isCompleted ? (
                      <Link
                        to={`/interview/${interview.roomToken}`}
                        className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5"
                      >
                        View Summary
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to={`/interview/${interview.roomToken}`}
                        className={`btn-primary text-xs py-2 px-4 flex items-center gap-2 ${
                          isLive
                            ? 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-500/30'
                            : ''
                        }`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        {isLive ? 'Join Live Now' : 'Join Interview Room'}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleAssessments.map((a) =>
              a.candidateStatus === 'completed' ? (
                <div key={a.id} className="card !p-0 overflow-hidden">
                  <CompletedRow a={a} />
                </div>
              ) : (
                <UpcomingCard key={a.id} a={a} onOpen={() => navigate('/exam/' + a.id)} />
              ),
            )}
          </div>
        )}
        {(view === 'assessments' ? matchingAssessments : matchingInterviews).length === 0 && (
          <div className="card text-center text-surface-500 py-10">
            No {view} match your filters.
          </div>
        )}
        {(view === 'assessments' ? matchingAssessments : matchingInterviews).length > 5 && (
          <div className="flex justify-end">
            <button
              className="btn-outline p-2"
              aria-label={showAll ? 'Show recent five' : 'Show all ' + view}
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? <ChevronsUp className="w-4 h-4" /> : <ChevronsDown className="w-4 h-4" />}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function NextAction({
  title,
  meta,
  label,
  icon: Icon,
  urgent,
  onClick,
}: {
  title: string;
  meta: string;
  label: string;
  icon: LucideIcon;
  urgent?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-900/90 ring-1 ring-surface-800 p-4 md:w-80 shrink-0 shadow-sm">
      <p
        className={`text-[11px] font-semibold uppercase tracking-wider ${urgent ? 'text-sky-700' : 'text-primary-600'}`}
      >
        {urgent ? 'Continue where you left off' : 'Recommended next'}
      </p>
      <p className="text-sm font-semibold text-white mt-1 truncate">{title}</p>
      <p className={`text-xs mt-0.5 ${urgent ? 'text-sky-700 font-medium' : 'text-surface-500'}`}>
        {meta}
      </p>
      <button type="button" onClick={onClick} className="btn-primary w-full mt-3 text-sm">
        <Icon className="w-4 h-4" /> {label}
      </button>
    </div>
  );
}

function UpcomingCard({ a, onOpen }: { a: Assessment; onOpen: () => void }) {
  const status = statusFor(a);
  const inProgress = a.candidateStatus === 'in-progress';
  const open = inProgress || a.availability === 'open';
  const when = inProgress
    ? {
        icon: Clock,
        text: minutesLeft(a.remainingSeconds),
        className: 'text-sky-700 font-medium',
      }
    : a.availability === 'upcoming'
      ? {
          icon: Calendar,
          text: `Opens ${relativeTime(a.startAt)} · ${formatDate(a.startAt)}`,
          className: 'text-amber-700',
        }
      : a.endAt
        ? {
            icon: Calendar,
            text: `Closes ${relativeTime(a.endAt)} · ${formatDate(a.endAt)}`,
            className: 'text-surface-400',
          }
        : {
            icon: Calendar,
            text: 'No deadline',
            className: 'text-surface-500',
          };
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
            <h3 className="text-base font-semibold text-white group-hover:text-primary-700 transition-colors">
              {a.name}
            </h3>
            <span className={`badge ring-1 ${status.pill}`}>{status.label}</span>
          </div>
          {a.description && (
            <details className="mt-2 text-sm text-surface-500" onClick={(e) => e.stopPropagation()}>
              <summary className="cursor-pointer">Description</summary>
              <p className="mt-2 whitespace-pre-wrap">{a.description}</p>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-surface-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {a.timeLimitMinutes} min
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> {a._count?.questions ?? 0} questions
            </span>
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5" /> Pass {a.passingScore}%
            </span>
          </div>
          <p className={`flex items-center gap-1 mt-2 text-xs ${when.className}`}>
            <WhenIcon className="w-3.5 h-3.5" /> {when.text}
          </p>
        </div>
        {open ? (
          <button
            type="button"
            className="btn-primary text-sm shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            {inProgress ? (
              <>
                <PlayCircle className="w-4 h-4" /> Resume
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" /> Start
              </>
            )}
            <ChevronRight className="w-4 h-4 -mr-1" />
          </button>
        ) : (
          <span className="btn-outline text-sm shrink-0 pointer-events-none opacity-70">
            <Lock className="w-4 h-4" /> Not open yet
          </span>
        )}
      </div>
    </div>
  );
}

function CompletedRow({ a }: { a: Assessment }) {
  const [retakeError, setRetakeError] = useState('');
  const [retaking, setRetaking] = useState(false);
  const r = a.result;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{a.name}</p>
        <p className="text-xs text-surface-500 mt-0.5">
          Submitted {formatDate(a.finishedAt || a.startedAt, false)}
          {r?.timeTakenSeconds ? ` · ${formatDuration(r.timeTakenSeconds)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {r ? (
          <>
            <div className="flex items-center gap-2 w-36">
              <div className="flex-1 h-1.5 rounded-full bg-surface-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${scoreFill(r.percentage)}`}
                  style={{
                    width: `${Math.max(2, Math.min(100, r.percentage))}%`,
                  }}
                />
              </div>
              <span
                className={`text-sm font-bold tabular-nums w-11 text-right ${scoreText(r.percentage)}`}
              >
                {r.percentage.toFixed(0)}%
              </span>
            </div>
            {r.passed ? (
              <span className="badge bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/25 gap-1 w-16 justify-center">
                <CheckCircle className="w-3 h-3" /> Pass
              </span>
            ) : (
              <span className="badge bg-red-500/10 text-red-700 ring-1 ring-red-500/25 gap-1 w-16 justify-center">
                <XCircle className="w-3 h-3" /> Fail
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-surface-500 w-[13.5rem] text-right">
            {a.showResults ? 'No answers were submitted' : 'Results not shared by the organiser'}
          </span>
        )}
        {a.canRetake && (
          <button
            className="btn-outline text-xs"
            disabled={retaking}
            onClick={async () => {
              setRetaking(true);
              setRetakeError('');
              try {
                await startSession(a.id, true);
                window.location.assign(`/exam/${a.id}`);
              } catch (error) {
                setRetakeError(apiError(error));
                setRetaking(false);
              }
            }}
          >
            Retake ({(a.maxAttempts ?? 1) - (a.attemptsUsed ?? 0)} left)
          </button>
        )}
        {retakeError && (
          <p role="alert" className="text-red-600 text-xs">
            {retakeError}
          </p>
        )}
        <Link to={`/exam/${a.id}/result`} className="btn-ghost text-xs px-2 py-1">
          View <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
