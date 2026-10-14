import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import DashboardCommandCenter from '../../components/DashboardCommandCenter';
import {
  PassFailBadge,
  StatCard,
  Spinner,
  EmptyState,
  formatDate,
  formatPercent,
  scoreTextClass,
} from '../../components/ui';
import { getDashboard, apiError } from '../../services/api';
import type { DashboardData } from '../../types';
import {
  ClipboardList,
  Users,
  Target,
  Award,
  Plus,
  Library,
  Activity,
  ChevronRight,
  Clock,
  BarChart3,
  Search,
} from 'lucide-react';

function ScoreDistribution({
  buckets,
}: {
  buckets: DashboardData['scoreDistribution'];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const peak = buckets.findIndex((b) => b.count === max);
  // Round the axis up to a tidy tick so gridlines land on whole numbers
  const step = Math.max(1, Math.ceil(max / 4));
  const axisMax = step * Math.ceil(max / step);
  const ticks = Array.from({ length: axisMax / step + 1 }, (_, i) => i * step);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white">Score distribution</h2>
        <span className="text-xs text-surface-500">
          {total} completed attempts
        </span>
      </div>
      <p className="text-xs text-surface-500 mb-6">
        Candidates by overall score, all assessments
      </p>

      <div className="relative h-44 flex">
        {/* Y axis */}
        <div className="relative w-6 shrink-0 text-[10px] text-surface-500 tabular-nums">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-1 translate-y-1/2 leading-none"
              style={{ bottom: `${(t / axisMax) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${t === 0 ? 'border-surface-600' : 'border-surface-800'}`}
              style={{ bottom: `${(t / axisMax) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px] px-1">
            {buckets.map((b, i) => (
              <div
                key={b.range}
                className="relative flex-1 h-full flex items-end justify-center cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`w-full max-w-[44px] rounded-t transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                  style={{
                    height: `${(b.count / axisMax) * 100}%`,
                    minHeight: b.count ? 2 : 0,
                    background: '#60a5fa',
                  }}
                />
                {i === peak && hover === null && b.count > 0 && (
                  <span
                    className="absolute text-xs font-semibold text-surface-200 tabular-nums"
                    style={{
                      bottom: `calc(${(b.count / axisMax) * 100}% + 4px)`,
                    }}
                  >
                    {b.count}
                  </span>
                )}
                {hover === i && (
                  <div
                    className="absolute z-10 px-2.5 py-1.5 rounded-lg bg-surface-800 border border-surface-700 shadow-xl text-xs whitespace-nowrap pointer-events-none"
                    style={{
                      bottom: `calc(${(b.count / axisMax) * 100}% + 6px)`,
                    }}
                  >
                    <div className="text-surface-400">Score {b.range}</div>
                    <div className="text-white font-semibold tabular-nums">
                      {b.count} candidate{b.count === 1 ? '' : 's'}
                      {total > 0 && (
                        <span className="text-surface-400 font-normal">
                          {' '}
                          · {Math.round((b.count / total) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-[2px] pl-7 pr-1 mt-2">
        {buckets.map((b) => (
          <span
            key={b.range}
            className="flex-1 text-center text-[10px] text-surface-500"
          >
            {b.range}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AssessmentDashboard() {
  const dashboard = useQuery({
    queryKey: ['assessment-dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000,
  });
  const data = dashboard.data;
  const error = dashboard.error
    ? apiError(dashboard.error, 'Failed to load dashboard')
    : '';
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const lifecycle = (a: DashboardData['assessments'][number]) =>
    a.status === 'draft'
      ? 'draft'
      : a.status === 'archived'
        ? 'completed'
        : a.availability === 'closed'
          ? 'expired'
          : a.availability === 'upcoming'
            ? 'scheduled'
            : 'active';
  const visible =
    data?.assessments.filter(
      (a) =>
        (filter === 'all' || lifecycle(a) === filter) &&
        a.name.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];

  return (
    <AdminLayout
      maxWidth="w-full max-w-none"
      title="Assessment Dashboard"
      subtitle="Overview of your assessments and candidate performance"
      actions={
        <>
          <Link to="/admin/questions/new" className="btn-outline text-sm">
            <Library className="w-4 h-4" /> Add Question
          </Link>
          <Link to="/admin/assessments/new" className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Create Assessment
          </Link>
        </>
      }
    >
      {error ? (
        <div role="alert" className="card text-center text-red-600">
          <p>{error}</p>
          <button
            className="btn-outline mt-4"
            onClick={() => dashboard.refetch()}
          >
            Retry dashboard
          </button>
        </div>
      ) : !data ? (
        <Spinner label="Loading dashboard..." />
      ) : (
        <div className="dashboard-stack space-y-6 animate-fade-in">
          <DashboardCommandCenter
            active={
              data.assessments.filter((a) => lifecycle(a) === 'active').length
            }
            inProgress={data.totals.inProgress}
            completed={data.totals.candidatesCompleted}
            onExplore={() => {
              setSearch('');
              setFilter('active');
              document
                .getElementById('dashboard-assessments-title')
                ?.scrollIntoView({
                  behavior: window.matchMedia(
                    '(prefers-reduced-motion: reduce)',
                  ).matches
                    ? 'auto'
                    : 'smooth',
                  block: 'start',
                });
            }}
          />
          <div>
            <h2 className="text-sm font-semibold text-surface-200 mb-3">
              Overview
            </h2>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Assessments"
                tone="bg-primary-500/10 text-primary-700"
                icon={ClipboardList}
                value={data.totals.assessments}
                hint={`${data.totals.published} published · ${data.totals.drafts} draft · ${data.totals.questions} questions`}
              />
              <StatCard
                label="Candidates started"
                tone="bg-sky-500/10 text-sky-700"
                icon={Users}
                value={data.totals.candidatesStarted}
                hint={`${data.totals.candidatesCompleted} completed · ${data.totals.inProgress} in progress`}
              />
              <StatCard
                label="Average score"
                tone="bg-amber-500/10 text-amber-700"
                icon={Target}
                value={formatPercent(data.totals.averageScore)}
                hint={
                  data.totals.highestScore !== null
                    ? `Highest ${formatPercent(data.totals.highestScore, 0)}`
                    : 'No attempts yet'
                }
              />
              <StatCard
                label="Pass rate"
                tone="bg-emerald-500/10 text-emerald-700"
                icon={Award}
                value={formatPercent(data.totals.passRate, 0)}
                hint="Of completed attempts"
              />
            </div>
          </div>

          {/* Assessment management */}
          <section
            aria-labelledby="dashboard-assessments-title"
            className="card p-0 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
              <h2
                id="dashboard-assessments-title"
                className="text-sm font-semibold text-white flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4 text-primary-600" /> Assessments
              </h2>
              <Link
                to="/admin/assessments"
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Manage all →
              </Link>
            </div>
            <div className="px-5 pt-4 pb-3 border-b border-surface-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-surface-500">
                  {visible.length} of {data.assessments.length} assessments
                </p>
                <label className="relative w-full sm:w-72">
                  <span className="sr-only">Search assessments</span>
                  <Search
                    aria-hidden="true"
                    className="absolute left-3 top-3.5 w-4 h-4 text-surface-500"
                  />
                  <input
                    type="search"
                    className="input pl-10"
                    placeholder="Search assessments…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <nav
                aria-label="Assessment status filters"
                className="flex gap-1 overflow-x-auto pb-1"
              >
                {[
                  'all',
                  'draft',
                  'active',
                  'scheduled',
                  'completed',
                  'expired',
                ].map((status) => {
                  const count =
                    status === 'all'
                      ? data.assessments.length
                      : data.assessments.filter((a) => lifecycle(a) === status)
                          .length;
                  return (
                    <button
                      key={status}
                      aria-pressed={filter === status}
                      onClick={() => setFilter(status)}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === status ? 'bg-primary-500/10 text-primary-700' : 'text-surface-500 hover:bg-surface-950 hover:text-surface-200'}`}
                    >
                      <span className="capitalize">
                        {status === 'all' ? 'All assessments' : status}
                      </span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 tabular-nums ${filter === status ? 'bg-primary-500/10' : 'bg-surface-800/70'}`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
            {visible.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={
                  data.assessments.length
                    ? 'No assessments match'
                    : 'No assessments yet'
                }
                body={
                  data.assessments.length
                    ? 'Try another search or assessment status.'
                    : 'Create an assessment to start inviting candidates.'
                }
                action={
                  data.assessments.length ? (
                    <button
                      className="btn-outline"
                      onClick={() => {
                        setSearch('');
                        setFilter('all');
                      }}
                    >
                      Clear filters
                    </button>
                  ) : (
                    <Link to="/admin/assessments/new" className="btn-primary">
                      <Plus className="w-4 h-4" /> Create Assessment
                    </Link>
                  )
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-surface-800 text-xs text-surface-500 uppercase tracking-wider">
                      <th className="text-left font-medium px-5 py-3">
                        Assessment
                      </th>
                      <th className="text-left font-medium px-3 py-3">
                        Status
                      </th>
                      <th className="text-right font-medium px-3 py-3">
                        Questions
                      </th>
                      <th className="text-right font-medium px-3 py-3">
                        Candidates
                      </th>
                      <th className="text-right font-medium px-3 py-3">
                        Started
                      </th>
                      <th className="text-right font-medium px-3 py-3">
                        Completed
                      </th>
                      <th className="text-right font-medium px-3 py-3">
                        Avg score
                      </th>
                      <th className="text-right font-medium px-3 py-3">
                        Pass rate
                      </th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/60">
                    {visible.map((a) => (
                      <tr key={a.id} className="hover:bg-surface-800/30">
                        <td className="px-5 py-4 min-w-[260px] max-w-[340px]">
                          <Link
                            to={`/admin/assessments/${a.id}/edit`}
                            title={a.name}
                            className="block truncate font-medium text-surface-100 hover:text-primary-700"
                          >
                            {a.name}
                          </Link>
                          <p className="text-xs text-surface-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> {a.timeLimitMinutes}{' '}
                            min · pass at {a.passingScore}%
                            {a.endAt && (
                              <> · closes {formatDate(a.endAt, false)}</>
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`badge capitalize ${lifecycle(a) === 'active' ? 'bg-emerald-500/10 text-emerald-700' : lifecycle(a) === 'scheduled' ? 'bg-primary-500/10 text-primary-700' : lifecycle(a) === 'expired' ? 'bg-amber-500/10 text-amber-700' : 'bg-surface-800 text-surface-400'}`}
                          >
                            {lifecycle(a)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-surface-300">
                          {a._count?.questions ?? 0}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {a.candidateCount ?? a.stats?.candidatesStarted ?? 0}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {a.stats?.candidatesStarted ?? 0}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {a.stats?.candidatesCompleted ?? 0}
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${a.stats?.averageScore != null ? scoreTextClass(a.stats.averageScore) : 'text-surface-500'}`}
                        >
                          {formatPercent(a.stats?.averageScore)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-surface-300">
                          {formatPercent(a.stats?.passRate, 0)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            to={`/admin/submissions/${a.id}`}
                            className="btn-ghost text-xs px-2 py-1"
                          >
                            <Users className="w-3.5 h-3.5" /> Results
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-5 py-3 border-t border-surface-800 text-xs text-surface-500">
              Candidate counts include invited and started candidates. Completed
              assessments are archived after review.
            </div>
          </section>
          <section aria-labelledby="dashboard-performance-title">
            <h2
              id="dashboard-performance-title"
              className="text-sm font-semibold text-surface-200 mb-3"
            >
              Performance and activity
            </h2>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="lg:col-span-1">
                <ScoreDistribution buckets={data.scoreDistribution} />
              </div>

              {/* Recent activity */}
              <div className="card lg:col-span-1 p-0 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary-600" /> Recent
                    activity
                  </h2>
                </div>
                {data.recentActivity.length === 0 ? (
                  <p className="text-sm text-surface-500 text-center py-10">
                    No candidate activity yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-surface-800/60 max-h-[260px] overflow-y-auto">
                    {data.recentActivity.map((r) => (
                      <li
                        key={`${r.assessmentId}-${r.candidateName}`}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <div className="min-w-0">
                          <p
                            title={r.candidateName}
                            className="text-sm font-medium text-surface-100 truncate"
                          >
                            {r.candidateName}
                          </p>
                          <p
                            title={r.assessmentName}
                            className="text-xs text-surface-400 truncate mt-0.5"
                          >
                            {r.assessmentName}
                          </p>
                          <p className="text-xs text-surface-500">
                            {formatDate(r.finishedAt || r.startedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {r.status === 'completed' &&
                          r.overallScore !== null ? (
                            <>
                              <span
                                className={`text-sm font-semibold tabular-nums ${scoreTextClass(r.overallScore)}`}
                              >
                                {r.overallScore.toFixed(0)}%
                              </span>
                              <PassFailBadge passed={!!r.passed} />
                              <Link
                                to={`/admin/reports/${encodeURIComponent(String(r.candidateUserId ?? r.candidateName))}/${r.assessmentId}`}
                                className="btn-ghost p-1.5"
                                title="View evaluation"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Link>
                            </>
                          ) : (
                            <span className="badge bg-sky-500/15 text-sky-600 ring-1 ring-sky-500/25 gap-1">
                              <Clock className="w-3 h-3" /> In progress
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
