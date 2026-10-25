import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiData, workflowKeys } from '../../services/workflows';
import { apiError } from '../../services/api';
import { initialFeedbackCriteria, validFeedbackCriteria, type FeedbackCriterion } from '../../services/interviewFeedback';
import InterviewFeedbackReportDownload, { downloadInterviewFeedbackReport, type FeedbackReportMetadata } from './InterviewFeedbackReportDownload';

export interface FeedbackInterview {
  id: number;
  status: string;
  feedbackCriteria?: FeedbackCriterion[];
  feedbackRevision?: number;
  finalFeedback?: string | null;
  finalRating?: number | null;
  finalRecommendation?: string | null;
}

export default function InterviewFeedback({ interview, openFinal = false }: {
  interview: FeedbackInterview;
  openFinal?: boolean;
}) {
  const client = useQueryClient();
  const [criteria, setCriteria] = useState(() => initialFeedbackCriteria(interview.feedbackCriteria));
  const [revision, setRevision] = useState(interview.feedbackRevision ?? 0);
  const [dirty, setDirty] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customError, setCustomError] = useState('');
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState(interview.finalFeedback ?? '');
  const [rating, setRating] = useState(interview.finalRating ? String(interview.finalRating) : '');
  const [recommendation, setRecommendation] = useState(interview.finalRecommendation ?? '');
  const [notice, setNotice] = useState('');
  const [reportDownloadError, setReportDownloadError] = useState('');
  const completed = interview.status === 'completed';
  const dialogRef = useRef<HTMLElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (!editing || !completed) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLSelectElement>('select')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!submitting.current) setEditing(false); }
      if (event.key === 'Tab') {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); previousFocus?.focus(); };
  }, [editing, completed]);

  useEffect(() => {
    if (openFinal && completed) setEditing(true);
  }, [openFinal, completed]);

  useEffect(() => {
    if (!dirty && (interview.feedbackRevision ?? 0) >= revision) {
      setCriteria(initialFeedbackCriteria(interview.feedbackCriteria));
      setRevision(interview.feedbackRevision ?? 0);
      setFeedback(interview.finalFeedback ?? '');
      setRating(interview.finalRating ? String(interview.finalRating) : '');
      setRecommendation(interview.finalRecommendation ?? '');
    }
  }, [interview.feedbackRevision, interview.feedbackCriteria, interview.finalFeedback, interview.finalRating, interview.finalRecommendation, dirty, revision]);

  const save = useMutation({
    mutationFn: (final: boolean) => apiData<{ interview: FeedbackInterview; report?: FeedbackReportMetadata | null }>(
      `/interviews/${interview.id}/feedback${final ? '' : '/criteria'}`,
      final ? 'post' : 'put',
      {
        criteria,
        revision,
        ...(final ? { finalFeedback: feedback.trim(), finalRating: Number(rating), finalRecommendation: recommendation } : {}),
      },
    ),
    onSuccess: async (result, final) => {
      setRevision(result.interview?.feedbackRevision ?? revision + 1);
      setDirty(!final && editing);
      setNotice(final ? 'Feedback saved successfully.' : 'Feedback criteria saved.');
      if (final) setEditing(false);
      setReportDownloadError('');
      if (result.report) client.setQueryData(['interview-feedback-report', interview.id], result.report);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['interview', interview.id] }),
        client.invalidateQueries({ queryKey: workflowKeys.interviews }),
        client.invalidateQueries({ queryKey: ['interviewer-interviews'] }),
        client.invalidateQueries({ queryKey: ['interview-feedback-report', interview.id] }),
      ]);
      if (final && result.report?.status === 'ready') {
        try { await downloadInterviewFeedbackReport(interview.id); }
        catch { setReportDownloadError('Feedback was saved, but the PDF download did not start. Use Download PDF report to retry.'); }
      }
    },
  });
  submitting.current = save.isPending;

  function update(key: string, changes: Partial<FeedbackCriterion>) {
    setCriteria(previous => previous.map(criterion => criterion.key === key ? { ...criterion, ...changes } : criterion));
    setDirty(true);
    setNotice('');
  }

  function addCriterion() {
    const label = customLabel.trim();
    if (!label || criteria.length >= 23) return;
    if (criteria.some(criterion => criterion.label.trim().toLowerCase() === label.toLowerCase())) {
      setCustomError('A criterion with this name already exists.');
      return;
    }
    setCriteria(previous => [...previous, { key: `custom_${crypto.randomUUID()}`, label, rating: null, feedback: '' }]);
    setCustomLabel('');
    setCustomError('');
    setDirty(true);
    setNotice('');
  }

  if (!['in_progress', 'completed'].includes(interview.status)) {
    return <section className="card">Interview feedback becomes available when the interview starts.</section>;
  }
  const valid = validFeedbackCriteria(criteria);
  return <><section aria-label="Interview feedback" className="card space-y-5">
    <div><h2 className="font-semibold">Interview feedback</h2><p className="text-sm text-surface-400 mt-1">A rating from 1–5 is required for every criterion. Supporting comments are optional.</p></div>
    <form className="space-y-5" onSubmit={event => {
      event.preventDefault();
      if (valid && (!editing || (feedback.trim() && rating && recommendation))) save.mutate(completed && editing);
    }}>
      <fieldset disabled={save.isPending} className="space-y-5 min-w-0">
        {criteria.map(criterion => {
          const custom = criterion.key.startsWith('custom_');
          return <article key={criterion.key} className="rounded-xl border border-surface-700 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-medium">{criterion.label}{!custom && <span className="ml-2 text-xs text-amber-500">Required</span>}</h3>
              {custom && <button type="button" className="btn-ghost text-xs text-red-400" onClick={() => {
                setCriteria(previous => previous.filter(item => item.key !== criterion.key));
                setDirty(true);
              }}>Remove {criterion.label}</button>}
            </div>
            <div className="grid sm:grid-cols-[140px_1fr] gap-4">
              <label className="label">Rating
                <select className="input mt-1" aria-label={`${criterion.label} rating`} required value={criterion.rating ?? ''} onChange={event => update(criterion.key, { rating: event.target.value ? Number(event.target.value) : null })}>
                  <option value="">Select rating</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} / 5</option>)}
                </select>
              </label>
              <label className="label">Supporting feedback (optional)
                <textarea className="input mt-1" aria-label={`${criterion.label} feedback`} maxLength={5000} rows={3} value={criterion.feedback} onChange={event => update(criterion.key, { feedback: event.target.value })} placeholder="Optionally describe what you observed and include an example." />
              </label>
            </div>
          </article>;
        })}
        <div className="flex flex-wrap items-end gap-3">
          <label className="label flex-1 min-w-48">Additional criterion
            <input className="input mt-1" maxLength={100} value={customLabel} placeholder="For example: system design" onChange={event => { setCustomLabel(event.target.value); setCustomError(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCriterion(); } }} />
          </label>
          <button type="button" className="btn-outline" disabled={!customLabel.trim() || criteria.length >= 23} onClick={addCriterion}>Add criterion</button>
        </div>
        {customError && <p role="alert" className="text-sm text-red-400">{customError}</p>}
        {!valid && <p className="text-sm text-surface-400">Select a rating for every criterion before saving or submitting.</p>}
        <button type="button" className="btn-primary" disabled={!valid} onClick={() => save.mutate(false)}>Save feedback criteria</button>
        {!completed && <p className="text-sm text-surface-400">You can save feedback during the interview. Overall rating, recommendation, and final feedback are submitted after it ends.</p>}
        {completed && <section aria-label="Final interview feedback" className="border-t border-surface-800 pt-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3"><div><h3 className="font-semibold">Interview ended</h3><p className="text-sm text-surface-400">Submit your final rating, recommendation and interview feedback.</p></div>
            {!editing && <button type="button" className="btn-primary" onClick={() => { save.reset(); setEditing(true); }}>{interview.finalFeedback || save.isSuccess && notice === 'Feedback saved successfully.' ? 'Edit feedback' : 'Submit feedback'}</button>}
          </div>
        </section>}
      </fieldset>
    </form>
    {save.error && !editing && <p role="alert" className="text-sm text-red-400">{apiError(save.error)}</p>}
    {notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
    {reportDownloadError && <p role="alert" className="text-sm text-amber-500">{reportDownloadError}</p>}
    <InterviewFeedbackReportDownload interviewId={interview.id} completed={completed} submitted={completed && (!!interview.finalFeedback || notice === 'Feedback saved successfully.')} />
    {dirty && !editing && !save.isPending && <p className="text-xs text-surface-400">Unsaved changes</p>}
  </section>
  {completed && editing && createPortal(<div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="final-feedback-title" className="card w-full max-w-4xl max-h-[90dvh] overflow-y-auto space-y-4">
      <div><h2 id="final-feedback-title" className="font-semibold">Interview ended</h2><p className="text-sm text-surface-400">Submit your final rating, recommendation and interview feedback.</p></div>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (valid && feedback.trim() && rating && recommendation) save.mutate(true); }}>
        <fieldset disabled={save.isPending} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="label">Overall rating<select className="input mt-2" required value={rating} onChange={event => { setRating(event.target.value); setDirty(true); }}><option value="">Select rating</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>
            <label className="label">Recommendation<select className="input mt-2" required value={recommendation} onChange={event => { setRecommendation(event.target.value); setDirty(true); }}><option value="">Select recommendation</option>{['Strong Hire', 'Hire', 'Leaning Hire', 'Leaning No Hire', 'No Hire', 'Strong No Hire'].map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          <label className="label block">Final interview feedback<textarea className="input mt-2 w-full" rows={5} maxLength={20000} value={feedback} required onChange={event => { setFeedback(event.target.value); setDirty(true); }} placeholder="Summarize the observed strengths, concerns and supporting evidence." /></label>
          {!valid && <p className="text-sm text-amber-400">Required feedback criteria still need ratings. <button type="button" className="underline" onClick={() => setEditing(false)}>Complete required criteria</button></p>}
          <div className="flex flex-wrap gap-3"><button type="submit" className="btn-primary" disabled={!valid || !feedback.trim() || !rating || !recommendation}>{save.isPending ? 'Submitting…' : 'Submit final feedback'}</button><button type="button" className="btn-outline" onClick={() => setEditing(false)}>Cancel</button></div>
        </fieldset>
      </form>
      {save.error && <p role="alert" className="text-sm text-red-400">{apiError(save.error)}</p>}
      {dirty && !save.isPending && <p className="text-xs text-surface-400">Unsaved changes</p>}
    </section>
  </div>, document.body)}
  </>;
}
