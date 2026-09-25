import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAssessments, apiError } from '../../services/api';
import { formatDate, Spinner } from '../../components/ui';
import type { Assessment } from '../../types';
import {
  Code2, LogOut, Clock, FileText, ChevronRight, Zap, Target, Calendar, CheckCircle, PlayCircle, Lock, Home
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

export default function ExamDashboard() {
  const { candidateName, logout } = useAuth();
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

  function renderCard(a: Assessment) {
    const action = actionFor(a);
    const Icon = action.icon;
    return (
      <div
        key={a.id}
        className={`card group transition-all duration-300 ${action.enabled ? 'hover:border-primary-500/30 cursor-pointer' : 'opacity-70'}`}
        onClick={() => action.enabled && navigate(action.to)}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white group-hover:text-primary-300 transition-colors">{a.name}</h3>
              {a.candidateStatus === 'in-progress' && (
                <span className="badge bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25">In progress</span>
              )}
            </div>
            {a.description && <p className="text-sm text-surface-400 mt-1">{a.description}</p>}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-sm text-surface-400">
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {a.timeLimitMinutes} minutes</span>
              <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> {a._count?.questions ?? 0} questions</span>
              <span className="flex items-center gap-1.5"><Target className="w-4 h-4" /> Pass at {a.passingScore}%</span>
              {a.endAt && a.candidateStatus !== 'completed' && (
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {a.availability === 'closed' ? 'Closed' : 'Closes'} {formatDate(a.endAt)}</span>
              )}
            </div>
          </div>
          <button className={`${action.className} text-sm`} disabled={!action.enabled}>
            <Icon className="w-4 h-4" /> {action.label}
            {action.enabled && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950">
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">WissenCode</h1>
              <p className="text-xs text-surface-500">Assessment Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="btn-ghost text-sm" title="Back to dashboard">
              <Home className="w-4 h-4" />
            </Link>
            <span className="text-sm text-surface-400">Welcome, {candidateName}</span>
            <button onClick={() => { logout(); navigate('/login'); }} className="btn-ghost text-sm" title="Log out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">My Assessments</h2>
          <p className="text-surface-400 text-sm mt-1">Pick a test to start or continue. The timer starts only when you click Start on the next screen.</p>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>}

        {loading ? (
          <Spinner label="Loading assessments..." />
        ) : assessments.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-surface-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-surface-400 mb-2">No assessments available</h3>
            <p className="text-surface-500 text-sm">Check back later or contact your administrator.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && <div className="grid gap-4">{pending.map(renderCard)}</div>}
            {completed.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-surface-400 uppercase tracking-wider mb-3">Completed</h3>
                <div className="grid gap-4">{completed.map(renderCard)}</div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
