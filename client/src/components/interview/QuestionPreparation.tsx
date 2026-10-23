import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { apiError, getQuestions } from '../../services/api';
import { apiData, workflowKeys } from '../../services/workflows';
import QuestionPicker from '../questions/QuestionPicker';
import type { Question } from '../../types';
import ReactMarkdown from 'react-markdown';
import QuestionSetPicker from './QuestionSetPicker';
import ResumeViewer from './ResumeViewer';
import { ListChecks, Library, FileText, Sparkles } from 'lucide-react';

interface Draft { title: string; statement: string; difficulty: 'easy' | 'medium' | 'hard'; tags: string[]; keyDiscussionPoints?: string[]; expectedSolution?: string }
type AssignedQuestion = Omit<Draft, 'tags'> & { id: number; tags: string | string[] };
interface Interview { id: number; title: string; status: string; candidateName: string; candidateResume?: string | null; candidateResumeUrl?: string | null;
  questions: { questionId: number; question: AssignedQuestion; referenceAnswer?: string | null; sourceSetItemId?: number | null; sourceSetTitle?: string | null }[] }
const blank = (): Draft => ({ title: '', statement: '', difficulty: 'medium', tags: [] });
type PreparationPanel = 'current' | 'sources' | 'resume' | 'generate';
const PANELS = [
  { id: 'current', label: 'Current questions', icon: ListChecks },
  { id: 'sources', label: 'Select questions', icon: Library },
  { id: 'resume', label: 'View resume', icon: FileText },
  { id: 'generate', label: 'Generate from resume', icon: Sparkles },
] as const;

