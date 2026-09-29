import { useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getQuestions, apiError } from '../services/api';
import { approveQuestion, rejectQuestion, revalidateQuestion, parseReport } from '../services/ai';
import type { Question } from '../types';
import ValidationPanel, { VerdictBadge } from './ValidationPanel';
import { Spinner, EmptyState, parseJsonArray } from './ui';
import { Sparkles, CheckCircle, XCircle, RefreshCw, Edit, ChevronDown, ClipboardCheck } from 'lucide-react';

// AI-generated questions waiting for a person to approve them into the bank
export default function ReviewQueue() {
  const qc = useQueryClient();
  const { data: pending, isLoading, error } = useQuery({
    queryKey: ['questions', 'pending_review'],
    queryFn: () => getQuestions({ status: 'pending_review' }),
  });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['questions'] });
  };

  const approve = useMutation({
    mutationFn: approveQuestion,
    onSuccess: () => { setMessage({ tone: 'ok', text: 'Approved and added to the question bank.' }); refresh(); },
    onError: (err) => { setMessage({ tone: 'error', text: apiError(err, 'Could not approve') }); refresh(); },
  });
  const reject = useMutation({
    mutationFn: rejectQuestion,
    onSuccess: () => { setMessage({ tone: 'ok', text: 'Rejected. It will not be used.' }); refresh(); },
    onError: (err) => setMessage({ tone: 'error', text: apiError(err, 'Could not reject') }),
  });
  const revalidate = useMutation({
    mutationFn: revalidateQuestion,
    onSuccess: refresh,
    onError: (err) => setMessage({ tone: 'error', text: apiError(err, 'Could not validate') }),
  });

  if (isLoading) return <Spinner label="Loading review queue..." />;
  if (error) return <p className="text-sm text-red-600">{apiError(error, 'Failed to load the review queue')}</p>;

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-primary-500/[0.06] border border-primary-500/15 text-sm text-surface-300 flex gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
        <span>AI-generated questions stay here until someone approves them. Approving re-runs validation, and a question that fails any check can't be approved until it's fixed.</span>
      </div>
      {message && (
        <div className={`p-3 rounded-lg text-sm border ${message.tone === 'ok' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700' : 'bg-red-500/10 border-red-500/25 text-red-700'}`}>{message.text}</div>
      )}
      {!pending?.length ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing to review"
          body="Questions you generate with AI and save for review will appear here."
          action={<Link to="/admin/questions/ai" className="btn-primary"><Sparkles className="w-4 h-4" /> Generate with AI</Link>}
        />
      ) : (
        pending.map((q) => (
          <ReviewCard
            key={q.id}
            q={q}
            busy={approve.isPending || reject.isPending || revalidate.isPending}
            onApprove={() => { setMessage(null); approve.mutate(q.id); }}
            onReject={() => { setMessage(null); reject.mutate(q.id); }}
            onRevalidate={() => revalidate.mutate(q.id)}
            validating={revalidate.isPending && revalidate.variables === q.id}
          />
        ))
      )}
    </div>
  );
}

function ReviewCard({ q, busy, validating, onApprove, onReject, onRevalidate }: {
  q: Question; busy: boolean; validating: boolean; onApprove: () => void; onReject: () => void; onRevalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const report = parseReport(q.validation);
  const blocked = report?.verdict === 'fail';
  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{q.title}</h3>
            <span className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700">{q.type === 'mcq' ? 'Multiple choice' : 'Coding'}</span>
            <span className={`badge-${q.difficulty} capitalize`}>{q.difficulty}</span>
            <VerdictBadge report={report} />
          </div>
          <p className="text-xs text-surface-500 mt-1">
            {q.topic && <>{q.topic} · </>}
            {parseJsonArray(q.skills).join(', ') || parseJsonArray(q.tags).filter((t) => t !== 'ai-generated').join(', ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onRevalidate} disabled={busy} className="btn-ghost text-sm" title="Run validation again">
            <RefreshCw className={`w-4 h-4 ${validating ? 'animate-spin' : ''}`} /> Validate
          </button>
          <Link to={`/admin/questions/${q.id}/edit`} className="btn-outline text-sm"><Edit className="w-4 h-4" /> Edit</Link>
          <button onClick={onReject} disabled={busy} className="btn-outline text-sm hover:text-red-600"><XCircle className="w-4 h-4" /> Reject</button>
          <button onClick={onApprove} disabled={busy || blocked} className="btn-primary text-sm" title={blocked ? 'Fix the failed checks first' : 'Add to the question bank'}>
            <CheckCircle className="w-4 h-4" /> Approve
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-2.5 border-t border-surface-800 bg-surface-950 text-xs font-medium text-surface-400 hover:bg-surface-800/50 cursor-pointer"
        aria-expanded={open}
      >
        <span>Question &amp; validation report</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid lg:grid-cols-2 gap-5 p-5 border-t border-surface-800">
          <div className="text-sm text-surface-300 space-y-2 [&_strong]:text-white [&_code]:px-1 [&_code]:rounded [&_code]:bg-surface-800 [&_pre]:bg-surface-950 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown>{q.statement}</ReactMarkdown>
            {q.type === 'mcq' && (
              <ul className="!list-none !pl-0 space-y-1.5 mt-3">
                {parseJsonArray<{ id: string; text: string }>(q.options).map((o) => {
                  const right = parseJsonArray(q.correctOptions).includes(o.id);
                  return (
                    <li key={o.id} className={`px-3 py-2 rounded-lg border text-sm ${right ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700' : 'border-surface-800'}`}>
                      <b className="uppercase mr-2">{o.id}</b>{o.text}{right && ' ✓'}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            {report ? <ValidationPanel report={report} /> : <p className="text-sm text-surface-500">Not validated yet. Click Validate.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
