import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiData, type InterviewPlan } from '../../services/workflows';
import { apiError } from '../../services/api';
import QuestionSetPicker from './QuestionSetPicker';

type Assigned = { questionId: number; sourceSetItemId?: number | null; question: { title: string; statement: string } };
export default function CurrentQuestionSources({ interviewId, questions, plan, disabled }: { interviewId: number; questions: Assigned[]; plan: InterviewPlan | null; disabled: boolean }) {
  const [source, setSource] = useState<'manual' | 'set' | 'plan' | null>(null);
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [starterCode, setStarterCode] = useState('');
  const [coding, setCoding] = useState(false);
  const [planIndex, setPlanIndex] = useState('');
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const planned = plan?.sections.flatMap(section => section.questions.map(prompt => ({ title: `${section.skill} discussion`.slice(0, 500), statement: prompt }))) ?? [];
  const refresh = () => client.invalidateQueries({ queryKey: ['interview', interviewId] });
  const add = useMutation({
    mutationFn: async (input: { title: string; statement: string; starterCode?: string }) => {
      const existing = source === 'plan' ? questions.find(q => q.question.statement === input.statement && q.question.title === input.title) : undefined;
      const id = existing?.questionId ?? (await apiData<{ question: { questionId: number } }>(`/interviews/${interviewId}/questions`, 'post', { ...input, difficulty: 'medium', tags: [] })).question.questionId;
      // Activate the persisted assignment, never the plan's synthetic IDs.
      await apiData(`/interviews/${interviewId}/current-question`, 'put', { questionId: id });
    },
    onSuccess: () => { setTitle(''); setStatement(''); setStarterCode(''); setNotice('Question selected and shared with the candidate.'); setSource(null); },
    onSettled: refresh,
  });
  const busy = disabled || add.isPending;
  return <section aria-label="Choose current question source" className="space-y-3">
    <div className="flex flex-wrap gap-2">{([
      ['manual', 'Add question manually'], ['set', 'Take from question set'], ['plan', 'Take from interview plan'],
    ] as const).map(([id, label]) => <button type="button" key={id} className="btn-outline text-xs" disabled={busy} aria-pressed={source === id} onClick={() => { setSource(source === id ? null : id); setNotice(''); add.reset(); }}>{label}</button>)}</div>
    {source === 'manual' && <form className="space-y-3" onSubmit={event => { event.preventDefault(); add.mutate({ title: title.trim(), statement: statement.trim(), ...(coding ? { starterCode } : {}) }); }}>
      <fieldset disabled={busy} className="space-y-3">
        <label className="label">Question title<input className="input mt-1" required maxLength={500} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="label">Question prompt<textarea className="input mt-1" required maxLength={50000} rows={4} value={statement} onChange={e => setStatement(e.target.value)} /></label>
        <label className="label">Question type<select className="input mt-1" value={coding ? 'coding' : 'written'} onChange={e => setCoding(e.target.value === 'coding')}><option value="written">Discussion / written</option><option value="coding">Coding (Python)</option></select></label>
        {coding && <label className="label">Python starter code<textarea className="input mt-1" required rows={4} value={starterCode} onChange={e => setStarterCode(e.target.value)} /></label>}
        <button className="btn-primary text-xs" disabled={!title.trim() || !statement.trim() || (coding && !starterCode.trim())}>Add and ask this question</button>
      </fieldset>
    </form>}
    {source === 'set' && !disabled && <><QuestionSetPicker interviewId={interviewId} assignedIds={questions.flatMap(q => q.sourceSetItemId ? [q.sourceSetItemId] : [])} onAdded={async () => { await refresh(); setNotice('Questions added. Choose which one to ask from Current question above.'); }} /><p className="text-xs text-surface-400">Add questions from a set, then select one in Current question above.</p></>}
    {source === 'plan' && <div className="space-y-3">
      {!planned.length ? <p className="text-sm text-surface-400">No saved interview plan questions are available. Prepare and save a plan first.</p> : <>
        <label className="label">Interview plan question<select className="input mt-1" value={planIndex} disabled={busy} onChange={e => setPlanIndex(e.target.value)}><option value="">Select a planned question</option>{planned.map((q, index) => <option key={index} value={index}>{q.title}: {q.statement}</option>)}</select></label>
        {planIndex !== '' && planned[Number(planIndex)] && <p className="text-sm whitespace-pre-wrap">{planned[Number(planIndex)].statement}</p>}
        <button type="button" className="btn-primary text-xs" disabled={busy || planIndex === '' || !planned[Number(planIndex)]} onClick={() => add.mutate(planned[Number(planIndex)])}>Ask this planned question</button>
        <p className="text-xs text-surface-400">Planned prompts are added as discussion questions, ready for transcripts and follow-ups.</p>
      </>}
    </div>}
    {add.error && <p role="alert" className="text-red-400 text-sm">{apiError(add.error)}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>;
}
