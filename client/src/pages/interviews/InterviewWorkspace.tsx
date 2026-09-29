import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { Spinner } from '../../components/ui';
import { useTheme } from '../../context/ThemeContext';
import { apiError } from '../../services/api';
import type { Observation } from '../../services/ai';
import {
  addInterviewQuestion, getInterview, observeInterviewAnswer, runInterviewCode, saveInterviewQuestion, updateInterview,
} from '../../services/interviews';
import type { Interview, InterviewQuestion, Recommendation, SkillRating } from '../../services/interviews';
import { STATUS_BADGE, RECOMMENDATION } from './InterviewList';
import {
  Play, Sparkles, Plus, MessageSquareText, Code2, Terminal, NotebookPen, ClipboardCheck, CheckCircle, Circle,
  Quote, ThumbsUp, AlertTriangle, Minus, Star, PlayCircle, Save,
} from 'lucide-react';

const LANGUAGES = [
  { id: 71, name: 'Python', monaco: 'python' },
  { id: 63, name: 'JavaScript', monaco: 'javascript' },
  { id: 62, name: 'Java', monaco: 'java' },
  { id: 54, name: 'C++', monaco: 'cpp' },
];

const SENTIMENT = {
  positive: { icon: ThumbsUp, className: 'text-emerald-600 bg-emerald-500/10', label: 'Strength' },
  neutral: { icon: Minus, className: 'text-surface-400 bg-surface-800', label: 'Note' },
  concern: { icon: AlertTriangle, className: 'text-amber-600 bg-amber-500/10', label: 'Concern' },
} as const;

const EVIDENCE_LABEL = { answer: 'Answer', code: 'Code', execution: 'Execution', notes: 'Notes' } as const;