export default function QuestionPreparation({ interviewId, onClose, onViewResume, autoGenerate = false }: {
  interviewId: number; onClose: () => void; onViewResume: () => void; autoGenerate?: boolean;
}) {
  const client = useQueryClient();
  const interview = useQuery({ queryKey: ['interview', interviewId], queryFn: () => apiData<Interview>(`/interviews/${interviewId}`), refetchInterval: 15000 });
  const [draft, setDraft] = useState(blank);
  const [tags, setTags] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<PreparationPanel>(autoGenerate ? 'generate' : 'current');
  const [source, setSource] = useState<'bank' | 'sets'>('bank');
  const [showEditor, setShowEditor] = useState(false);
  const [setsVisited, setSetsVisited] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [panel, source]);
  const [bankSelection, setBankSelection] = useState<number[]>([]);
  const [bankPreview, setBankPreview] = useState<Question | null>(null);
  const editable = ['scheduled', 'in_progress'].includes(interview.data?.status || '');
  const canGenerate = ['scheduled', 'in_progress'].includes(interview.data?.status || '');
  const bank = useQuery({ queryKey: ['question-bank'], queryFn: () => getQuestions(), enabled: panel === 'sources' && source === 'bank' && editable });
  const refreshQuestions = () => Promise.all([
    client.invalidateQueries({ queryKey: ['interview', interviewId] }),
    client.invalidateQueries({ queryKey: workflowKeys.interviews }),
    client.invalidateQueries({ queryKey: ['interviewer-interviews'] }),
  ]);
  const addBank = useMutation({
    mutationFn: async (ids: number[]) => {
      // Keep successful additions out of the selection if a later request fails.
      for (const questionId of ids) {
        await apiData(`/interviews/${interviewId}/questions`, 'post', { questionId });
        setBankSelection((previous) => previous.filter((id) => id !== questionId));
      }
      return ids.length;
    },
    onSuccess: (count) => { setNotice(`Added ${count} question${count === 1 ? '' : 's'} from the question bank.`); setBankPreview(null); },
    onSettled: async () => { await refreshQuestions(); },
  });
  const generate = useMutation({
    mutationFn: async () => (await api.post<{ questions: Draft[]; source?: string }>(`/interviews/${interviewId}/generate-resume-questions`, {}, { timeout: 120000 })).data,
    onSuccess: () => setAdded(new Set()),
  });
  const generateOnce = useRef(false);
  useEffect(() => {
    if (!autoGenerate) generateOnce.current = false;
    if (autoGenerate && canGenerate && !generateOnce.current) { setPanel('generate'); generateOnce.current = true; generate.mutate(); }
  }, [autoGenerate, canGenerate, generate.mutate]);
  const save = useMutation({
    mutationFn: ({ question, id }: { question: Draft; id?: number | null; suggestion?: number }) => apiData(
      `/interviews/${interviewId}/questions${id ? `/${id}` : ''}`, id ? 'put' : 'post', question,
    ),
    onSuccess: async (_result, variables) => {
      if (variables.suggestion !== undefined) setAdded((previous) => new Set(previous).add(variables.suggestion!));
      else { setDraft(blank()); setTags(''); setEditingId(null); setShowEditor(false); }
      setNotice(variables.id ? 'Question updated.' : 'Question added.');
      await refreshQuestions();
    },
  });
  const hasResume = !!(interview.data?.candidateResume || interview.data?.candidateResumeUrl);
  const remove = useMutation({
    mutationFn: (questionId: number) => api.delete(`/interviews/${interviewId}/questions/${questionId}`),
    onSuccess: async (_result, questionId) => {
      if (editingId === questionId) { setEditingId(null); setDraft(blank()); setTags(''); }
      setNotice('Question removed. If it was active, the next assigned question is now shown to the candidate.');
      await refreshQuestions();
    },
  });
  const reorder = useMutation({ mutationFn: (questionIds: number[]) => api.put(`/interviews/${interviewId}/question-order`, { questionIds }), onSuccess: refreshQuestions });
  function moveQuestion(index: number, offset: number) {
    const ids = interview.data!.questions.map(q => q.questionId);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    reorder.mutate(ids);
  }
  function edit(question: Draft | AssignedQuestion, id: number | null) {
    let parsedTags: string[] = [];
    try { parsedTags = Array.isArray(question.tags) ? question.tags : JSON.parse(question.tags); } catch {}
    setDraft({ ...question, tags: parsedTags }); setTags(parsedTags.join(', ')); setEditingId(id); setNotice(''); save.reset();
    setPanel('current');
    setShowEditor(true);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ id: editingId, question: { ...draft, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) } });
  }
  return createPortal(<div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3">
    <section role="dialog" aria-modal="true" aria-label="Prepare interview questions" className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-5xl h-[90dvh] max-h-[94dvh] flex flex-col overflow-hidden">
      <header className="p-4 border-b border-surface-800 flex justify-between items-center gap-3 shrink-0">
        <div><h2 className="font-semibold">Prepare interview questions</h2><p className="text-xs text-surface-400">{interview.data?.candidateName} · {interview.data?.title}</p></div>
        <button className="btn-outline text-xs" onClick={onClose}>Done preparing questions</button>
      </header>
      <nav aria-label="Question preparation sections" className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-b border-surface-800 shrink-0">
        {PANELS.map(({ id, label, icon: Icon }) => <button
          key={id}
          type="button"
          aria-pressed={panel === id}
          onClick={() => setPanel(id)}
          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-xs sm:text-sm font-medium transition-colors ${panel === id ? 'border-primary-500 bg-primary-500/15 text-primary-500' : 'border-surface-700 text-surface-400 hover:bg-surface-800 hover:text-white'}`}
        ><Icon className="w-4 h-4 shrink-0" aria-hidden="true" />{label}{id === 'current' && ` (${interview.data?.questions.length ?? 0})`}</button>)}
      </nav>
      <div ref={content} className="p-4 flex-1 min-h-0 overflow-y-auto space-y-5">
        {interview.isLoading && <p role="status">Loading questions…</p>}
        {interview.error && <p role="alert">{apiError(interview.error)}</p>}
        {interview.data && <>
          {!editable && <p>Question changes are disabled because this interview has ended.</p>}
          {panel === 'sources' && editable && <div className="flex flex-wrap gap-2" aria-label="Question source">
            <button className={source === 'bank' ? 'btn-primary text-xs' : 'btn-outline text-xs'} aria-pressed={source === 'bank'} onClick={() => setSource('bank')}>Question bank</button>
            <button className={source === 'sets' ? 'btn-primary text-xs' : 'btn-outline text-xs'} aria-pressed={source === 'sets'} onClick={() => { setSource('sets'); setSetsVisited(true); }}>Question sets</button>
          </div>}
          {editable && setsVisited && <div hidden={panel !== 'sources' || source !== 'sets'}><QuestionSetPicker interviewId={interviewId} assignedIds={interview.data.questions.flatMap(q => q.sourceSetItemId ? [q.sourceSetItemId] : [])} onAdded={refreshQuestions} /></div>}
          {panel === 'resume' && <section aria-label="Resume preview" className="space-y-3">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Candidate resume</h3>{hasResume && <button className="btn-outline text-xs" onClick={onViewResume}>Open full window</button>}</div>
            <div className="h-[58dvh] min-h-48"><ResumeViewer interview={interview.data} expanded /></div>
          </section>}
          {panel === 'generate' && <section aria-label="Generate resume questions" className="space-y-3">
            <h3 className="font-semibold">Generate questions from resume</h3>
            <p className="text-sm text-surface-400">Review suggestions before adding them. These questions stay private to this interview.</p>
            {!hasResume && <p>No resume is attached to this interview.</p>}
            <button className="btn-primary text-xs" disabled={!canGenerate || !hasResume || generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? 'Generating questions…' : generate.data ? 'Regenerate questions' : 'Generate questions'}</button>
          </section>}
          {panel === 'sources' && editable && source === 'bank' && <section className="space-y-3 border border-surface-700 rounded-lg p-4" aria-label="Question bank">
            <h3 className="font-semibold">DSA & question bank</h3>
            <p className="text-sm text-surface-400">Search existing questions or filter by topic, difficulty and question type. Assigned questions are excluded.</p>
            {bank.isLoading && <p role="status">Loading question bank…</p>}
            {bank.error && <div role="alert">{apiError(bank.error)} <button className="btn-outline text-xs" onClick={() => bank.refetch()}>Retry</button></div>}
            {bank.data && <fieldset disabled={addBank.isPending || save.isPending} className="space-y-3">
              <QuestionPicker questions={bank.data.filter((question) => !interview.data.questions.some((assigned) => assigned.questionId === question.id))}
                selectedIds={bankSelection} onChange={setBankSelection} onPreview={setBankPreview} scrollable={false} />
              {bankPreview && <div className="border border-surface-700 rounded-lg p-3 space-y-2">
                <div className="flex justify-between gap-3"><h4 className="font-medium">{bankPreview.title}</h4><button className="btn-ghost text-xs" onClick={() => setBankPreview(null)}>Close preview</button></div>
                <div className="prose prose-invert text-sm max-w-none"><ReactMarkdown>{bankPreview.statement}</ReactMarkdown></div>
              </div>}
              <button className="btn-primary text-xs" disabled={!bankSelection.length} onClick={() => addBank.mutate(bankSelection)}>{addBank.isPending ? 'Adding questions…' : `Add selected questions (${bankSelection.length})`}</button>
            </fieldset>}
            {addBank.error && <p role="alert" className="text-red-400">{apiError(addBank.error)}</p>}
          </section>}
          {panel === 'generate' && generate.error && <p role="alert" className="text-red-400">{apiError(generate.error)}</p>}
          {panel === 'generate' && generate.isPending && <p role="status">Reading the resume and preparing questions…</p>}
          {panel === 'generate' && generate.data && <section className="space-y-3">
            <h3 className="font-semibold">{generate.data.source === 'ai' ? 'AI-generated questions' : 'Resume-based suggestions'}</h3>
            {generate.data.questions.map((question, index) => <article key={index} className="border border-surface-700 rounded-lg p-3 space-y-2">
              <h4 className="font-medium">{question.title}</h4><p className="text-sm whitespace-pre-wrap">{question.statement}</p>
              {!!question.keyDiscussionPoints?.length && <details><summary className="text-xs cursor-pointer">Interviewer discussion points</summary><ul className="list-disc pl-5 text-sm">{question.keyDiscussionPoints.map((point, i) => <li key={i}>{point}</li>)}</ul></details>}
              {editable && <div className="flex flex-wrap gap-3">
                <button className="btn-outline text-xs" disabled={save.isPending || addBank.isPending || added.has(index)} onClick={() => save.mutate({ question, suggestion: index })}>{added.has(index) ? 'Added' : 'Add to interview'}</button>
                <button className="btn-ghost text-xs" disabled={save.isPending || addBank.isPending} onClick={() => edit(question, null)}>Edit suggestion</button>
              </div>}
            </article>)}
          </section>}
          {panel === 'current' && editable && !showEditor && <button className="btn-outline text-xs" onClick={() => { setDraft(blank()); setTags(''); setEditingId(null); setShowEditor(true); }}>Add question</button>}
          {panel === 'current' && editable && showEditor && <form onSubmit={submit} className="space-y-3 border border-surface-700 rounded-lg p-4">
            <h3 className="font-semibold">{editingId ? 'Update assigned question' : 'Add a question'}</h3>
            <label className="label">Question title<input className="input mt-1" required maxLength={500} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            <label className="label">Question statement<textarea className="input mt-1" rows={5} required maxLength={50000} value={draft.statement} onChange={(e) => setDraft({ ...draft, statement: e.target.value })} /></label>
            <label className="label">Difficulty<select className="input mt-1" value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Draft['difficulty'] })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
            <label className="label">Tags (comma separated)<input className="input mt-1" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
            <label className="label">Interviewer reference answer (optional)<textarea className="input mt-1" rows={3} maxLength={20000} value={draft.expectedSolution || ''} onChange={e => setDraft({ ...draft, expectedSolution: e.target.value })} /></label>
            <div className="flex gap-3"><button className="btn-primary text-xs" disabled={save.isPending || addBank.isPending || !draft.title.trim() || !draft.statement.trim()}>{save.isPending ? 'Saving…' : editingId ? 'Update question' : 'Add question'}</button>
              <button type="button" className="btn-outline text-xs" onClick={() => { setEditingId(null); setDraft(blank()); setTags(''); setShowEditor(false); }}>Cancel editing</button>
            </div>
          </form>}
          {save.error && <p role="alert" className="text-red-400">{apiError(save.error)}</p>}
          {remove.error && <p role="alert" className="text-red-400">{apiError(remove.error)}</p>}
          {reorder.error && <p role="alert" className="text-red-400">{apiError(reorder.error)}</p>}
          {notice && <p role="status">{notice}</p>}
          {panel === 'current' && !showEditor && <section className="space-y-3" aria-label="Current interview questions"><h3 className="font-semibold">Assigned questions ({interview.data.questions.length})</h3>
            {!interview.data.questions.length && <p>No questions assigned yet.</p>}
            {interview.data.questions.map(({ question, referenceAnswer, sourceSetTitle }, index) => <article key={question.id} className="border border-surface-700 rounded-lg p-3 space-y-2">
              <h4 className="font-medium">{question.title}</h4>
              <details><summary className="text-sm cursor-pointer text-surface-400">View question</summary><p className="text-sm whitespace-pre-wrap mt-2">{question.statement}</p></details>
              {sourceSetTitle && <p className="text-xs text-surface-400">From set: {sourceSetTitle}</p>}
              {referenceAnswer && <details><summary className="text-sm cursor-pointer">Interviewer reference answer</summary><p className="whitespace-pre-wrap text-sm">{referenceAnswer}</p></details>}
              {editable && <div className="flex flex-wrap gap-3">
                <button className="btn-outline text-xs" disabled={save.isPending || remove.isPending} onClick={() => edit({ ...question, expectedSolution: referenceAnswer || '' }, question.id)}>Edit question</button>
                <button className="btn-outline text-xs" disabled={index === 0 || reorder.isPending} onClick={() => moveQuestion(index, -1)}>Move up</button>
                <button className="btn-outline text-xs" disabled={index === interview.data!.questions.length - 1 || reorder.isPending} onClick={() => moveQuestion(index, 1)}>Move down</button>
                <button className="btn-outline text-xs text-red-400" disabled={save.isPending || remove.isPending} onClick={() => remove.mutate(question.id)}>Remove question</button>
              </div>}
            </article>)}
          </section>}
        </>}
      </div>
    </section>
  </div>, document.body);
}

