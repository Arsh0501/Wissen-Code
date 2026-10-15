import {
  TemplatesPanel,
  AccommodationsPanel,
} from '../../components/platform/AssessmentTools';
import { useAuth } from '../../context/AuthContext';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { getAssessments, apiError } from '../../services/api';
import { apiData } from '../../services/workflows';
import { CheckCircle, AlertCircle } from 'lucide-react';
type Analytics = {
  limited: boolean;
  name: string;
  started: number;
  completed: number;
  pendingGrading: number;
  completionRate: number;
  candidates: {
    sessionId: number;
    date: string;
    name: string;
    score: number;
    pendingReview: boolean;
    skills: Record<string, number>;
  }[];
  questions: {
    id: number;
    title: string;
    difficulty: string;
    attempts: number;
    average: number | null;
    fullScore: number;
  }[];
};
type Match = {
  submissionId: number;
  comparedSubmissionId: number;
  leftName: string;
  rightName: string;
  question: string;
  percent: number;
  shared: number;
  leftCode: string;
  rightCode: string;
};
type Integrity = {
  matches: Match[];
  method: string;
  limited: boolean;
  reviews: {
    submissionId: number;
    comparedSubmissionId: number;
    decision: string;
    notes: string;
  }[];
  sessions: {
    id: number;
    candidateName: string;
    _count: { tabSwitches: number; pasteEvents: number };
  }[];
};
type Review = {
  id: number;
  candidateName: string;
  code: string;
  question: { title: string; settings: { rubric: string } };
};
type Message = {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  scheduledAt: string;
  error?: string;
};
export default function OperationsPage() {
  const { user } = useAuth();
  const owner = (user?.accessRole ?? user?.role) === 'admin';
  const [tab, setTab] = useState('analytics');
  const assessments = useQuery({
    queryKey: ['operations-assessments'],
    queryFn: getAssessments,
  });
  const [chosen, setChosen] = useState('');
  const id = chosen || String(assessments.data?.[0]?.id ?? '');
  return (
    <AdminLayout
      title="Hiring operations"
      subtitle="Compare results, review evidence, manage invitations, and check your deployment."
    >
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          'analytics',
          'integrity',
          'review',
          'invitations',
          'accommodations',
          'templates',
          'delivery',
          ...(owner ? ['readiness', 'audit'] : []),
        ].map((t) => (
          <button
            className={tab === t ? 'btn-primary' : 'btn-outline'}
            key={t}
            onClick={() => setTab(t)}
          >
            {
              (
                {
                  analytics: 'Analytics',
                  integrity: 'Integrity review',
                  review: 'Manual scoring',
                  invitations: 'Invitations',
                  accommodations: 'Accommodations',
                  templates: 'Role templates',
                  delivery: 'Email delivery',
                  readiness: 'System readiness',
                  audit: 'Audit history',
                } as Record<string, string>
              )[t]
            }
          </button>
        ))}
      </div>
      {[
        'analytics',
        'integrity',
        'review',
        'invitations',
        'accommodations',
      ].includes(tab) && (
        <label className="label mb-5">
          Assessment
          <select
            aria-label="Assessment"
            className="input mt-2 max-w-xl"
            value={id}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value="" disabled>
              Select assessment
            </option>
            {assessments.data?.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name} · {a.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {assessments.error && <p role="alert">{apiError(assessments.error)}</p>}
      {id && tab === 'analytics' && <AnalyticsPanel key={id} id={id} />}
      {id && tab === 'integrity' && <IntegrityPanel key={id} id={id} />}
      {id && tab === 'review' && <ManualReview key={id} id={id} />}
      {id && tab === 'invitations' && <InvitationPanel key={id} id={id} />}
      {id && tab === 'accommodations' && (
        <AccommodationsPanel key={id} id={id} />
      )}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'delivery' && <DeliveryPanel />}
      {tab === 'readiness' && <ReadinessPanel />}
      {tab === 'audit' && <AuditPanel />}
      {!id &&
        !assessments.isPending &&
        [
          'analytics',
          'integrity',
          'review',
          'invitations',
          'accommodations',
        ].includes(tab) && (
          <p className="card">Create an assessment to use this workflow.</p>
        )}
    </AdminLayout>
  );
}
function AnalyticsPanel({ id }: { id: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useQuery({
    queryKey: ['operations-analytics', id, from, to],
    queryFn: () =>
      apiData<Analytics>(
        `/platform/assessments/${id}/analytics?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`,
      ),
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState('');
  useEffect(() => setSelected([]), [from, to]);
  if (query.isPending) return <p role="status">Loading analytics…</p>;
  if (query.error) return <p role="alert">{apiError(query.error)}</p>;
  const a = query.data;
  const comparison = a.candidates.filter((c) => selected.includes(c.sessionId));
  const skills = [...new Set(comparison.flatMap((c) => Object.keys(c.skills)))];
  const days = [
    ...new Set(a.candidates.map((c) => c.date.slice(0, 10))),
  ].sort();
  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap gap-4 items-end">
        <label className="label">
          Attempt start date from (UTC)
          <input
            type="date"
            className="input mt-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="label">
          Through (UTC)
          <input
            type="date"
            className="input mt-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="btn-outline"
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          All dates
        </button>
        {a.limited && (
          <p className="text-sm text-amber-600">
            Showing the latest 1000 attempts in this date range. Narrow the
            dates for a smaller cohort.
          </p>
        )}
      </section>
      <div className="grid sm:grid-cols-4 gap-4">
        {[
          ['Started', a.started],
          ['Completed', a.completed],
          ['Completion rate', `${a.completionRate}%`],
          ['Grading issues / running', a.pendingGrading],
        ].map(([k, v]) => (
          <div className="card" key={k}>
            <p className="text-sm text-surface-500">{k}</p>
            <strong className="text-3xl block mt-2">{v}</strong>
          </div>
        ))}
      </div>
      {days.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="font-semibold mb-4">Cohort trends</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Attempt date (UTC)</th>
                <th>Completed attempts</th>
                <th>Average score</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const rows = a.candidates.filter((c) => c.date.startsWith(day));
                return (
                  <tr className="border-t border-surface-800" key={day}>
                    <td className="p-3">{day}</td>
                    <td>{rows.length}</td>
                    <td>
                      {Math.round(
                        rows.reduce((sum, c) => sum + c.score, 0) / rows.length,
                      )}
                      %
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-4">Question performance</h2>
        <table className="w-full text-sm text-left">
          <thead>
            <tr>
              {[
                'Question',
                'Difficulty',
                'Attempts',
                'Average',
                'Full score',
              ].map((h) => (
                <th className="p-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.questions.map((q) => (
              <tr className="border-t border-surface-800" key={q.id}>
                <td className="p-3">{q.title}</td>
                <td>{q.difficulty}</td>
                <td>{q.attempts}</td>
                <td>{q.average === null ? '—' : `${q.average}%`}</td>
                <td>{q.fullScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card space-y-3">
        <h2 className="font-semibold">Compare candidates by skill</h2>
        <p className="text-sm text-surface-500">
          Select up to four completed attempts. Scores awaiting manual review
          are provisional.
        </p>
        <input
          className="input max-w-md"
          aria-label="Search candidates"
          placeholder="Search candidates"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex flex-wrap gap-4">
          {a.candidates
            .filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
            .map((c) => (
              <label className="flex gap-2 items-center" key={c.sessionId}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.sessionId)}
                  disabled={
                    !selected.includes(c.sessionId) && selected.length >= 4
                  }
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked
                        ? [...v, c.sessionId]
                        : v.filter((x) => x !== c.sessionId),
                    )
                  }
                />
                {c.name} · {c.score}%{c.pendingReview && ' (provisional)'}
              </label>
            ))}
        </div>
        {!a.candidates.length && <p>No graded attempts yet.</p>}
        {comparison.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  <th className="p-3">Skill</th>
                  {comparison.map((c) => (
                    <th className="p-3" key={c.sessionId}>
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skills.map((skill) => (
                  <tr className="border-t border-surface-800" key={skill}>
                    <td className="p-3">{skill}</td>
                    {comparison.map((c) => (
                      <td key={c.sessionId}>
                        {c.skills[skill] === undefined
                          ? '—'
                          : `${c.skills[skill]}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
function IntegrityPanel({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['operations-integrity', id],
    queryFn: () => apiData<Integrity>(`/platform/assessments/${id}/integrity`),
  });
  if (query.isPending) return <p role="status">Analyzing submissions…</p>;
  if (query.error) return <p role="alert">{apiError(query.error)}</p>;
  return (
    <div className="space-y-4">
      <p className="card text-sm">
        {query.data.method}
        {query.data.limited &&
          ' Analysis is limited to the most recent 200 submissions.'}
      </p>
      <section className="card">
        <h2 className="font-semibold mb-3">Recorded browser events</h2>
        {query.data.sessions.map((s) => (
          <p className="text-sm mb-2" key={s.id}>
            {s.candidateName}: {s._count.tabSwitches} tab switches ·{' '}
            {s._count.pasteEvents} paste events
          </p>
        ))}
      </section>
      {!query.data.matches.length && (
        <p className="card">
          No submission pairs met the similarity threshold. This does not
          certify assessment integrity.
        </p>
      )}
      {query.data.matches.map((match) => (
        <SimilarityReview
          key={`${match.submissionId}:${match.comparedSubmissionId}`}
          id={id}
          match={match}
          existing={query.data.reviews.find(
            (r) =>
              r.submissionId === match.submissionId &&
              r.comparedSubmissionId === match.comparedSubmissionId,
          )}
        />
      ))}
    </div>
  );
}
function SimilarityReview({
  id,
  match,
  existing,
}: {
  id: string;
  match: Match;
  existing?: Integrity['reviews'][number];
}) {
  const client = useQueryClient();
  const [decision, setDecision] = useState(
    existing?.decision ?? 'needs_review',
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      apiData(`/platform/assessments/${id}/integrity/review`, 'post', {
        submissionId: match.submissionId,
        comparedSubmissionId: match.comparedSubmissionId,
        decision,
        notes,
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['operations-integrity', id] }),
  });
  return (
    <section className="card space-y-4">
      <h3 className="font-semibold">
        {match.leftName} / {match.rightName} · {match.percent}% similarity
      </h3>
      <p className="text-sm text-surface-500">
        {match.question} · {match.shared} shared token sequences
      </p>
      <details>
        <summary>Compare code evidence</summary>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <pre className="sample-box overflow-auto max-h-80 text-xs">
            {match.leftCode}
          </pre>
          <pre className="sample-box overflow-auto max-h-80 text-xs">
            {match.rightCode}
          </pre>
        </div>
      </details>
      <select
        aria-label="Review decision"
        className="input"
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
      >
        <option value="needs_review">Needs review</option>
        <option value="cleared">Cleared</option>
        <option value="escalated">Escalated for further review</option>
      </select>
      <textarea
        className="input"
        aria-label="Review evidence"
        placeholder="Explain the evidence and context behind your decision"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button
        className="btn-primary"
        disabled={notes.trim().length < 5 || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Save review
      </button>
      {mutation.isSuccess && <p role="status">Review saved.</p>}
      {mutation.error && <p role="alert">{apiError(mutation.error)}</p>}
    </section>
  );
}
function ManualReview({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['manual-review', id],
    queryFn: () => apiData<Review[]>(`/platform/assessments/${id}/reviews`),
  });
  return (
    <div className="space-y-4">
      {query.isPending && <p>Loading review queue…</p>}
      {query.error && <p role="alert">{apiError(query.error)}</p>}
      {query.data?.length === 0 && (
        <p className="card">No answers are waiting for manual review.</p>
      )}
      {query.data?.map((r) => (
        <ScoreReview key={r.id} review={r} id={id} />
      ))}
    </div>
  );
}
function ScoreReview({ review, id }: { review: Review; id: string }) {
  const client = useQueryClient();
  const [score, setScore] = useState(0);
  const [evidence, setEvidence] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      apiData(`/platform/submissions/${review.id}/review`, 'post', {
        score,
        evidence,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['manual-review', id] });
      void client.invalidateQueries({ queryKey: ['operations-analytics', id] });
    },
  });
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">
        {review.candidateName} · {review.question.title}
      </h2>
      <p className="whitespace-pre-wrap text-sm">
        Rubric: {review.question.settings.rubric}
      </p>
      <pre className="sample-box whitespace-pre-wrap overflow-auto max-h-96 text-sm">
        {review.code}
      </pre>
      <label className="label">
        Score (0–100)
        <input
          type="number"
          min={0}
          max={100}
          className="input mt-2"
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
        />
      </label>
      <label className="label">
        Evidence and rationale
        <textarea
          className="input mt-2"
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
        />
      </label>
      <button
        className="btn-primary"
        disabled={mutation.isPending || evidence.trim().length < 10}
        onClick={() => mutation.mutate()}
      >
        Save evaluation
      </button>
      {mutation.error && <p role="alert">{apiError(mutation.error)}</p>}
    </section>
  );
}
function InvitationPanel({ id }: { id: string }) {
  const [emails, setEmails] = useState('');
  const [reminder, setReminder] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      apiData<{ count: number }>(
        `/platform/assessments/${id}/invitations`,
        'post',
        {
          emails: emails
            .split(/[\s,;]+/)
            .map((e) => e.trim())
            .filter(Boolean),
          ...(reminder ? { reminderAt: new Date(reminder).toISOString() } : {}),
        },
      ),
  });
  return (
    <section className="card max-w-3xl space-y-4">
      <h2 className="font-semibold">Bulk candidate invitations</h2>
      <p className="text-sm text-surface-500">
        Each recipient receives a separate single-use invitation. Send up to 100
        invitations per batch.
      </p>
      <label className="label">
        Candidate emails
        <textarea
          className="input mt-2"
          rows={6}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="candidate@example.com, another@example.com"
        />
      </label>
      <label className="label">
        Optional reminder (your local time)
        <input
          className="input mt-2"
          type="datetime-local"
          value={reminder}
          onChange={(e) => setReminder(e.target.value)}
        />
      </label>
      <button
        className="btn-primary"
        disabled={!emails.trim() || mutation.isPending || mutation.isSuccess}
        onClick={() => mutation.mutate()}
      >
        Queue invitations
      </button>
      {mutation.data && (
        <p role="status">
          {mutation.data.count} invitations queued. Check Email delivery for
          status.
        </p>
      )}
      {mutation.error && <p role="alert">{apiError(mutation.error)}</p>}
    </section>
  );
}
function DeliveryPanel() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['outbound-messages'],
    queryFn: () => apiData<Message[]>('/platform/messages'),
    refetchInterval: 10000,
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      apiData(`/platform/messages/${id}/retry`, 'post'),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['outbound-messages'] }),
  });
  return (
    <section className="card overflow-x-auto">
      <h2 className="font-semibold mb-4">Email delivery</h2>
      <p className="text-sm text-surface-500 mb-4">
        Sent means the email provider accepted the message. It does not confirm
        inbox delivery.
      </p>
      {query.error && <p role="alert">{apiError(query.error)}</p>}
      {!query.data?.length && (
        <p>No invitations have been queued by your account.</p>
      )}
      <table className="w-full text-left text-sm">
        <tbody>
          {query.data?.map((m) => (
            <tr className="border-t border-surface-800" key={m.id}>
              <td className="p-3">
                {m.recipient}
                <p className="text-xs text-surface-500">{m.subject}</p>
              </td>
              <td>{m.status}</td>
              <td>{new Date(m.scheduledAt).toLocaleString()}</td>
              <td>
                {m.error}
                {m.status === 'failed' && (
                  <button
                    className="btn-outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(m.id)}
                  >
                    Retry
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {retry.error && <p role="alert">{apiError(retry.error)}</p>}
    </section>
  );
}
function ReadinessPanel() {
  const query = useQuery({
    queryKey: ['platform-readiness'],
    queryFn: () =>
      apiData<{
        ready: boolean;
        checks: { name: string; ready: boolean; detail: string }[];
      }>('/platform/readiness'),
  });
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">System readiness</h2>
      <p className="text-sm text-surface-500">
        Configuration checks help identify setup gaps. A configured service
        still needs live verification, deployment testing, and operational
        monitoring.
      </p>
      <button
        className="btn-outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh checks
      </button>
      {query.error && <p role="alert">{apiError(query.error)}</p>}
      {query.data?.checks.map((c) => (
        <div
          className="flex gap-3 p-3 border-b border-surface-800"
          key={c.name}
        >
          {c.ready ? (
            <CheckCircle className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="text-amber-600 shrink-0" />
          )}
          <div>
            <strong>{c.name}</strong>
            <p className="text-sm text-surface-500">{c.detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
function AuditPanel() {
  const query = useQuery({
    queryKey: ['platform-audit'],
    queryFn: () =>
      apiData<
        {
          id: number;
          action: string;
          actorId: number | null;
          resource: string;
          resourceId: string;
          createdAt: string;
          detail: unknown;
        }[]
      >('/platform/audit'),
  });
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Recent administrative actions</h2>
      {query.error && <p role="alert">{apiError(query.error)}</p>}
      {query.data?.length === 0 && <p>No recorded actions yet.</p>}
      {query.data?.map((e) => (
        <details className="p-3 border-b border-surface-800" key={e.id}>
          <summary>
            {new Date(e.createdAt).toLocaleString()} · {e.action} · {e.resource}{' '}
            {e.resourceId} · User {e.actorId ?? 'system'}
          </summary>
          <pre className="sample-box text-xs mt-2">
            {JSON.stringify(e.detail, null, 2)}
          </pre>
        </details>
      ))}
    </section>
  );
}
