import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import {
  AvailabilityBadge, Spinner, EmptyState, formatDate, formatPercent, scoreTextClass, parseJsonArray,
} from '../../components/ui';
import {
  getAssessments, deleteAssessment, updateAssessment, duplicateAssessment, apiError,
} from '../../services/api';
import type { Assessment, Availability, AssessmentStatus } from '../../types';
import {
  Plus, Trash2, Clock, Users, Search, Copy, Edit, Rocket, EyeOff, Archive, CheckSquare,
  Target, Calendar, Shuffle, Code2, MoreHorizontal,
} from 'lucide-react';

const FILTERS: { key: 'all' | Availability; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Live' },
  { key: 'upcoming', label: 'Scheduled' },
  { key: 'draft', label: 'Drafts' },
  { key: 'closed', label: 'Closed' },
  { key: 'archived', label: 'Archived' },
];

const LANGUAGE_NAMES: Record<number, string> = { 71: 'Python', 62: 'Java', 54: 'C++', 63: 'JavaScript' };

export default function AssessmentManager() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Availability>('all');
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setAssessments(await getAssessments());
    } catch (err) {
      setError(apiError(err, 'Failed to load assessments'));
    } finally {
      setLoading(false);
    }
  }

  async function run(id: number, action: () => Promise<unknown>) {
    setMenuFor(null);
    setBusyId(id);
    setError('');
    try {
      await action();
      await loadData();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  const setStatus = (a: Assessment, status: AssessmentStatus) => run(a.id, () => updateAssessment(a.id, { status }));

  function handleDelete(a: Assessment) {
    const taken = a.stats?.candidatesStarted ?? 0;
    const warning = taken
      ? `Delete "${a.name}"? ${taken} candidate result${taken === 1 ? '' : 's'} will be permanently deleted too.`
      : `Delete "${a.name}"? This cannot be undone.`;
    if (!confirm(warning)) return;
    run(a.id, () => deleteAssessment(a.id));
  }

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, f.key === 'all' ? assessments.length : assessments.filter((a) => a.availability === f.key).length])
  );
  const visible = assessments.filter(
    (a) => (filter === 'all' || a.availability === filter) && a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout
      title="Assessments"
      subtitle="Create, configure and publish coding assessments"
      actions={
        <Link to="/admin/assessments/new" className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> New Assessment
        </Link>
      }
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex gap-1 p-1 rounded-lg bg-surface-900 border border-surface-800 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                filter === f.key ? 'bg-surface-700 text-white' : 'text-surface-400 hover:text-white'
              }`}
            >
              {f.label} <span className="text-surface-500 text-xs tabular-nums">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input className="input pl-9 py-1.5 text-sm" placeholder="Search assessments..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading assessments..." />
      ) : assessments.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No assessments yet"
          body="Create your first assessment from the question bank."
          action={<Link to="/admin/assessments/new" className="btn-primary"><Plus className="w-4 h-4" /> Create Assessment</Link>}
        />
      ) : visible.length === 0 ? (
        <p className="text-center text-surface-500 py-16">No assessments match this filter.</p>
      ) : (
        <div className="grid gap-4">
          {visible.map((a) => {
            const langs = parseJsonArray<number>(a.allowedLanguages);
            const totalMarks = a.questions.reduce((acc, q) => acc + (q.marks ?? 0), 0);
            return (
              <div key={a.id} className={`card p-5 ${busyId === a.id ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/admin/assessments/${a.id}/edit`} className="text-lg font-semibold text-white hover:text-primary-300">
                        {a.name}
                      </Link>
                      <AvailabilityBadge value={a.availability} />
                    </div>
                    {a.description && <p className="text-sm text-surface-400 mt-1 line-clamp-2">{a.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-surface-400">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {a.timeLimitMinutes} min</span>
                      <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {a._count?.questions ?? 0} questions · {totalMarks} marks · pass {a.passingScore}%</span>
                      {(a.startAt || a.endAt) && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {a.startAt ? formatDate(a.startAt) : 'Now'} → {a.endAt ? formatDate(a.endAt) : 'no deadline'}
                        </span>
                      )}
                      {a.shuffleQuestions && <span className="flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" /> Shuffled</span>}
                      {langs.length > 0 && (
                        <span className="flex items-center gap-1"><Code2 className="w-3.5 h-3.5" /> {langs.map((l) => LANGUAGE_NAMES[l]).join(', ')}</span>
                      )}
                      {!a.showResults && <span className="flex items-center gap-1"><EyeOff className="w-3.5 h-3.5" /> Results hidden</span>}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 text-center">
                    <div>
                      <p className="text-lg font-semibold text-white tabular-nums">{a.stats?.candidatesCompleted ?? 0}</p>
                      <p className="text-[11px] text-surface-500 uppercase tracking-wider">Completed</p>
                    </div>
                    <div>
                      <p className={`text-lg font-semibold tabular-nums ${a.stats?.averageScore != null ? scoreTextClass(a.stats.averageScore) : 'text-surface-500'}`}>
                        {formatPercent(a.stats?.averageScore, 0)}
                      </p>
                      <p className="text-[11px] text-surface-500 uppercase tracking-wider">Avg score</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white tabular-nums">{formatPercent(a.stats?.passRate, 0)}</p>
                      <p className="text-[11px] text-surface-500 uppercase tracking-wider">Pass rate</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-surface-800">
                  <div className="flex flex-wrap gap-1.5">
                    {a.questions.map((aq) => (
                      <span key={aq.id} className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700 text-xs">
                        {aq.question.title} <span className="text-surface-600 ml-1">{aq.marks}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/admin/submissions/${a.id}`} className="btn-outline text-sm">
                      <Users className="w-4 h-4" /> Results
                      {!!a.stats?.inProgress && <span className="text-xs text-sky-400">+{a.stats.inProgress} live</span>}
                    </Link>
                    <button onClick={() => navigate(`/admin/assessments/${a.id}/edit`)} className="btn-outline text-sm">
                      <Edit className="w-4 h-4" /> Edit
                    </button>
                    {a.status === 'draft' && (
                      <button onClick={() => setStatus(a, 'published')} className="btn-primary text-sm" disabled={!a._count?.questions}
                        title={a._count?.questions ? 'Make visible to candidates' : 'Add questions first'}>
                        <Rocket className="w-4 h-4" /> Publish
                      </button>
                    )}
                    <div className="relative">
                      <button onClick={() => setMenuFor(menuFor === a.id ? null : a.id)} className="btn-ghost p-2" aria-label="More actions">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuFor === a.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                          <div className="absolute right-0 mt-1 w-48 rounded-lg bg-surface-800 border border-surface-700 shadow-xl z-50 py-1 text-sm">
                            <button onClick={() => run(a.id, () => duplicateAssessment(a.id))} className="w-full flex items-center gap-2 px-3 py-2 text-surface-200 hover:bg-surface-700">
                              <Copy className="w-4 h-4" /> Duplicate
                            </button>
                            {a.status === 'published' && (
                              <button onClick={() => setStatus(a, 'draft')} className="w-full flex items-center gap-2 px-3 py-2 text-surface-200 hover:bg-surface-700">
                                <EyeOff className="w-4 h-4" /> Unpublish
                              </button>
                            )}
                            {a.status !== 'archived' ? (
                              <button onClick={() => setStatus(a, 'archived')} className="w-full flex items-center gap-2 px-3 py-2 text-surface-200 hover:bg-surface-700">
                                <Archive className="w-4 h-4" /> Archive
                              </button>
                            ) : (
                              <button onClick={() => setStatus(a, 'draft')} className="w-full flex items-center gap-2 px-3 py-2 text-surface-200 hover:bg-surface-700">
                                <Archive className="w-4 h-4" /> Restore as draft
                              </button>
                            )}
                            <button onClick={() => handleDelete(a)} className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10">
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
