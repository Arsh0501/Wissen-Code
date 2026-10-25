import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';

type Segment = { id: string; text: string; startedAt: string };
type Evidence = { text: string; segmentIds: string[]; reviewedAt: string };
export default function QuestionTranscript({ interviewId, questionId, active, live = false, controls }: { interviewId: number; questionId: number; active: boolean; live?: boolean; controls?: ReactNode }) {
  const [open, setOpen] = useState(live);
  const seen = useRef(new Set<string>());
  const [initialized, setInitialized] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const client = useQueryClient();
  const path = `/interviews/${interviewId}/questions/${questionId}/transcript`;
  const queryKey = ['question-transcript', interviewId, questionId];
  const transcript = useQuery({ queryKey, queryFn: () => apiData<{ segments: Segment[]; evidence: Evidence | null }>(path), enabled: open, refetchInterval: open && active ? 3000 : false });
  const aiKey = ['interview-ai', interviewId];
  const ai = useQuery({ queryKey: aiKey, queryFn: () => apiData<{ configured: boolean; jobs: { kind: string; status: string }[] }>(`/interview-workflows/${interviewId}/ai-results`), enabled: open });
  useEffect(() => {
    if (!initialized && transcript.data) {
      const segments = transcript.data.segments ?? [];
      const evidence = transcript.data.evidence;
      const unseen = segments.filter(segment => !evidence?.segmentIds.includes(segment.id));
      setSelected(live ? [...new Set([...(evidence?.segmentIds ?? []), ...segments.map(segment => segment.id)])] : evidence?.segmentIds ?? []);
      setText(live ? [evidence?.text, ...unseen.map(segment => segment.text)].filter(Boolean).join('\n') : evidence?.text ?? '');
      seen.current = new Set(segments.map(segment => segment.id));
      setInitialized(true);
    } else if (live && transcript.data) {
      const incoming = (transcript.data.segments ?? []).filter(segment => !seen.current.has(segment.id));
      if (incoming.length) {
        incoming.forEach(segment => seen.current.add(segment.id));
        setSelected(previous => [...new Set([...previous, ...incoming.map(segment => segment.id)])]);
        setText(previous => [previous, ...incoming.map(segment => segment.text)].filter(Boolean).join('\n'));
        setMessage('');
      }
    }
  }, [initialized, transcript.data, live]);
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id];
    setSelected(next);
    setText((transcript.data?.segments ?? []).filter(segment => next.includes(segment.id)).map(segment => segment.text).join('\n'));
    setMessage('');
  };
  const save = useMutation({
    mutationFn: async (generate: boolean) => {
      await apiData(path, 'put', { segmentIds: selected, text: text.trim() });
      setMessage('Reviewed transcript saved for this question.');
      if (generate) {
        const job = await apiData<{ status?: string; error?: string }>('/ai/jobs', 'post', { kind: 'interview-assistant', interviewId, input: { questionId } });
        if (job.status === 'failed') throw new Error(job.error || 'Transcript saved, but follow-up generation failed. Retry using Ask AI for follow-ups.');
        setMessage('Follow-up generation requested. Review suggestions in Follow-ups for this question.');
      }
    },
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: aiKey }), client.invalidateQueries({ queryKey: ['interview', interviewId] })]); },
  });
  const waiting = ai.data?.jobs?.some(job => job.kind === 'interview-assistant' && ['queued', 'running'].includes(job.status));
  const disabled = !active || save.isPending || !initialized || !selected.length || !text.trim() || text.length > 10000 || selected.length > 100;
  return <section aria-label="Transcript for current question" className="border-t border-surface-800 pt-4 space-y-3">
    {!live && <button type="button" className="btn-outline text-sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>Use transcript for this question</button>}
    {open && <>
      <p className="text-xs text-surface-400">{live ? 'Recorded speech for the current question appears here as transcription arrives. You can correct the text; new speech is appended without replacing your edits. Review it before requesting follow-ups.' : 'Select this question’s answer segments, review the text, and correct recognition mistakes. Only saved, reviewed text is available to AI. Changing the selection rebuilds the text below.'}</p>
      {transcript.isLoading && <p role="status">Loading transcript…</p>}
      {transcript.error && <p role="alert">{apiError(transcript.error)} <button type="button" onClick={() => transcript.refetch()}>Retry transcript</button></p>}
      {transcript.data && !transcript.data.segments?.length && <p className="text-sm text-surface-400">No transcript segments for this question yet. Select it as the current question and start transcription in Video, chat &amp; board.</p>}
      {!live && <fieldset disabled={!active || save.isPending} className="max-h-56 overflow-auto space-y-2">
        <legend className="text-sm font-medium">Candidate answer segments</legend>
        {transcript.data?.segments?.map(segment => <label key={segment.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(segment.id)} onChange={() => toggle(segment.id)} /><span><span className="text-xs text-surface-500">{new Date(segment.startedAt).toLocaleTimeString()}</span> {segment.text}</span></label>)}
      </fieldset>}
      <div className="flex flex-wrap items-start justify-between gap-3"><label className="label" htmlFor={`question-transcript-${interviewId}-${questionId}`}>{live ? 'Live transcript for this question' : 'Reviewed transcript for this question'}</label>{controls}</div>
      <textarea id={`question-transcript-${interviewId}-${questionId}`} className="input w-full" rows={5} maxLength={10000} value={text} disabled={!active || save.isPending || !selected.length} onChange={event => { setText(event.target.value); setMessage(''); }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline text-xs" disabled={disabled} onClick={() => save.mutate(false)}>Save transcript for this question</button>
        <button type="button" className="btn-primary text-xs" disabled={disabled || !ai.data?.configured || waiting} onClick={() => save.mutate(true)}>{save.isPending ? 'Saving…' : live ? 'Suggest follow-ups from transcript' : 'Generate follow-ups from selected transcript'}</button>
      </div>
      {ai.data && !ai.data.configured && <p className="text-xs text-amber-400">Configure an AI provider to generate follow-ups. You can still save the reviewed transcript.</p>}
      {ai.error && <p role="alert">{apiError(ai.error)}</p>}
      {save.error && <p role="alert">{apiError(save.error)}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </>}
  </section>;
}
