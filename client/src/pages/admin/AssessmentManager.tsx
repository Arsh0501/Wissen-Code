import AssessmentActionsDialog from '../../components/assessments/AssessmentActionsDialog';
import DateSortControl from '../../components/ui/DateSortControl';
import { sortByCreatedAt, type DateSortOrder } from '../../services/listSort';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import ShareLinksModal from '../../components/assessments/ShareLinksModal';
import BulkAssessmentInvites from '../../components/assessments/BulkAssessmentInvites';
import {
  AvailabilityBadge,
  Spinner,
  EmptyState,
  formatDate,
  formatPercent,
  scoreTextClass,
  parseJsonArray,
} from '../../components/ui';
import {
  getAssessments,
  deleteAssessment,
  updateAssessment,
  duplicateAssessment,
  apiError,
} from '../../services/api';
import type { Assessment, Availability, AssessmentStatus } from '../../types';
import {
  Plus,
  Clock,
  Search,
  EyeOff,
  CheckSquare,
  Target,
  Calendar,
  Shuffle,
  Code2,
} from 'lucide-react';

const FILTERS: { key: 'all' | Availability; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Live' },
  { key: 'upcoming', label: 'Scheduled' },
  { key: 'draft', label: 'Drafts' },
  { key: 'closed', label: 'Closed' },
  { key: 'archived', label: 'Archived' },
];

const LANGUAGE_NAMES: Record<number, string> = {
  71: 'Python',
  62: 'Java',
  54: 'C++',
  63: 'JavaScript',
};

