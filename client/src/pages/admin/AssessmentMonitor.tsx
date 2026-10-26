import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { EmptyState, Spinner, formatDate } from '../../components/ui';
import {
  apiError,
  downloadShortlistCsv,
  getMonitor,
  sendShortlistEmail,
  updateAutomation,
  type MonitorRow,
  type ShortlistRule,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Activity,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  EyeOff,
  Mail,
  RefreshCw,
  Save,
  Star,
  Users,
  Zap,
} from 'lucide-react';

type Tab = 'all' | 'in-progress' | 'completed' | 'not-started' | 'shortlisted' | 'flagged';
const REFRESH_MS = 10000;

const mmss = (s: number | null) =>
  s === null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const minutes = (s: number | null) => (s === null ? '—' : `${Math.round(s / 60)} min`);

/** Live view of one assessment batch: who is in, who finished, who is shortlisted. */
export default function AssessmentMonitor() {
  const { id } = useParams();
  const assessmentId = Number(id);
  const { user } = useAuth();
  const client = useQueryClient();
  const monitor = useQuery({
    queryKey: ['assessment-monitor', assessmentId],
    queryFn: () => getMonitor(assessmentId),
    refetchInterval: REFRESH_MS,
    enabled: Number.isInteger(assessmentId),
  });
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [rule, setRule] = useState<ShortlistRule | null>(null);
  const [notifyOnCompletion, setNotify] = useState(true);
  const [autoShortlist, setAutoShortlist] = useState(false);
  const [notifyEmails, setNotifyEmails] = useState('');
  const [message, setMessage] = useState('');
  const seeded = useRef(false);
  useEffect(() => {
    const a = monitor.data?.automation;
    // Seed the form from the server once; later 10 s refetches must not clobber unsaved edits.
    if (!a || seeded.current) return;
    seeded.current = true;
    setRule(a.shortlist);
    setNotify(a.notifyOnCompletion);
    setAutoShortlist(a.autoShortlist);
    setNotifyEmails(a.notifyEmails.join(', '));
  }, [monitor.data?.automation]);

  const save = useMutation({
    mutationFn: () =>
      updateAutomation(assessmentId, {
        notifyOnCompletion,
        autoShortlist,
        notifyEmails: notifyEmails
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
        shortlist: rule ?? undefined,
      }),
    onSuccess: async (saved) => {
      setMessage('Automation saved.');
      setRule(saved.shortlist);
      await client.invalidateQueries({ queryKey: ['assessment-monitor', assessmentId] });
    },
    onError: (e) => setMessage(apiError(e)),
  });
  const send = useMutation({
    mutationFn: () => sendShortlistEmail(assessmentId),
    onSuccess: ({ sent }) => setMessage(sent ? `Shortlist CSV emailed to ${user?.email}.` : 'Nothing to send yet.'),
    onError: (e) => setMessage(apiError(e)),
  });
  async function download() {
    try {
      const { blob, filename } = await downloadShortlistCsv(assessmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setMessage(apiError(e, 'Could not download the CSV.'));
    }
  }

  const data = monitor.data;
  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (q && !`${r.name} ${r.email ?? ''}`.toLowerCase().includes(q)) return false;
      if (tab === 'all') return true;
      if (tab === 'shortlisted') return r.shortlisted;
      if (tab === 'flagged') return r.cameraFlags > (data?.automation.shortlist.maxFlags ?? 3) || r.tabSwitches >= 3;
      return r.status === tab;
    });
  }, [data, tab, search]);

  const counts = data?.counts;
  const progress = counts && counts.expected ? Math.round((counts.completed / counts.expected) * 100) : null;

  return (
    <AdminLayout
      title={data ? `${data.assessment.name} · Live` : 'Live monitor'}
      subtitle={
        data
          ? `${data.assessment.timeLimitMinutes} min · pass at ${data.assessment.passingScore}%${data.assessment.endAt ? ` · closes ${formatDate(data.assessment.endAt)}` : ''} · refreshes every ${REFRESH_MS / 1000}s`
          : undefined
      }
      actions={
        <>
          <Link to="/admin/assessments" className="btn-ghost text-sm">
            <ArrowLeft className="w-4 h-4" /> Assessments
          </Link>
          <Link to={`/admin/submissions/${assessmentId}`} className="btn-outline text-sm">
            <Users className="w-4 h-4" /> Results
          </Link>
          <button className="btn-outline text-sm" onClick={() => monitor.refetch()} disabled={monitor.isFetching}>
            <RefreshCw className={`w-4 h-4 ${monitor.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </>
      }
    >
      {monitor.isLoading ? (
        <Spinner label="Loading live data…" />
      ) : monitor.error || !data ? (
        <div className="card" role="alert">
          {apiError(monitor.error, 'Could not load the monitor.')}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Batch progress */}
          <section className="card">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <div>
                <p className="eyebrow">Batch progress</p>
                <p className="text-2xl font-bold text-white tabular-nums">
                  {counts!.completed} <span className="text-base font-medium text-surface-500">of {counts!.expected || '?'} finished</span>
                </p>
              </div>
              <p className="text-xs text-surface-500">
                {counts!.inProgress} writing now · {counts!.notStarted} not started · {counts!.grading} grading
              </p>
            </div>
            <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
              <div className="h-full bg-primary-600 transition-all" style={{ width: `${progress ?? 0}%` }} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-4">
              {(
                [
                  ['all', 'Everyone', counts!.expected, Users],
                  ['in-progress', 'In progress', counts!.inProgress, Activity],
                  ['completed', 'Completed', counts!.completed, CheckCircle2],
                  ['not-started', 'Not started', counts!.notStarted, Clock],
                  ['shortlisted', 'Shortlisted', counts!.shortlisted, Star],
                  ['flagged', 'Needs review', counts!.flagged, EyeOff],
                ] as const
              ).map(([key, label, value, Icon]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  aria-pressed={tab === key}
                  className={`text-left p-3 rounded-lg border transition-colors ${tab === key ? 'border-primary-500 bg-primary-500/10' : 'border-surface-800 hover:border-surface-700'}`}
                >
                  <span className="text-[11px] uppercase tracking-wider text-surface-500 flex items-center gap-1">
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </span>
                  <span className="block text-xl font-bold text-white tabular-nums">{value}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 items-start">
            {/* Live table */}
            <section className="card p-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-surface-800">
                <h2 className="font-semibold text-white text-sm">
                  {tab === 'all' ? 'All candidates' : tab === 'in-progress' ? 'Writing right now' : tab === 'completed' ? 'Completed' : tab === 'not-started' ? 'Not started yet' : tab === 'shortlisted' ? 'Shortlisted' : 'Needs review'}{' '}
                  <span className="text-surface-500 font-normal">({rows.length})</span>
                </h2>
                <input
                  className="input py-1.5 text-sm w-56"
                  placeholder="Search name or email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {rows.length === 0 ? (
                <EmptyState icon={Users} title="Nobody here yet" body="This list fills in live as candidates join and finish." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-surface-500 border-b border-surface-800">
                        <th className="text-left font-medium px-4 py-2">Candidate</th>
                        <th className="text-left font-medium px-3 py-2">Status</th>
                        <th className="text-left font-medium px-3 py-2">Progress</th>
                        <th className="text-right font-medium px-3 py-2">Score</th>
                        <th className="text-left font-medium px-3 py-2">Integrity</th>
                        <th className="text-right font-medium px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800/70">
                      {rows.map((r) => (
                        <Row key={r.key} r={r} assessmentId={assessmentId} maxFlags={data.automation.shortlist.maxFlags} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Automation */}
            <section className="card space-y-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary-600" /> Automation
              </h2>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1" checked={notifyOnCompletion} onChange={(e) => setNotify(e.target.checked)} />
                <span>
                  <span className="font-medium text-white">Email me every report</span>
                  <span className="block text-xs text-surface-500">As soon as a candidate finishes: score, pass/fail, integrity, report link.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1" checked={autoShortlist} onChange={(e) => setAutoShortlist(e.target.checked)} />
                <span>
                  <span className="font-medium text-white">Auto-send shortlist CSV</span>
                  <span className="block text-xs text-surface-500">
                    When the assessment closes or everyone expected has finished, the shortlist below is emailed once as a CSV.
                    {data.automation.shortlistSentAt && <> Sent {formatDate(data.automation.shortlistSentAt)}.</>}
                  </span>
                </span>
              </label>
              <label className="label">
                Also notify (comma-separated emails)
                <input className="input mt-2 text-sm" placeholder="hr@company.com, lead@company.com" value={notifyEmails} onChange={(e) => setNotifyEmails(e.target.value)} />
                <span className="text-xs text-surface-500">All workspace admins always receive these mails.</span>
              </label>

              <div className="pt-3 border-t border-surface-800 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" /> Shortlist rule
                </h3>
                {rule && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="label">
                        Pick
                        <select className="input mt-2 text-sm" value={rule.mode} onChange={(e) => setRule({ ...rule, mode: e.target.value as ShortlistRule['mode'] })}>
                          <option value="top">Top N by score</option>
                          <option value="threshold">Score at least…</option>
                          <option value="passed">Everyone who passed</option>
                        </select>
                      </label>
                      {rule.mode === 'top' && (
                        <label className="label">
                          How many
                          <input type="number" min={1} max={1000} className="input mt-2 text-sm" value={rule.topN} onChange={(e) => setRule({ ...rule, topN: Math.max(1, Number(e.target.value) || 1) })} />
                        </label>
                      )}
                      {rule.mode === 'threshold' && (
                        <label className="label">
                          Minimum score %
                          <input type="number" min={0} max={100} className="input mt-2 text-sm" value={rule.minScore} onChange={(e) => setRule({ ...rule, minScore: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
                        </label>
                      )}
                    </div>
                    <label className="flex items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-1" checked={rule.excludeFlagged} onChange={(e) => setRule({ ...rule, excludeFlagged: e.target.checked })} />
                      <span>
                        <span className="font-medium text-white">Skip integrity concerns</span>
                        <span className="block text-xs text-surface-500">
                          Leave out anyone auto-submitted for tab switching or with more than{' '}
                          <input type="number" min={0} max={100} className="input inline-block w-16 py-0.5 px-2 text-xs mx-1" value={rule.maxFlags} onChange={(e) => setRule({ ...rule, maxFlags: Math.max(0, Number(e.target.value) || 0) })} />
                          camera flags.
                        </span>
                      </span>
                    </label>
                  </>
                )}
                <p className="text-xs text-surface-500">
                  Currently shortlisted: <strong className="text-white">{counts!.shortlisted}</strong> of {counts!.completed} completed. Ties break by faster completion.
                </p>
              </div>

              {message && <p className="text-xs text-primary-700">{message}</p>}
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary text-sm" onClick={() => save.mutate()} disabled={save.isPending}>
                  <Save className="w-4 h-4" /> {save.isPending ? 'Saving…' : 'Save automation'}
                </button>
                <button className="btn-outline text-sm" onClick={download} disabled={!counts!.shortlisted}>
                  <Download className="w-4 h-4" /> Shortlist CSV
                </button>
                <button className="btn-outline text-sm" onClick={() => send.mutate()} disabled={send.isPending || !counts!.shortlisted}>
                  <Mail className="w-4 h-4" /> {send.isPending ? 'Sending…' : 'Email me the CSV'}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Row({ r, assessmentId, maxFlags }: { r: MonitorRow; assessmentId: number; maxFlags: number }) {
  const concern = r.tabSwitches >= 3 || r.cameraFlags > maxFlags;
  return (
    <tr className={r.status === 'in-progress' ? 'bg-sky-500/[0.04]' : ''}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {r.shortlisted && (
            <span className="badge bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/25 tabular-nums" title="Shortlisted">
              #{r.rank}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-medium text-white truncate">{r.name}</p>
            <p className="text-xs text-surface-500 truncate">{r.email ?? '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {r.status === 'in-progress' ? (
          <span className="badge bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1.5 animate-pulse-dot" /> Live · {mmss(r.remainingSeconds)} left
          </span>
        ) : r.status === 'completed' ? (
          r.isProvisional ? (
            <span className="badge bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/25">Grading…</span>
          ) : (
            <span className={`badge ring-1 ${r.passed ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/25' : 'bg-red-500/10 text-red-700 ring-red-500/25'}`}>
              {r.passed ? 'Passed' : 'Did not pass'}
            </span>
          )
        ) : (
          <span className="badge bg-surface-800 text-surface-500 ring-1 ring-surface-700">Not started</span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-surface-300">
        {r.status === 'not-started' ? (
          '—'
        ) : r.status === 'in-progress' ? (
          <>
            {r.answered}/{r.totalQuestions} answered
            <span className="block text-xs text-surface-500">started {r.startedAt ? formatDate(r.startedAt) : ''}</span>
          </>
        ) : (
          <>
            {minutes(r.timeTakenSeconds)}
            <span className="block text-xs text-surface-500">{r.submittedAt ? formatDate(r.submittedAt) : ''}</span>
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {r.status === 'completed' ? (
          <>
            <span className="font-semibold text-white">{r.overallScore.toFixed(1)}%</span>
            <span className="block text-xs text-surface-500">{r.marksObtained}/{r.totalMarks}</span>
          </>
        ) : (
          <span className="text-surface-600">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
        {r.status === 'not-started' ? (
          <span className="text-surface-600">—</span>
        ) : (
          <span className={`inline-flex items-center gap-2 ${concern ? 'text-red-600' : 'text-surface-400'}`}>
            <span className="inline-flex items-center gap-1" title="Tab switches">
              <EyeOff className="w-3.5 h-3.5" /> {r.tabSwitches}
            </span>
            <span className="inline-flex items-center gap-1" title={r.flagReasons.join(', ') || 'Camera flags'}>
              <Camera className="w-3.5 h-3.5" /> {r.cameraFlags}
            </span>
            {concern && <span className="font-medium">review</span>}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {r.status === 'completed' && (
          <Link to={`/admin/reports/${encodeURIComponent(r.name)}/${assessmentId}`} className="text-xs font-medium text-primary-600 hover:text-primary-700">
            Report →
          </Link>
        )}
      </td>
    </tr>
  );
}
