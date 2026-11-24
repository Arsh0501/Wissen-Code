import DashboardInterviews from '../../components/dashboard/DashboardInterviews';
import { sortByCreatedAt } from '../../services/listSort';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import DashboardCommandCenter from '../../components/dashboard/DashboardCommandCenter';
import {
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
  ChevronsDown,
  ChevronsUp,
  Clock,
  BarChart3,
  Search,
} from 'lucide-react';

export default function AssessmentDashboard() {
  const dashboard = useQuery({
    queryKey: ['assessment-dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000,
  });
  const data = dashboard.data;
  const error = dashboard.error ? apiError(dashboard.error, 'Failed to load dashboard') : '';
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAllAssessments, setShowAllAssessments] = useState(false);
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
  const matching =
    data?.assessments.filter(
      (a) =>
        (filter === 'all' || lifecycle(a) === filter) &&
        a.name.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];
  const sortedAssessments = sortByCreatedAt(matching, 'newest');
  const visible = showAllAssessments ? sortedAssessments : sortedAssessments.slice(0, 5);

  return (
    <AdminLayout
      maxWidth="w-full max-w-none"
      title="Assessment Dashboard"
      eyebrow={null}
    >
      {error ? (
        <div role="alert" className="card text-center text-red-600">
          <p>{error}</p>
          <button className="btn-outline mt-4" onClick={() => dashboard.refetch()}>
            Retry dashboard
          </button>
        </div>
      ) : !data ? (
        <Spinner label="Loading dashboard..." />
      ) : (
        <div className="dashboard-stack space-y-6 animate-fade-in">
          <DashboardCommandCenter
            active={data.assessments.filter((a) => lifecycle(a) === 'active').length}
            inProgress={data.totals.inProgress}
            completed={data.totals.candidatesCompleted}
            onExplore={() => {
              setSearch('');
              setFilter('active');
              document.getElementById('dashboard-assessments-title')?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
                block: 'start',
              });
            }}
          />
          <div>
            <h2 className="text-sm font-semibold text-surface-200 mb-3">Overview</h2>
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
            <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-800">
              <nav
                aria-label="Assessment status filters"
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
              >
                {['all', 'draft', 'active', 'scheduled', 'completed', 'expired'].map((status) => {
                  const count =
                    status === 'all'
                      ? data.assessments.length
                      : data.assessments.filter((a) => lifecycle(a) === status).length;
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
              <label className="relative w-44 sm:w-64 shrink-0">
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
            {visible.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={data.assessments.length ? 'No assessments match' : 'No assessments yet'}
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
                    <Link to="/admin/assessments" className="btn-outline">
                      View assessments
                    </Link>
                  )
                }
              />
            ) : (
              <div id="dashboard-assessment-list" className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-surface-800 text-xs text-surface-500 uppercase tracking-wider">
                      <th className="text-left font-medium px-5 py-3">Assessment</th>
                      <th className="text-left font-medium px-3 py-3">Status</th>
                      <th className="text-right font-medium px-3 py-3">Questions</th>
                      <th className="text-right font-medium px-3 py-3">Candidates</th>
                      <th className="text-right font-medium px-3 py-3">Started</th>
                      <th className="text-right font-medium px-3 py-3">Completed</th>
                      <th className="text-right font-medium px-3 py-3">Avg score</th>
                      <th className="text-right font-medium px-3 py-3">Pass rate</th>
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
                            <Clock className="w-3 h-3" /> {a.timeLimitMinutes} min · pass at{' '}
                            {a.passingScore}%
                            {a.endAt && <> · closes {formatDate(a.endAt, false)}</>}
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
            <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-surface-800 text-xs text-surface-500">
              <p className="min-w-0">
                Candidate counts include invited and started candidates. Completed assessments are
                archived after review.
              </p>
              {matching.length > 5 && (
                <button
                  type="button"
                  className="inline-flex shrink-0 h-9 w-12 items-center justify-center rounded-xl border border-primary-500/25 bg-primary-500/10 text-primary-600 transition-colors hover:bg-primary-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  aria-label={
                    showAllAssessments ? 'Show recent 5' : `Show all ${matching.length} assessments`
                  }
                  title={
                    showAllAssessments ? 'Collapse to recent assessments' : 'Expand all assessments'
                  }
                  aria-expanded={showAllAssessments}
                  aria-controls="dashboard-assessment-list"
                  onClick={() => setShowAllAssessments((previous) => !previous)}
                >
                  {showAllAssessments ? (
                    <ChevronsUp className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ChevronsDown className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
          </section>
          <DashboardInterviews />
        </div>
      )}
    </AdminLayout>
  );
}
