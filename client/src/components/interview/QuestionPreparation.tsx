import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiError, getQuestions } from '../../services/api';
import { apiData, workflowKeys } from '../../services/workflows';
import QuestionPicker from '../questions/QuestionPicker';
import QuestionSetPicker from './QuestionSetPicker';
import type { Question } from '../../types';
import ReactMarkdown from 'react-markdown';
import ResumeQuestions from './ResumeQuestions';

interface LinedUpQuestion {
  questionId: number;
  orderIndex: number;
  status: string;
  notes?: string;
  sourceSetItemId?: number | null;
  sourceSetTitle?: string | null;
  question: { title: string; statement: string; difficulty: string; questionType: string };
}

function wasAsked(link: LinedUpQuestion) {
  try {
    const notes = JSON.parse(link.notes || '{}');
    return link.status === 'asked' || !!notes.questionAskedAt || !!notes.conversation?.turns?.length;
  } catch { return link.status === 'asked'; }
}

export default function QuestionPreparation({ interviewId, onClose }: { interviewId: number; onClose: () => void }) {
  const client = useQueryClient();
  const interview = useQuery({ queryKey: ['interview', interviewId], queryFn: () => apiData<{ status: string; title: string; candidateName: string; candidateResume?: string | null; candidateResumeUrl?: string | null; questions: LinedUpQuestion[] }>(`/interviews/${interviewId}`) });
  const [source, setSource] = useState<'bank' | 'sets' | 'resume' | 'lineup'>('bank');
  const [resumeVisited, setResumeVisited] = useState(false);
  const [setsVisited, setSetsVisited] = useState(false);
  const [selection, setSelection] = useState<number[]>([]);
  const [preview, setPreview] = useState<Question | null>(null);
  const [notice, setNotice] = useState('');
  const editable = ['scheduled', 'in_progress'].includes(interview.data?.status ?? '');
  const bank = useQuery({ queryKey: ['question-bank'], queryFn: () => getQuestions(), enabled: source === 'bank' && editable });
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ['interview', interviewId] }), client.invalidateQueries({ queryKey: workflowKeys.interviews }), client.invalidateQueries({ queryKey: ['interviewer-interviews'] })]);
  const add = useMutation({ mutationFn: async (ids: number[]) => {
    for (const questionId of ids) {
      await apiData(`/interviews/${interviewId}/questions`, 'post', { questionId });
      setSelection(old => old.filter(id => id !== questionId));
    }
    return ids.length;
  }, onSuccess: count => { setNotice(`Added ${count} questions from the question bank.`); setPreview(null); }, onSettled: refresh });
  return createPortal(<div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3">
    <section role="dialog" aria-modal="true" aria-label="Prepare interview questions" className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-5xl h-[90dvh] flex flex-col overflow-hidden">
      <header className="p-4 border-b border-surface-800 flex justify-between gap-3"><div><h2 className="font-semibold">Select questions</h2><p className="text-xs text-surface-400">{interview.data?.candidateName} · {interview.data?.title}</p></div><button className="btn-outline text-xs" onClick={onClose}>Done preparing questions</button></header>
      <div className="p-4 overflow-y-auto flex-1 space-y-4">
        {interview.isLoading && <p role="status">Loading interview…</p>}
        {interview.error && <p role="alert">{apiError(interview.error)}</p>}
        {interview.data && !editable && <p>Question changes are disabled because this interview has ended.</p>}
        {editable && <>
          <nav aria-label="Question source" className="flex flex-wrap gap-2"><button className="btn-outline" aria-pressed={source === 'bank'} onClick={() => setSource('bank')}>Question bank</button><button className="btn-outline" aria-pressed={source === 'sets'} onClick={() => { setSource('sets'); setSetsVisited(true); }}>Question sets</button><button className="btn-outline" aria-pressed={source === 'resume'} onClick={() => { setSource('resume'); setResumeVisited(true); }}>Generate from resume</button><button className="btn-outline" aria-pressed={source === 'lineup'} onClick={() => setSource('lineup')}>Interview lineup ({interview.data?.questions.length ?? 0})</button></nav>
          {source === 'lineup' && <section aria-label="Interview lineup" className="space-y-3">
            <p className="text-sm text-surface-400">All questions assigned to this interview, in interview order.</p>
            {!interview.data?.questions.length && <p>No questions have been added to this interview yet.</p>}
            <ol className="space-y-3">
              {[...(interview.data?.questions ?? [])].sort((a, b) => a.orderIndex - b.orderIndex).map((link, index) => <li key={link.questionId} className="border border-surface-700 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold">{index + 1}. {link.question.title}</h3>
                {wasAsked(link) && <span className="badge text-emerald-400">Asked</span>}
                <p className="text-xs text-surface-400">{link.question.difficulty} · {link.question.questionType} · {link.status.replace(/_/g, ' ')}{link.sourceSetTitle ? ` · ${link.sourceSetTitle}` : ''}</p>
                <details><summary className="cursor-pointer text-sm">View question</summary><div className="mt-2"><ReactMarkdown>{link.question.statement}</ReactMarkdown></div></details>
              </li>)}
            </ol>
          </section>}
          {resumeVisited && <div hidden={source !== 'resume'}><ResumeQuestions interviewId={interviewId} resume={interview.data?.candidateResume} hasPdf={!!interview.data?.candidateResumeUrl} onAdded={refresh} /></div>}
          {setsVisited && <div hidden={source !== 'sets'}><QuestionSetPicker interviewId={interviewId} assignedIds={interview.data?.questions.flatMap(q => q.sourceSetItemId ? [q.sourceSetItemId] : []) ?? []} onAdded={refresh} /></div>}
          {source === 'bank' && <section aria-label="Question bank" className="space-y-3">
            <p className="text-sm text-surface-400">Select available questions from the bank. Questions already assigned to this interview are excluded.</p>
            {bank.isLoading && <p role="status">Loading question bank…</p>}
            {bank.error && <p role="alert">{apiError(bank.error)} <button onClick={() => bank.refetch()}>Retry</button></p>}
            {bank.data && <fieldset disabled={add.isPending} className="space-y-3">
              <QuestionPicker questions={bank.data.filter(q => !interview.data?.questions.some(link => link.questionId === q.id))} selectedIds={selection} onChange={setSelection} onPreview={setPreview} scrollable={false} />
              {preview && <div className="border border-surface-700 rounded p-3"><h3>{preview.title}</h3><ReactMarkdown>{preview.statement}</ReactMarkdown><button onClick={() => setPreview(null)}>Close preview</button></div>}
              <button className="btn-primary" disabled={!selection.length} onClick={() => add.mutate(selection)}>{add.isPending ? 'Adding…' : `Add selected questions (${selection.length})`}</button>
            </fieldset>}
            {add.error && <p role="alert">{apiError(add.error)}</p>}
          </section>}
          {notice && <p role="status">{notice}</p>}
        </>}
      </div>
    </section>
  </div>, document.body);
}
