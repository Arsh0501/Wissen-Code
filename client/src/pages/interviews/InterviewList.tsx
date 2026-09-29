import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { Spinner, EmptyState, formatDate } from '../../components/ui';
import { apiError } from '../../services/api';
import { listInterviews } from '../../services/interviews';
import type { InterviewStatus, Recommendation } from '../../services/interviews';
import { Plus, MessagesSquare, Clock, ChevronRight, CalendarDays } from 'lucide-react';

export const STATUS_BADGE: Record<InterviewStatus, { label: string; className: string }> = {
  planned: { label: 'Planned', className: 'bg-sky-500/10 text-sky-700 ring-sky-500/25' },
  in_progress: { label: 'In progress', className: 'bg-amber-500/10 text-amber-700 ring-amber-500/25' },
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25' },
};

export const RECOMMENDATION: Record<Exclude<Recommendation, ''>, { label: string; className: string }> = {
  strong_hire: { label: 'Strong hire', className: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30' },
  hire: { label: 'Hire', className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  no_hire: { label: 'No hire', className: 'bg-red-500/10 text-red-700 ring-red-500/20' },
  strong_no_hire: { label: 'Strong no hire', className: 'bg-red-500/15 text-red-700 ring-red-500/30' },
};

export default function InterviewList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['interviews'], queryFn: listInterviews });

  return (
    <AdminLayout
      title="Interviews"
      subtitle="Plan interviews with AI, run them with live code and notes, and evaluate candidates by skill"
      actions={<Link to="/admin/interviews/new" className="btn-primary text-sm"><Plus className="w-4 h-4" /> New interview</Link>}
    >
      {isLoading ? (
        <Spinner label="Loading interviews..." />
      ) : error ? (
        <p className="text-sm text-red-600">{apiError(error, 'Failed to load interviews')}</p>
      ) : !data?.length ? (
        <EmptyState
          icon={MessagesSquare}
          title="No interviews yet"
          body="Create an interview to get an AI-suggested plan you can edit."
          action={<Link to="/admin/interviews/new" className="btn-primary"><Plus className="w-4 h-4" /> New interview</Link>}
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          <ul className="divide-y divide-surface-800">
            {data.map((i) => {
              const status = STATUS_BADGE[i.status];
              const rec = i.recommendation ? RECOMMENDATION[i.recommendation] : null;
              return (
                <li key={i.id}>
                  <Link to={`/admin/interviews/${i.id}`} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-surface-950">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">{i.candidateName}</p>
                        <span className={`badge ring-1 ${status.className}`}>{status.label}</span>
                        {rec && <span className={`badge ring-1 ${rec.className}`}>{rec.label}</span>}
                      </div>
                      <p className="text-xs text-surface-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {i.role && <span>{i.role}</span>}
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {i.durationMinutes} min</span>
                        {i.scheduledAt && <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {formatDate(i.scheduledAt)}</span>}
                        <span>{i.skills.join(', ')}</span>
                      </p>
                    </div>
                    <span className="text-xs text-surface-500 shrink-0 flex items-center gap-1">
                      {i._count?.questions ?? 0} questions <ChevronRight className="w-4 h-4" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </AdminLayout>
  );
}