export default function AssessmentManager() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [shareFor, setShareFor] = useState<Assessment | null>(null);
  const [bulkFor, setBulkFor] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Availability>('all');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<DateSortOrder>('newest');
  const [actionId, setActionId] = useState<number | null>(null);
  const selectedAssessment = assessments.find((assessment) => assessment.id === actionId);
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
    setBusyId(id);
    setError('');
    try {
      await action();
      setActionId(null);
      await loadData();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  const setStatus = (a: Assessment, status: AssessmentStatus) =>
    run(a.id, () => updateAssessment(a.id, { status }));

  function handleDelete(a: Assessment) {
    const taken = a.stats?.candidatesStarted ?? 0;
    const warning = taken
      ? `Delete "${a.name}"? ${taken} candidate result${taken === 1 ? '' : 's'} will be permanently deleted too.`
      : `Delete "${a.name}"? This cannot be undone.`;
    if (!confirm(warning)) return;
    run(a.id, () => deleteAssessment(a.id));
  }

  const counts = Object.fromEntries(
    FILTERS.map((f) => [
      f.key,
      f.key === 'all'
        ? assessments.length
        : assessments.filter((a) => a.availability === f.key).length,
    ]),
  );
  const visible = sortByCreatedAt(
    assessments.filter(
      (a) =>
        (filter === 'all' || a.availability === filter) &&
        a.name.toLowerCase().includes(search.toLowerCase()),
    ),
    sortOrder,
  );

  return (
    <AdminLayout
      title="Assessments"
      eyebrow={null}
      actions={
        <>
          <Link to="/admin/assessments/new" className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> New Assessment
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">
          {error}
        </div>
      )}

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
              {f.label}{' '}
              <span className="text-surface-500 text-xs tabular-nums">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full sm:w-auto">
          <DateSortControl
            compact
            label="Sort assessments"
            value={sortOrder}
            onChange={setSortOrder}
          />
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              className="input rounded-l-none pl-9 py-1.5 text-sm"
              placeholder="Search assessments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading assessments..." />
      ) : assessments.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No assessments yet"
          body="Create your first assessment from the question bank."
          action={
            <Link to="/admin/assessments/new" className="btn-primary">
              <Plus className="w-4 h-4" /> Create Assessment
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <p className="text-center text-surface-500 py-16">No assessments match this filter.</p>
      ) : (
        <div className="grid gap-4">
          {visible.map((a) => {
            const langs = parseJsonArray<number>(a.allowedLanguages);
            const totalMarks = a.questions.reduce((acc, q) => acc + (q.marks ?? 0), 0);
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={busyId === a.id ? -1 : 0}
                aria-label={`Open actions for ${a.name}`}
                aria-haspopup="dialog"
                onClick={() => {
                  setError('');
                  setActionId(a.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setError('');
                    setActionId(a.id);
                  }
                }}
                className={`card p-5 cursor-pointer transition-colors hover:border-primary-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${busyId === a.id ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-white">{a.name}</h2>
                      <AvailabilityBadge value={a.availability} />
                    </div>
                    {a.description && (
                      <p className="text-sm text-surface-400 mt-1 line-clamp-2">{a.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-surface-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {a.timeLimitMinutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="w-3.5 h-3.5" /> {a._count?.questions ?? 0} questions ·{' '}
                        {totalMarks} marks · pass {a.passingScore}%
                      </span>
                      {(a.startAt || a.endAt) && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {a.startAt ? formatDate(a.startAt) : 'Now'} →{' '}
                          {a.endAt ? formatDate(a.endAt) : 'no deadline'}
                        </span>
                      )}
                      {a.shuffleQuestions && (
                        <span className="flex items-center gap-1">
                          <Shuffle className="w-3.5 h-3.5" /> Shuffled
                        </span>
                      )}
                      {langs.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Code2 className="w-3.5 h-3.5" />{' '}
                          {langs.map((l) => LANGUAGE_NAMES[l]).join(', ')}
                        </span>
                      )}
                      {!a.showResults && (
                        <span className="flex items-center gap-1">
                          <EyeOff className="w-3.5 h-3.5" /> Results hidden
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 text-center">
                    <div>
                      <p className="text-lg font-semibold text-white tabular-nums">
                        {a.stats?.candidatesCompleted ?? 0}
                      </p>
                      <p className="text-[11px] text-surface-500 uppercase tracking-wider">
                        Completed
                      </p>
                    </div>
                    <div>
                      <p
                        className={`text-lg font-semibold tabular-nums ${a.stats?.averageScore != null ? scoreTextClass(a.stats.averageScore) : 'text-surface-500'}`}
                      >
                        {formatPercent(a.stats?.averageScore, 0)}
                      </p>
                      <p className="text-[11px] text-surface-500 uppercase tracking-wider">
                        Avg score
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white tabular-nums">
                        {formatPercent(a.stats?.passRate, 0)}
                      </p>
                      <p className="text-[11px] text-surface-500 uppercase tracking-wider">
                        Pass rate
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selectedAssessment && (
        <AssessmentActionsDialog
          assessment={selectedAssessment}
          busy={busyId === selectedAssessment.id}
          error={error}
          onClose={() => setActionId(null)}
          onResults={() => navigate(`/admin/submissions/${selectedAssessment.id}`)}
          onShare={() => {
            setShareFor(selectedAssessment);
            setActionId(null);
          }}
          onBulkInvite={() => {
            setBulkFor(selectedAssessment);
            setActionId(null);
          }}
          onEdit={() => navigate(`/admin/assessments/${selectedAssessment.id}/edit`)}
          onStatus={(status) => setStatus(selectedAssessment, status)}
          onDuplicate={() =>
            run(selectedAssessment.id, () => duplicateAssessment(selectedAssessment.id))
          }
          onDelete={() => handleDelete(selectedAssessment)}
        />
      )}
      {bulkFor && (
        <BulkAssessmentInvites
          key={bulkFor.id}
          assessment={bulkFor}
          onClose={() => setBulkFor(null)}
        />
      )}
      {shareFor && (
        <ShareLinksModal
          assessment={{
            id: shareFor.id,
            name: shareFor.name,
            status: shareFor.status,
          }}
          onClose={() => setShareFor(null)}
        />
      )}
    </AdminLayout>
  );
}
