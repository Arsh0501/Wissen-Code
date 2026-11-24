import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessagesSquare, Clock, Search, ChevronsDown, ChevronsUp } from 'lucide-react';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
import { sortByCreatedAt } from '../../services/listSort';
import { Spinner, formatDate } from '../ui';
import type { InterviewSummary } from '../../pages/admin/InterviewsPage';

const filters = [
  { value: 'all', label: 'All interviews' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'Live' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];
const statusClass = (status: string) =>
  status === 'in_progress'
    ? 'bg-emerald-500/10 text-emerald-700'
    : status === 'scheduled'
      ? 'bg-primary-500/10 text-primary-700'
      : status === 'expired'
        ? 'bg-amber-500/10 text-amber-700'
        : 'bg-surface-800 text-surface-400';

export default function DashboardInterviews() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['dashboard-interviews'],
    queryFn: () => apiData<InterviewSummary[]>('/interviews'),
    refetchInterval: 30000,
  });
  const interviews = query.data ?? [];
  const matching = sortByCreatedAt(
    interviews.filter(
      (interview) =>
        (filter === 'all' || interview.status === filter) &&
        [
          interview.title,
          interview.candidateName,
          interview.candidateEmail,
          interview.interviewer?.name,
          interview.interviewer?.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    ),
    'newest',
  );
  const visible = expanded ? matching : matching.slice(0, 5);
  return (
    <section aria-labelledby="dashboard-interviews-title" className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
        <h2
          id="dashboard-interviews-title"
          className="text-sm font-semibold text-white flex items-center gap-2"
        >
          <MessagesSquare className="w-4 h-4 text-primary-600" aria-hidden="true" /> Interviews
        </h2>
        <Link to="/admin/interviews" className="text-xs text-primary-600 hover:text-primary-700">
          Manage all ?
        </Link>
      </div>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-800">
        <nav
          aria-label="Interview status filters"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === value ? 'bg-primary-500/10 text-primary-700' : 'text-surface-500 hover:bg-surface-950 hover:text-surface-200'}`}
            >
              {label}
              <span
                className={`rounded-md px-1.5 py-0.5 tabular-nums ${filter === value ? 'bg-primary-500/10' : 'bg-surface-800/70'}`}
              >
                {value === 'all'
                  ? interviews.length
                  : interviews.filter((interview) => interview.status === value).length}
              </span>
            </button>
          ))}
        </nav>
        <label className="relative w-44 sm:w-64 shrink-0">
          <span className="sr-only">Search interviews</span>
          <Search aria-hidden="true" className="absolute left-3 top-3.5 w-4 h-4 text-surface-500" />
          <input
            type="search"
            className="input pl-10"
            placeholder="Search interviews?"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {query.isLoading ? (
        <div className="p-8">
          <Spinner label="Loading interviews..." />
        </div>
      ) : query.error ? (
        <div role="alert" className="p-6 text-sm text-red-600">
          {apiError(query.error, 'Failed to load interviews')}
          <button type="button" className="btn-outline ml-3" onClick={() => query.refetch()}>
            Retry interviews
          </button>
        </div>
      ) : !visible.length ? (
        <div className="px-5 py-10 text-center text-surface-500">
          <p>{interviews.length ? 'No interviews match these filters.' : 'No interviews yet.'}</p>
          {(search || filter !== 'all') && (
            <button
              type="button"
              className="btn-outline mt-3"
              onClick={() => {
                setSearch('');
                setFilter('all');
              }}
            >
              Clear interview filters
            </button>
          )}
        </div>
      ) : (
        <div id="dashboard-interview-list" className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-surface-800 text-xs text-surface-500 uppercase tracking-wider">
                {[
                  'Interview',
                  'Candidate',
                  'Interviewer',
                  'Status',
                  'Scheduled',
                  'Questions',
                  'Rating',
                ].map((label) => (
                  <th key={label} className="text-left font-medium px-5 py-3">
                    {label}
                  </th>
                ))}
                <th className="px-5 py-3">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/60">
              {visible.map((interview) => (
                <tr key={interview.id} className="hover:bg-surface-800/30">
                  <td className="px-5 py-4 min-w-[220px] max-w-[320px]">
                    <Link
                      to={`/admin/interviews/${interview.id}`}
                      title={interview.title}
                      className="block truncate font-medium text-surface-100 hover:text-primary-700"
                    >
                      {interview.title}
                    </Link>
                    <p className="text-xs text-surface-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {interview.timeLimitMinutes} min
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="block font-medium">{interview.candidateName}</span>
                    <span className="block text-xs text-surface-500">
                      {interview.candidateEmail}
                    </span>
                  </td>
                  <td className="px-5 py-3">{interview.interviewer?.name || 'Unassigned'}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${statusClass(interview.status)}`}>
                      {filters.find((item) => item.value === interview.status)?.label ??
                        interview.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs whitespace-nowrap text-surface-400">
                    {interview.scheduledAt ? formatDate(interview.scheduledAt) : 'Flexible'}
                  </td>
                  <td className="px-5 py-3 tabular-nums">{interview._count?.questions ?? 0}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {interview.finalRating != null ? `${interview.finalRating}/5` : '?'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/admin/interviews/${interview.id}`}
                      className="btn-ghost text-xs px-2 py-1"
                    >
                      View details<span className="sr-only"> for {interview.title}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-surface-800 text-xs text-surface-500">
        <p className="min-w-0">Review interview assignments, progress, and feedback.</p>
        {!query.error && matching.length > 5 && (
          <button
            type="button"
            className="inline-flex shrink-0 h-9 w-12 items-center justify-center rounded-xl border border-primary-500/25 bg-primary-500/10 text-primary-600 transition-colors hover:bg-primary-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label={
              expanded ? 'Show recent 5 interviews' : `Show all ${matching.length} interviews`
            }
            title={expanded ? 'Collapse to recent interviews' : 'Expand all interviews'}
            aria-expanded={expanded}
            aria-controls="dashboard-interview-list"
            onClick={() => setExpanded((previous) => !previous)}
          >
            {expanded ? (
              <ChevronsUp className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ChevronsDown className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </section>
  );
}
