import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAssessments, apiError } from '../../services/api';
import { formatDate, Spinner } from '../../components/ui';
import type { Assessment } from '../../types';
import {
  Clock, FileText, ChevronRight, Zap, Target, Calendar, CheckCircle, PlayCircle, Lock,
  ShieldCheck, Sparkles, type LucideIcon,
} from 'lucide-react';

function actionFor(a: Assessment) {
  if (a.candidateStatus === 'completed') {
    return { label: 'View result', icon: CheckCircle, to: `/exam/${a.id}/result`, className: 'btn-outline', enabled: true };
  }
  if (a.candidateStatus === 'in-progress') {
    return { label: 'Resume', icon: PlayCircle, to: `/exam/${a.id}`, className: 'btn-primary', enabled: true };
  }
  if (a.availability === 'upcoming') {
    return { label: `Opens ${formatDate(a.startAt)}`, icon: Lock, to: '', className: 'btn-outline', enabled: false };
  }
  if (a.availability !== 'open') {
    return { label: 'Closed', icon: Lock, to: '', className: 'btn-outline', enabled: false };
  }
  return { label: 'Start', icon: Zap, to: `/exam/${a.id}`, className: 'btn-primary', enabled: true };
}

// Status pill + accent stripe colour for each card
function statusFor(a: Assessment) {
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

function SummaryTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-900/80 ring-1 ring-surface-800 px-4 py-3 backdrop-blur">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-xl font-bold text-white leading-none tabular-nums">{value}</div>
        <div className="text-xs text-surface-500 mt-1">{label}</div>
      </div>
    </div>
  );
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

  // Actionable tests first: in progress, then open, then scheduled, then closed
  const rank = (a: Assessment) =>
    a.candidateStatus === 'in-progress' ? 0 : a.availability === 'open' ? 1 : a.availability === 'upcoming' ? 2 : 3;
  const pending = assessments.filter((a) => a.candidateStatus !== 'completed').sort((x, y) => rank(x) - rank(y));
  const completed = assessments.filter((a) => a.candidateStatus === 'completed');
  const openCount = pending.filter((a) => a.candidateStatus !== 'in-progress' && a.availability === 'open').length;
  const inProgressCount = pending.filter((a) => a.candidateStatus === 'in-progress').length;
  const firstName = candidateName?.split(' ')[0] || 'there';

  function renderCard(a: Assessment) {
    const action = actionFor(a);
    const status = statusFor(a);
    const Icon = action.icon;
    return (
      <div
        key={a.id}
        className={`card relative overflow-hidden p-0 flex flex-col group transition-all duration-200 ${
          action.enabled ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-surface-700/40 hover:border-primary-500/40' : 'opacity-75'
        }`}
        onClick={() => action.enabled && navigate(action.to)}
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${status.stripe}`} aria-hidden="true" />
        <div className="p-5 pl-6 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-white group-hover:text-primary-700 transition-colors leading-snug">
              {a.name}
            </h3>
            <span className={`badge ring-1 shrink-0 ${status.pill}`}>{status.label}</span>
          </div>
          {a.description && <p className="text-sm text-surface-500 mt-1.5 line-clamp-2">{a.description}</p>}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { icon: Clock, text: `${a.timeLimitMinutes} min` },
              { icon: FileText, text: `${a._count?.questions ?? 0} questions` },
              { icon: Target, text: `Pass ${a.passingScore}%` },
            ].map(({ icon: MetaIcon, text }) => (
              <div key={text} className="flex items-center gap-1.5 rounded-lg bg-surface-950 px-2.5 py-1.5 text-xs text-surface-400">
                <MetaIcon className="w-3.5 h-3.5 text-surface-500 shrink-0" />
                <span className="truncate">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-surface-800 px-5 pl-6 py-3 bg-surface-950/50">
          <span className="text-xs text-surface-500 flex items-center gap-1.5 min-w-0">
            {a.endAt && a.candidateStatus !== 'completed' ? (
              <>
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{a.availability === 'closed' ? 'Closed' : 'Closes'} {formatDate(a.endAt)}</span>
              </>
            ) : a.candidateStatus === 'completed' ? (
              'Submitted'
            ) : (
              'No deadline'
            )}
          </span>
          <button className={`${action.className} text-sm py-1.5 shrink-0`} disabled={!action.enabled}>
            <Icon className="w-4 h-4" /> {action.label}
            {action.enabled && <ChevronRight className="w-4 h-4 -mr-1 transition-transform group-hover:translate-x-0.5" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome hero */}
      <section className="relative overflow-hidden rounded-2xl border border-primary-500/15 bg-gradient-to-br from-primary-50 via-surface-900 to-sky-50 p-6 md:p-8">
        <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 w-72 h-72 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-500/10 rounded-full px-2.5 py-1 mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Candidate portal
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              {greeting()}, {firstName}
            </h1>
            <p className="text-surface-500 text-sm mt-2 max-w-xl">
              Pick a test to start or continue. The timer starts only when you click <span className="font-medium text-surface-300">Start Assessment</span> on the next screen.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 lg:min-w-[440px]">
            <SummaryTile icon={Zap} label="Open now" value={openCount} tone="bg-primary-500/10 text-primary-700" />
            <SummaryTile icon={PlayCircle} label="In progress" value={inProgressCount} tone="bg-sky-500/10 text-sky-700" />
            <SummaryTile icon={CheckCircle} label="Completed" value={completed.length} tone="bg-emerald-500/10 text-emerald-700" />
          </div>
        </div>
      </section>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">{error}</div>}

      {loading ? (
        <Spinner label="Loading assessments..." />
      ) : assessments.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-surface-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No assessments available</h3>
          <p className="text-surface-500 text-sm">Check back later or contact your administrator.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Your assessments</h2>
                <span className="text-xs text-surface-500">{pending.length} total</span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">{pending.map(renderCard)}</div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Completed</h2>
                <span className="text-xs text-surface-500">{completed.length} submitted</span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">{completed.map(renderCard)}</div>
            </section>
          )}
          <p className="flex items-center justify-center gap-1.5 text-xs text-surface-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Assessments are proctored. Stay on the test tab. Leaving it is recorded.
          </p>
        </>
      )}
    </div>
  );
}
