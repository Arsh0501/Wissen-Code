import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
import { parseAIResults } from '../../hooks/useInterviewLive';
import type { FollowUpSuggestion } from '../ai/InterviewAI';

interface ManualFollowUp {
  id: string;
  question: string;
  status: 'pending' | 'asked' | 'dismissed';
}

interface AIStatus {
  configured: boolean;
  results: unknown;
  jobs: { kind: string; status: string }[];
}

export default function QuestionFollowUps({ interviewId, questionId, status, suggestions }: {
  interviewId: number;
  questionId: number;
  status: string;
  suggestions: FollowUpSuggestion[];
}) {
  const client = useQueryClient();
  const active = status === 'in_progress';
  const path = `/interviews/${interviewId}/questions/${questionId}/follow-ups`;
  const key = ['question-follow-ups', interviewId, questionId];
  const aiKey = ['interview-ai', interviewId];
  const [composing, setComposing] = useState(false);
  const [question, setQuestion] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [reviewed, setReviewed] = useState<Partial<Record<string, 'asked' | 'dismissed'>>>({});
  const [showAll, setShowAll] = useState(false);
  const manual = useQuery({ queryKey: key, queryFn: () => apiData<ManualFollowUp[]>(path), refetchInterval: active ? 5000 : false });
  const ai = useQuery({ queryKey: aiKey, queryFn: () => apiData<AIStatus>(`/interview-workflows/${interviewId}/ai-results`), refetchInterval: active ? 5000 : false });
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: key }),
    client.invalidateQueries({ queryKey: ['interview', interviewId] }),
    client.invalidateQueries({ queryKey: aiKey }),
  ]);
  const create = useMutation({
    mutationFn: (askNow: boolean) => apiData<ManualFollowUp>(path, 'post', { question: question.trim(), requestId, askNow }),
    onSuccess: () => { setQuestion(''); setRequestId(crypto.randomUUID()); setComposing(false); },
    onSettled: refresh,
  });
  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'asked' | 'dismissed' }) => apiData(`${path}/${id}`, 'put', { status }),
    onSuccess: refresh,
  });
  const review = useMutation({
    mutationFn: ({ item, decision }: { item: FollowUpSuggestion; decision: 'ask' | 'dismiss' }) => {
      if (!item.jobId) throw new Error('Refresh AI suggestions before asking this follow-up.');
      return apiData<{ decision?: 'ask' | 'dismiss' }>(`/ai/jobs/${item.jobId}/review`, 'post', { itemId: item.id, decision });
    },
    onSuccess: async (result, { item, decision }) => {
      const recordedDecision = result.decision ?? decision;
      setReviewed(previous => ({ ...previous, [item.id]: recordedDecision === 'ask' ? 'asked' : 'dismissed' }));
      await refresh();
    },
  });
  const generate = useMutation({
    mutationFn: async () => {
      const job = await apiData<{ status?: string; error?: string }>('/ai/jobs', 'post', {
        kind: 'interview-assistant', interviewId, input: { questionId },
      });
      if (job.status === 'failed') throw new Error(job.error || 'Follow-up generation failed. Retry after checking the saved evidence.');
      return job;
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: aiKey }); },
  });
  const scoped = [...new Map([...suggestions, ...parseAIResults(ai.data?.results).followUps]
    .filter(item => item.questionId === questionId)
    .map(item => [item.id, item])).values()].reverse();
  const waiting = ai.data?.jobs?.some(job => job.kind === 'interview-assistant' && ['queued', 'running'].includes(job.status));
  const busy = create.isPending || mark.isPending || review.isPending;
  const error = manual.error || generate.error || create.error || mark.error || review.error;

  return <section aria-label="Current question follow-ups" className="border-t border-surface-800 pt-4 space-y-3">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <h3 className="font-semibold">Follow-ups for this question</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline text-xs" disabled={!active || busy} onClick={() => setComposing(value => !value)}>Ask follow-up</button>
        <button type="button" className="btn-primary text-xs" disabled={!active || !ai.data?.configured || generate.isPending || waiting} onClick={() => generate.mutate()}>{generate.isPending || waiting ? 'Generating follow-ups…' : 'Ask AI for follow-ups'}</button>
      </div>
    </div>
    <p className="text-xs text-surface-400">AI uses the saved reviewed transcript, feedback or latest candidate submission for this question. Mark questions as asked to include them in the interview report.</p>
    {ai.error && <p role="alert" className="text-sm text-red-400">{apiError(ai.error)} <button className="btn-outline text-xs" onClick={() => ai.refetch()}>Retry AI status</button></p>}
    {ai.data && !ai.data.configured && <p className="text-xs text-amber-500">AI is not configured. You can still add follow-ups manually.</p>}
    {composing && <form className="rounded-lg border border-surface-700 p-3 space-y-3" onSubmit={event => { event.preventDefault(); if (question.trim()) create.mutate(false); }}>
      <fieldset disabled={!active || busy} className="space-y-3">
        <label className="label">Manual follow-up<textarea className="input mt-1" required maxLength={2000} rows={3} value={question} onChange={event => { setQuestion(event.target.value); setRequestId(crypto.randomUUID()); }} placeholder="Enter a follow-up for the current question." /></label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline text-xs" disabled={!question.trim()}>Add follow-up</button>
          <button type="button" className="btn-primary text-xs" disabled={!question.trim()} onClick={() => create.mutate(true)}>Ask now</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => setComposing(false)}>Cancel</button>
        </div>
      </fieldset>
    </form>}
    {manual.data?.map(item => <article key={item.id} className="rounded-lg border border-surface-700 p-3 space-y-2">
      <div className="flex justify-between gap-3"><p className="text-sm whitespace-pre-wrap">{item.question}</p><span className="text-xs text-surface-400 shrink-0">Manual · {item.status === 'asked' ? 'Asked' : item.status === 'dismissed' ? 'Dismissed' : 'Pending'}</span></div>
      {item.status === 'pending' && <div className="flex gap-2"><button className="btn-primary text-xs" disabled={!active || busy} onClick={() => mark.mutate({ id: item.id, status: 'asked' })}>Ask</button><button className="btn-outline text-xs" disabled={!active || busy} onClick={() => mark.mutate({ id: item.id, status: 'dismissed' })}>Dismiss</button></div>}
    </article>)}
    {scoped.slice(0, showAll ? scoped.length : 6).map(item => {
      const state = reviewed[item.id] ?? item.status ?? 'pending';
      return <article key={item.id} className="rounded-lg border border-primary-500/25 p-3 space-y-2">
        <div className="flex justify-between gap-3"><p className="text-sm whitespace-pre-wrap">{item.question}</p><span className="text-xs text-surface-400 shrink-0">AI · {state === 'asked' ? 'Asked' : state === 'dismissed' ? 'Dismissed' : 'Pending'}</span></div>
        {item.context && <details><summary className="text-xs cursor-pointer text-surface-400">Why this follow-up?</summary><p className="text-xs mt-2">{item.context}</p></details>}
        {state === 'pending' && <div className="flex gap-2"><button className="btn-primary text-xs" disabled={!active || busy} onClick={() => review.mutate({ item, decision: 'ask' })}>Ask</button><button className="btn-outline text-xs" disabled={!active || busy} onClick={() => review.mutate({ item, decision: 'dismiss' })}>Dismiss</button></div>}
      </article>;
    })}
    {scoped.length > 6 && <button className="btn-ghost text-xs" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer suggestions' : `Show all ${scoped.length} suggestions`}</button>}
    {error && <p role="alert" className="text-sm text-red-400">{apiError(error)}</p>}
  </section>;
}
