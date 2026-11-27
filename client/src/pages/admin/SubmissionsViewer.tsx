import RestartAssessmentDialog from '../../components/assessments/RestartAssessmentDialog';
import { getAssessmentRestarts, type AssessmentRestartRecord } from '../../services/api';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  StatCard,
  Spinner,
  EmptyState,
  PassFailBadge,
  formatDate,
  formatDuration,
  formatPercent,
  scoreTextClass,
} from '../../components/ui';
import { getAssessmentSubmissions, downloadAssessmentCsv, apiError } from '../../services/api';
import type { AssessmentSubmissionsResponse } from '../../services/api';
import {
  Users,
  Target,
  Award,
  Search,
  FileText,
  Clock,
  ArrowLeft,
  Edit,
  FileSpreadsheet,
} from 'lucide-react';

type SortKey = 'score' | 'name' | 'submitted';

export default function SubmissionsViewer() {
  const { assessmentId } = useParams();
  const [data, setData] = useState<AssessmentSubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [result, setResult] = useState<'all' | 'passed' | 'failed' | 'in-progress'>('all');
  const [sort, setSort] = useState<SortKey>('score');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [restartTarget, setRestartTarget] = useState<{ id: number; name: string } | null>(null);
  const [restarts, setRestarts] = useState<AssessmentRestartRecord[]>([]);

  async function handleExport() {
    if (!assessmentId) return;
    setExporting(true);
    setExportError('');
    try {
      const { blob, filename } = await downloadAssessmentCsv(parseInt(assessmentId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoking immediately can cancel the download in some browsers (e.g. Safari)
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setExportError(apiError(err, 'Failed to export results'));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (assessmentId) loadData();
  }, [assessmentId]);

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      const [results, history] = await Promise.all([
        getAssessmentSubmissions(Number(assessmentId)),
        getAssessmentRestarts(Number(assessmentId)),
      ]);
      setData(results);
      setRestarts(history);
    } catch (err: any) {
      setError(
        err?.response?.status === 403
          ? 'Access denied. Admin role required.'
          : apiError(err, 'Failed to load submissions.'),
      );
    } finally {
      setLoading(false);
    }
  }

  const candidates = (data?.candidates ?? [])
    .filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((c) =>
      result === 'all'
        ? true
        : result === 'in-progress'
          ? c.status === 'in-progress'
          : c.status === 'completed' &&
            !c.isProvisional &&
            (result === 'passed' ? c.passed : !c.passed),
    )
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'submitted') return (b.submittedAt || '').localeCompare(a.submittedAt || '');
      // Completed first, then by score
      if (a.status !== b.status) return a.status === 'completed' ? -1 : 1;
      return b.overallScore - a.overallScore;
    });

  const timeTaken = (c: AssessmentSubmissionsResponse['candidates'][number]) =>
    c.session?.finishedAt && c.session.startedAt
      ? Math.round(
          (new Date(c.session.finishedAt).getTime() - new Date(c.session.startedAt).getTime()) /
            1000,
        )
      : null;

  return (
    <AdminLayout
      title={data?.assessment.name ?? 'Results'}
      subtitle={
        data && `${data.assessment.timeLimitMinutes} min · pass at ${data.assessment.passingScore}%`
      }
      actions={
        <>
          <Link to="/admin/assessments" className="btn-ghost text-sm">
            <ArrowLeft className="w-4 h-4" /> Assessments
          </Link>
          <Link to={`/admin/assessments/${assessmentId}/edit`} className="btn-outline text-sm">
            <Edit className="w-4 h-4" /> Edit assessment
          </Link>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !data || data.candidates.length === 0}
            className="btn-primary text-sm"
            title="Download every candidate's result as a spreadsheet"
          >
            <FileSpreadsheet className="w-4 h-4" /> {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </>
      }
    >
      {exportError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">
          {exportError}
        </div>
      )}
      {loading ? (
        <Spinner label="Loading submissions..." />
      ) : error ? (
        <div className="card text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="btn-outline">
            Retry
          </button>
        </div>
      ) : !data || data.candidates.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No submissions yet"
          body="No candidates have taken this assessment."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Completed"
              icon={Users}
              value={data.stats.candidatesCompleted}
              hint={`${data.stats.inProgress} in progress`}
            />
            <StatCard
              label="Average score"
              icon={Target}
              value={formatPercent(data.stats.averageScore)}
            />
            <StatCard
              label="Pass rate"
              icon={Award}
              value={formatPercent(data.stats.passRate, 0)}
            />
            <StatCard
              label="Highest score"
              icon={Award}
              value={formatPercent(data.stats.highestScore, 0)}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                className="input pl-10"
                placeholder="Search by candidate name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="input w-auto"
              value={result}
              onChange={(e) => setResult(e.target.value as typeof result)}
              aria-label="Result"
            >
              <option value="all">All results</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="in-progress">In progress</option>
            </select>
            <select
              className="input w-auto"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort by"
            >
              <option value="score">Sort: score</option>
              <option value="submitted">Sort: most recent</option>
              <option value="name">Sort: name</option>
            </select>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-800 text-xs text-surface-500 uppercase tracking-wider">
                    <th className="text-left font-medium px-5 py-3">Candidate</th>
                    <th className="text-left font-medium px-3 py-3">Submitted</th>
                    <th className="text-right font-medium px-3 py-3">Time taken</th>
                    <th className="text-right font-medium px-3 py-3">Attempted</th>
                    <th className="text-right font-medium px-3 py-3">Marks</th>
                    <th className="text-right font-medium px-3 py-3">Score</th>
                    <th className="text-left font-medium px-3 py-3">Result</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800/60">
                  {candidates.map((c) => (
                    <tr key={c.candidateUserId ?? c.name} className="hover:bg-surface-800/30">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary-500/15 border border-primary-500/20 flex items-center justify-center text-xs font-bold text-primary-700">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-surface-100">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-surface-400">
                        {c.status === 'completed'
                          ? formatDate(c.submittedAt)
                          : `Started ${formatDate(c.startedAt)}`}
                      </td>
                      <td className="px-3 py-3 text-right text-surface-400 tabular-nums">
                        {formatDuration(timeTaken(c))}
                      </td>
                      <td className="px-3 py-3 text-right text-surface-400 tabular-nums">
                        {c.attemptedQuestions}/{c.totalQuestions}
                      </td>
                      <td className="px-3 py-3 text-right text-surface-300 tabular-nums">
                        {c.status === 'completed' ? `${c.marksObtained}/${c.totalMarks}` : '—'}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-semibold tabular-nums ${c.status === 'completed' ? scoreTextClass(c.overallScore) : 'text-surface-500'}`}
                      >
                        {c.status === 'completed' ? `${c.overallScore.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-3">
                        {c.status === 'completed' ? (
                          <>
                            {c.isProvisional ? (
                              <span className="badge">Grading / review pending</span>
                            ) : (
                              <PassFailBadge passed={c.passed} />
                            )}
                          </>
                        ) : (
                          <span className="badge bg-sky-500/15 text-sky-600 ring-1 ring-sky-500/25 gap-1">
                            <Clock className="w-3 h-3" /> In progress
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {c.candidateUserId && (
                          <button
                            type="button"
                            className="btn-outline text-xs px-2.5 py-1 mr-2"
                            onClick={() =>
                              setRestartTarget({ id: c.candidateUserId!, name: c.name })
                            }
                          >
                            Restart assessment
                          </button>
                        )}
                        {c.status === 'completed' && (
                          <Link
                            to={`/admin/reports/${encodeURIComponent(String(c.candidateUserId ?? c.name))}/${assessmentId}`}
                            className="btn-outline text-xs px-2.5 py-1"
                          >
                            <FileText className="w-3.5 h-3.5" /> Evaluation
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                  {candidates.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-surface-500">
                        No candidates match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {restarts.length > 0 && (
        <section className="card mt-5 p-5">
          <h2 className="mb-4 text-lg font-semibold">Restart history</h2>
          {[
            ...new Map(restarts.map((r) => [r.candidateUserId, r] as const).reverse()).values(),
          ].map((r) => (
            <div
              key={r.candidateUserId}
              className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-surface-700 pb-3"
            >
              <span className="text-sm">
                <strong>{r.candidateName}</strong>
                <span className="ml-2 text-surface-400">
                  {!r.consumedAt && !r.revokedAt
                    ? 'Replacement ready to start'
                    : 'Replacement authorized'}
                </span>
              </span>
              <button
                type="button"
                className="btn-outline text-xs"
                onClick={() => setRestartTarget({ id: r.candidateUserId, name: r.candidateName })}
              >
                Restart assessment
              </button>
            </div>
          ))}
          <details>
            <summary className="cursor-pointer text-sm text-primary-600">
              View audit history
            </summary>
            <ul className="mt-3 space-y-3">
              {restarts.map((r) => (
                <li key={r.id} className="rounded-xl border border-surface-700 p-3 text-sm">
                  <strong>{r.candidateName}</strong>
                  <p className="text-surface-400">
                    {formatDate(r.createdAt)} ï¿½ {r.adminEmail}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{r.reason}</p>
                  <p className="mt-1 text-xs text-surface-400">
                    Invalidated attempt IDs:{' '}
                    {r.invalidatedSessionIds.join(', ') || 'Already invalidated'}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {restartTarget && (
        <RestartAssessmentDialog
          assessmentId={Number(assessmentId)}
          candidate={restartTarget}
          onClose={() => setRestartTarget(null)}
          onRestart={() => {
            setRestartTarget(null);
            void loadData();
          }}
        />
      )}
    </AdminLayout>
  );
}
