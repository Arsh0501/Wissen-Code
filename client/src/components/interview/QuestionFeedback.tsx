import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';

function savedFeedback(notes?: string) {
  try { const value = JSON.parse(notes ?? '{}').interviewerFeedback; return typeof value === 'string' ? value : ''; }
  catch { return ''; }
}

export default function QuestionFeedback({ interviewId, questionId, notes, active, children }: { interviewId: number; questionId: number; notes?: string; active: boolean; children?: ReactNode }) {
  const [feedback, setFeedback] = useState(() => savedFeedback(notes));
  const [saved, setSaved] = useState(() => savedFeedback(notes));
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (content: string) => apiData(`/interviews/${interviewId}/questions/${questionId}/feedback`, 'put', { feedback: content }),
    onSuccess: (_, content) => {
      setSaved(content);
      void client.invalidateQueries({ queryKey: ['interview', interviewId] });
    },
  });
  return <section className="space-y-3">
    <label className="label">Your feedback for this question
      <textarea className="input mt-2 w-full" rows={5} maxLength={10000} value={feedback} disabled={!active || save.isPending} onChange={(event) => setFeedback(event.target.value)} placeholder="Record what the candidate explained, what they missed, and areas to probe." />
    </label>
    <p className="text-xs text-surface-500">Private interviewer feedback. Save it before requesting follow-ups for this question.</p>
    <button className="btn-primary" disabled={!active || save.isPending || !feedback.trim() || feedback.trim() === saved} onClick={() => save.mutate(feedback.trim())}>{save.isPending ? 'Saving feedback…' : 'Save question feedback'}</button>
    {save.isSuccess && <p role="status" className="text-xs text-surface-500">{feedback.trim() === saved ? 'Question feedback saved.' : 'You have unsaved feedback changes.'}</p>}
    {save.error && <p role="alert" className="text-sm text-red-500">{apiError(save.error)}</p>}
    {children}
  </section>;
}