export default function InterviewWorkspace() {
  const { id } = useParams();
  const interviewId = Number(id);
  const qc = useQueryClient();
  const { data: interview, isLoading, error } = useQuery({ queryKey: ['interview', interviewId], queryFn: () => getInterview(interviewId) });
  const [tab, setTab] = useState<'conduct' | 'evaluate'>('conduct');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const setCached = (updater: (i: Interview) => Interview) =>
    qc.setQueryData<Interview>(['interview', interviewId], (old) => (old ? updater(old) : old));

  const status = useMutation({
    mutationFn: (s: Interview['status']) => updateInterview(interviewId, { status: s }),
    onSuccess: (iv) => { setCached(() => iv); qc.invalidateQueries({ queryKey: ['interviews'] }); },
  });

  useEffect(() => {
    if (interview?.questions?.length && selectedId === null) setSelectedId(interview.questions[0].id);
  }, [interview, selectedId]);

  if (isLoading) return <AdminLayout title="Interview"><Spinner label="Loading interview..." /></AdminLayout>;
  if (error || !interview) return <AdminLayout title="Interview"><p className="text-sm text-red-600">{apiError(error, 'Interview not found')}</p></AdminLayout>;

  const questions = interview.questions ?? [];
  const selected = questions.find((q) => q.id === selectedId) ?? null;
  const badge = STATUS_BADGE[interview.status];

  return (
    <AdminLayout
      title={interview.candidateName}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className={`badge ring-1 ${badge.className}`}>{badge.label}</span>
          {interview.role && <span>{interview.role}</span>}
          <span>· {interview.durationMinutes} min</span>
          <span>· {interview.skills.join(', ')}</span>
        </span>
      }
      maxWidth="max-w-7xl"
      actions={
        <>
          {interview.status === 'planned' && (
            <button onClick={() => status.mutate('in_progress')} disabled={status.isPending} className="btn-primary text-sm"><PlayCircle className="w-4 h-4" /> Start interview</button>
          )}
          {interview.status === 'in_progress' && (
            <button onClick={() => setTab('evaluate')} className="btn-primary text-sm"><ClipboardCheck className="w-4 h-4" /> Finish &amp; evaluate</button>
          )}
        </>
      }
    >
      <div className="flex gap-1 mb-6 border-b border-surface-800">
        {([['conduct', 'Conduct', MessageSquareText], ['evaluate', 'Evaluate', ClipboardCheck]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-surface-500 hover:text-surface-300'}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>

      {tab === 'conduct' ? (
        <div className="grid lg:grid-cols-[18rem_1fr] gap-6 items-start">
          <PlanSidebar interview={interview} selectedId={selectedId} onSelect={setSelectedId} onAdded={(q) => { setCached((i) => ({ ...i, questions: [...(i.questions ?? []), q] })); setSelectedId(q.id); }} />
          {selected ? (
            <QuestionPanel
              key={selected.id}
              q={selected}
              skills={interview.skills}
              onSaved={(q) => setCached((i) => ({ ...i, questions: (i.questions ?? []).map((x) => (x.id === q.id ? q : x)) }))}
            />
          ) : (
            <div className="card text-center py-16 text-sm text-surface-500">Add a question to begin.</div>
          )}
        </div>
      ) : (
        <EvaluationPanel interview={interview} onSaved={(iv) => { setCached(() => iv); qc.invalidateQueries({ queryKey: ['interviews'] }); }} />
      )}
    </AdminLayout>
  );
}

function answeredState(q: InterviewQuestion) {
  return !!(q.answer.trim() || q.code.trim() || q.notes.trim());
}

function PlanSidebar({ interview, selectedId, onSelect, onAdded }: {
  interview: Interview; selectedId: number | null; onSelect: (id: number) => void; onAdded: (q: InterviewQuestion) => void;
}) {
  const [draft, setDraft] = useState('');
  const questions = interview.questions ?? [];
  const sections = useMemo(() => {
    const planned = interview.plan.map((s) => s.topic);
    const extra = Array.from(new Set(questions.map((q) => q.section).filter((s) => !planned.includes(s))));
    return [...planned, ...extra];
  }, [interview.plan, questions]);
  const add = useMutation({
    mutationFn: () => addInterviewQuestion(interview.id, { prompt: draft.trim(), section: 'Additional' }),
    onSuccess: (q) => { onAdded(q); setDraft(''); },
  });

  return (
    <aside className="card p-0 overflow-hidden lg:sticky lg:top-4">
      <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Plan</h2>
        <span className="text-xs text-surface-500 tabular-nums">{questions.filter(answeredState).length}/{questions.length} covered</span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {sections.map((topic) => {
          const planned = interview.plan.find((s) => s.topic === topic);
          const qs = questions.filter((q) => q.section === topic);
          return (
            <div key={topic} className="px-2 py-2 border-b border-surface-800 last:border-b-0">
              <p className="px-2 py-1 text-[11px] font-semibold text-surface-500 uppercase tracking-wider flex justify-between">
                <span>{topic}</span>{planned && <span className="tabular-nums normal-case">{planned.minutes} min</span>}
              </p>
              {qs.map((q) => (
                <button key={q.id} onClick={() => onSelect(q.id)} className={`w-full flex items-start gap-2 px-2 py-2 rounded-lg text-left text-sm ${q.id === selectedId ? 'bg-primary-500/10 text-primary-700' : 'text-surface-300 hover:bg-surface-800/60'}`}>
                  {answeredState(q) ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-surface-600 shrink-0 mt-0.5" />}
                  <span className="line-clamp-2">{q.prompt}</span>
                </button>
              ))}
              {!qs.length && <p className="px-2 py-1 text-xs text-surface-500">No questions</p>}
            </div>
          );
        })}
      </div>
      <form className="p-3 border-t border-surface-800 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add.mutate(); }}>
        <input className="input text-sm py-1.5" placeholder="Add a question…" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} />
        <button type="submit" disabled={!draft.trim() || add.isPending} className="btn-outline p-2" aria-label="Add question"><Plus className="w-4 h-4" /></button>
      </form>
    </aside>
  );
}

// Answer, code, notes autosave shortly after typing stops
function QuestionPanel({ q, skills, onSaved }: { q: InterviewQuestion; skills: string[]; onSaved: (q: InterviewQuestion) => void }) {
  const { theme } = useTheme();
  const [fields, setFields] = useState({ prompt: q.prompt, answer: q.answer, code: q.code, notes: q.notes, languageId: q.languageId });
  const [stdin, setStdin] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const firstRender = useRef(true);
  const lang = LANGUAGES.find((l) => l.id === fields.languageId) ?? LANGUAGES[0];

  // Mark unsaved in the same update as the edit (not in an effect), so typing costs one render per keystroke
  function edit(patch: Partial<typeof fields>) {
    setFields((f) => {
      const next = { ...f, ...patch };
      return (Object.keys(patch) as (keyof typeof fields)[]).every((k) => f[k] === next[k]) ? f : next;
    });
    setSaveState('dirty');
  }

  // Autosave shortly after typing stops; the effect only schedules work
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        onSaved(await saveInterviewQuestion(q.id, fields));
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useMutation({
    mutationFn: () => runInterviewCode(q.id, { code: fields.code, languageId: fields.languageId, stdin }),
    onSuccess: (r) => onSaved({ ...q, ...fields, executionResult: r }),
  });
  const observe = useMutation({
    mutationFn: async () => {
      // Make sure the latest edits are saved before the AI reads them
      onSaved(await saveInterviewQuestion(q.id, fields));
      return observeInterviewAnswer(q.id);
    },
    onSuccess: (obs) => onSaved({ ...q, ...fields, aiObservations: obs }),
  });

  const result = run.data ?? q.executionResult;
  const ok = result && /accepted/i.test(result.status) && !result.stderr.trim();

  return (
    <div className="space-y-5 min-w-0">
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider">{q.section || 'Question'}</span>
          <span className={`text-xs ${saveState === 'error' ? 'text-red-600' : 'text-surface-500'}`}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved' : saveState === 'error' ? 'Save failed — keep typing to retry' : 'Saved'}
          </span>
        </div>
        <textarea className="w-full bg-transparent text-lg font-semibold text-white resize-none outline-none" rows={2} value={fields.prompt} onChange={(e) => edit({ prompt: e.target.value })} aria-label="Question" />
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <div className="card space-y-2">
          <label className="text-sm font-semibold text-white flex items-center gap-2" htmlFor={`ans-${q.id}`}><MessageSquareText className="w-4 h-4 text-primary-600" /> Candidate answer</label>
          <textarea id={`ans-${q.id}`} className="input min-h-[180px] text-sm" placeholder="Capture the candidate's explanation as they speak" value={fields.answer} onChange={(e) => edit({ answer: e.target.value })} />
        </div>
        <div className="card space-y-2">
          <label className="text-sm font-semibold text-white flex items-center gap-2" htmlFor={`notes-${q.id}`}><NotebookPen className="w-4 h-4 text-primary-600" /> Interviewer notes <span className="text-xs text-surface-500 font-normal">(private)</span></label>
          <textarea id={`notes-${q.id}`} className="input min-h-[180px] text-sm" placeholder="Hints given, follow-ups, your impressions" value={fields.notes} onChange={(e) => edit({ notes: e.target.value })} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-800">
          <span className="text-sm font-semibold text-white flex items-center gap-2"><Code2 className="w-4 h-4 text-primary-600" /> Candidate code</span>
          <div className="flex items-center gap-2">
            <select className="input py-1 text-sm w-auto" value={fields.languageId} onChange={(e) => edit({ languageId: Number(e.target.value) })} aria-label="Language">
              {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={() => run.mutate()} disabled={!fields.code.trim() || run.isPending} className="btn-primary text-sm py-1.5"><Play className="w-4 h-4" /> {run.isPending ? 'Running…' : 'Run'}</button>
          </div>
        </div>
        <div className="h-72">
          <Editor
            height="100%"
            language={lang.monaco}
            value={fields.code}
            onChange={(v) => { if ((v ?? '') !== fields.code) edit({ code: v ?? '' }); }}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, wordWrap: 'on' }}
          />
        </div>
        <div className="grid md:grid-cols-2 border-t border-surface-800">
          <div className="p-3 md:border-r border-surface-800">
            <label className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider" htmlFor={`stdin-${q.id}`}>Input (stdin)</label>
            <textarea id={`stdin-${q.id}`} className="input font-mono text-xs min-h-[80px] mt-1" value={stdin} onChange={(e) => setStdin(e.target.value)} />
          </div>
          <div className="p-3">
            <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> Execution result</p>
            {run.isError ? (
              <p className="text-sm text-red-600 mt-2">{apiError(run.error, 'Run failed')}</p>
            ) : result ? (
              <div className="mt-1 space-y-1.5">
                <p className={`text-sm font-semibold ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {result.status}{result.timeSeconds !== null && <span className="text-surface-500 font-normal"> · {result.timeSeconds}s</span>}
                </p>
                {result.stdout && <pre className="font-mono text-xs text-surface-100 bg-surface-950 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap [font-variant-ligatures:none]">{result.stdout}</pre>}
                {result.stderr && <pre className="font-mono text-xs text-red-700 bg-red-500/5 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap [font-variant-ligatures:none]">{result.stderr}</pre>}
              </div>
            ) : (
              <p className="text-sm text-surface-500 mt-2">Run the code to see output.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary-600" /> AI observations</h3>
          <button onClick={() => observe.mutate()} disabled={observe.isPending} className="btn-outline text-sm">
            <Sparkles className="w-4 h-4" /> {observe.isPending ? 'Analysing…' : q.aiObservations.length ? 'Refresh observations' : 'Generate observations'}
          </button>
        </div>
        {observe.isError && <p className="text-sm text-red-600 mb-2">{apiError(observe.error, 'Could not analyse')}</p>}
        {q.aiObservations.length ? (
          <ObservationList observations={q.aiObservations} />
        ) : (
          <p className="text-sm text-surface-500">Capture an answer, code or notes, then generate. Every observation cites the evidence it's based on.</p>
        )}
        <p className="text-[11px] text-surface-500 mt-3">AI observations support your judgement; they are not a verdict. Skills in scope: {skills.join(', ')}.</p>
      </div>
    </div>
  );
}

function ObservationList({ observations }: { observations: Observation[] }) {
  return (
    <ul className="space-y-3">
      {observations.map((o, i) => {
        const s = SENTIMENT[o.sentiment];
        const Icon = s.icon;
        return (
          <li key={i} className="rounded-lg border border-surface-800 p-3">
            <div className="flex items-start gap-3">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.className}`} title={s.label}><Icon className="w-4 h-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-surface-100"><span className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700 mr-2">{o.skill}</span>{o.observation}</p>
                <ul className="mt-2 space-y-1.5">
                  {o.evidence.map((e, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs">
                      <Quote className="w-3.5 h-3.5 text-surface-500 shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="font-semibold text-surface-400">{EVIDENCE_LABEL[e.source]}{e.detail ? ` · ${e.detail}` : ''}: </span>
                        <code className="text-surface-200 bg-surface-950 rounded px-1 py-0.5 break-words [font-variant-ligatures:none]">{e.quote}</code>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const DEFAULT_EXTRA_SKILLS = ['Problem Solving', 'Communication'];

function EvaluationPanel({ interview, onSaved }: { interview: Interview; onSaved: (i: Interview) => void }) {
  const skillNames = useMemo(() => {
    const names = [...interview.skills];
    for (const s of DEFAULT_EXTRA_SKILLS) if (!names.some((n) => n.toLowerCase() === s.toLowerCase())) names.push(s);
    return names;
  }, [interview.skills]);
  const [ratings, setRatings] = useState<SkillRating[]>(() =>
    skillNames.map((skill) => interview.skillRatings.find((r) => r.skill === skill) ?? { skill, rating: 0, comment: '' })
  );
  const [recommendation, setRecommendation] = useState<Recommendation>(interview.recommendation);
  const [summary, setSummary] = useState(interview.summary);
  const allObservations = (interview.questions ?? []).flatMap((q) => q.aiObservations.map((o) => ({ ...o, question: q.prompt })));

  const save = useMutation({
    mutationFn: (complete: boolean) => updateInterview(interview.id, { skillRatings: ratings, recommendation, summary, ...(complete ? { status: 'completed' as const } : {}) }),
    onSuccess: onSaved,
  });

  const rated = ratings.filter((r) => r.rating > 0);
  const avg = rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : null;

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 space-y-4">
        {ratings.map((r, i) => {
          const related = allObservations.filter((o) => o.skill.toLowerCase() === r.skill.toLowerCase());
          return (
            <div key={r.skill} className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-white">{r.skill}</h3>
                <div className="flex items-center gap-1" role="radiogroup" aria-label={`Rating for ${r.skill}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={r.rating === n} aria-label={`${n} of 5`} onClick={() => setRatings((rs) => rs.map((x, j) => (j === i ? { ...x, rating: x.rating === n ? 0 : n } : x)))}>
                      <Star className={`w-6 h-6 ${n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-surface-600'}`} />
                    </button>
                  ))}
                  <span className="text-xs text-surface-500 w-24 text-right">{r.rating ? ['', 'Poor', 'Weak', 'Adequate', 'Strong', 'Exceptional'][r.rating] : 'Not rated'}</span>
                </div>
              </div>
              <textarea className="input text-sm min-h-[60px]" placeholder={`Evidence for your ${r.skill} rating`} value={r.comment} onChange={(e) => setRatings((rs) => rs.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))} maxLength={2000} />
              {related.length > 0 && (
                <details className="rounded-lg bg-surface-950 border border-surface-800">
                  <summary className="px-3 py-2 text-xs font-medium text-surface-400 cursor-pointer flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary-600" /> {related.length} AI observation{related.length === 1 ? '' : 's'} for {r.skill}</summary>
                  <div className="p-3 pt-0"><ObservationList observations={related} /></div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <div className="card space-y-4 lg:sticky lg:top-4">
        <h3 className="font-semibold text-white">Overall</h3>
        <p className="text-sm text-surface-400">Average rating <span className="text-white font-semibold tabular-nums">{avg !== null ? avg.toFixed(1) : '—'}</span> across {rated.length} of {ratings.length} skills</p>
        <div>
          <span className="label">Recommendation</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(RECOMMENDATION) as Exclude<Recommendation, ''>[]).map((k) => (
              <button key={k} type="button" onClick={() => setRecommendation(recommendation === k ? '' : k)} className={`px-3 py-2 rounded-lg border text-sm font-medium ${recommendation === k ? `ring-1 ${RECOMMENDATION[k].className} border-transparent` : 'border-surface-700 text-surface-400 hover:border-surface-500'}`}>
                {RECOMMENDATION[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="iv-summary">Summary</label>
          <textarea id="iv-summary" className="input min-h-[120px] text-sm" placeholder="Key strengths, concerns and the reason for your recommendation" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={8000} />
        </div>
        {save.isError && <p className="text-sm text-red-600">{apiError(save.error, 'Could not save')}</p>}
        {save.isSuccess && <p className="text-sm text-emerald-700">Saved.</p>}
        <div className="flex flex-col gap-2">
          <button onClick={() => save.mutate(true)} disabled={save.isPending || !recommendation} className="btn-primary" title={!recommendation ? 'Choose a recommendation' : ''}>
            <CheckCircle className="w-4 h-4" /> {interview.status === 'completed' ? 'Update evaluation' : 'Complete interview'}
          </button>
          <button onClick={() => save.mutate(false)} disabled={save.isPending} className="btn-ghost text-sm"><Save className="w-4 h-4" /> Save draft</button>
        </div>
      </div>
    </div>
  );
}
