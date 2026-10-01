import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { Spinner } from '../../components/ui';
import { useTheme } from '../../context/ThemeContext';
import { apiError } from '../../services/api';
import {
  addInterviewQuestion, getInterview, observeInterviewAnswer, runInterviewCode, saveInterviewQuestion, updateInterview,
} from '../../services/interviews';
import { STATUS_BADGE, RECOMMENDATION } from './InterviewList';
import {
  Play, Sparkles, Plus, MessageSquareText, Code2, Terminal, NotebookPen, ClipboardCheck, CheckCircle, Circle,
  Quote, ThumbsUp, AlertTriangle, Minus, Star, PlayCircle, Save,
} from 'lucide-react';
import styles from './InterviewWorkspace.module.css';
import { DEFAULT_EXTRA_SKILLS, EVIDENCE_LABELS, INTERVIEW_LANGUAGES, SENTIMENT_LABELS, INTERVIEW_WORKSPACE_MESSAGES as MSG } from '../../constants';
import type { Observation, Recommendation, SkillRating, Interview, InterviewQuestion } from '../../types';

const SENTIMENT = {
  positive: { icon: ThumbsUp, className: styles.strengthClassName, label: SENTIMENT_LABELS.positive },
  neutral: { icon: Minus, className: styles.noteClassName, label: SENTIMENT_LABELS.neutral },
  concern: { icon: AlertTriangle, className: styles.concernClassName, label: SENTIMENT_LABELS.concern },
} as const;

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
  if (error || !interview) return <AdminLayout title="Interview"><p className={styles.pText}>{apiError(error, 'Interview not found')}</p></AdminLayout>;

  const questions = interview.questions ?? [];
  const selected = questions.find((q) => q.id === selectedId) ?? null;
  const badge = STATUS_BADGE[interview.status];

  return (
    <AdminLayout
      title={interview.candidateName}
      subtitle={
        <span className={styles.label}>
          <span className={`${styles.label2} ${badge.className}`}>{badge.label}</span>
          {interview.role && <span>{interview.role}</span>}
          <span>· {interview.durationMinutes} min</span>
          <span>· {interview.skills.join(', ')}</span>
        </span>
      }
      maxWidth={styles.candidateNameMaxWidth}
      actions={
        <>
          {interview.status === 'planned' && (
            <button onClick={() => status.mutate('in_progress')} disabled={status.isPending} className={styles.startInterviewButton}><PlayCircle className={styles.playCircleIcon} /> Start interview</button>
          )}
          {interview.status === 'in_progress' && (
            <button onClick={() => setTab('evaluate')} className={styles.startInterviewButton}><ClipboardCheck className={styles.playCircleIcon} /> Finish &amp; evaluate</button>
          )}
        </>
      }
    >
      <div className={styles.box}>
        {([['conduct', 'Conduct', MessageSquareText], ['evaluate', 'Evaluate', ClipboardCheck]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`${styles.lButton} ${tab === k ? styles.lButtonSelected : styles.lButtonDefault}`}>
            <Icon className={styles.playCircleIcon} /> {l}
          </button>
        ))}
      </div>

      {tab === 'conduct' ? (
        <div className={styles.box2}>
          <PlanSidebar interview={interview} selectedId={selectedId} onSelect={setSelectedId} onAdded={(q) => { setCached((i) => ({ ...i, questions: [...(i.questions ?? []), q] })); setSelectedId(q.id); }} />
          {selected ? (
            <QuestionPanel
              key={selected.id}
              q={selected}
              skills={interview.skills}
              onSaved={(q) => setCached((i) => ({ ...i, questions: (i.questions ?? []).map((x) => (x.id === q.id ? q : x)) }))}
            />
          ) : (
            <div className={styles.addAQuestionBox}>{MSG.addQuestionBegin}</div>
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
    <aside className={styles.addQuestionAside}>
      <div className={styles.planBox}>
        <h2 className={styles.planTitle}>Plan</h2>
        <span className={styles.lengthLabel}>{questions.filter(answeredState).length}/{questions.length} covered</span>
      </div>
      <div className={styles.box3}>
        {sections.map((topic) => {
          const planned = interview.plan.find((s) => s.topic === topic);
          const qs = questions.filter((q) => q.section === topic);
          return (
            <div key={topic} className={styles.topicBox}>
              <p className={styles.topicText}>
                <span>{topic}</span>{planned && <span className={styles.minutesLabel}>{planned.minutes} min</span>}
              </p>
              {qs.map((q) => (
                <button key={q.id} onClick={() => onSelect(q.id)} className={`${styles.promptButton} ${q.id === selectedId ? styles.promptButtonSelected : styles.promptButtonDefault}`}>
                  {answeredState(q) ? <CheckCircle className={styles.checkCircleIcon} /> : <Circle className={styles.circleIcon} />}
                  <span className={styles.promptLabel}>{q.prompt}</span>
                </button>
              ))}
              {!qs.length && <p className={styles.noQuestionsText}>No questions</p>}
            </div>
          );
        })}
      </div>
      <form className={styles.addQuestionForm} onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add.mutate(); }}>
        <input className={styles.addAQuestionInput} placeholder="Add a question…" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} />
        <button type="submit" disabled={!draft.trim() || add.isPending} className={styles.addQuestionButton} aria-label="Add question"><Plus className={styles.playCircleIcon} /></button>
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
  const lang = INTERVIEW_LANGUAGES.find((l) => l.id === fields.languageId) ?? INTERVIEW_LANGUAGES[0];

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
    <div className={styles.aiObservationsSupportBox}>
      <div className="card">
        <div className={styles.eslintDisableBox}>
          <span className={styles.eslintDisableLabel}>{q.section || 'Question'}</span>
          <span className={`${styles.eslintDisableLabel2} ${saveState === 'error' ? styles.eslintDisableLabelError : styles.eslintDisableLabelDefault}`}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved' : saveState === 'error' ? MSG.saveFailedKeepTyping : 'Saved'}
          </span>
        </div>
        <textarea className={styles.questionTextarea} rows={2} value={fields.prompt} onChange={(e) => edit({ prompt: e.target.value })} aria-label="Question" />
      </div>

      <div className={styles.messageSquareTextBox}>
        <div className={styles.messageSquareTextBox2}>
          <label className={styles.ansLabel} htmlFor={`ans-${q.id}`}><MessageSquareText className={styles.messageSquareTextIcon} /> Candidate answer</label>
          <textarea id={`ans-${q.id}`} className={styles.ansTextarea} placeholder={MSG.captureCandidatesExplanationThey} value={fields.answer} onChange={(e) => edit({ answer: e.target.value })} />
        </div>
        <div className={styles.messageSquareTextBox2}>
          <label className={styles.ansLabel} htmlFor={`notes-${q.id}`}><NotebookPen className={styles.messageSquareTextIcon} /> Interviewer notes <span className={styles.privateLabel}>(private)</span></label>
          <textarea id={`notes-${q.id}`} className={styles.ansTextarea} placeholder={MSG.hintsGivenFollowUps} value={fields.notes} onChange={(e) => edit({ notes: e.target.value })} />
        </div>
      </div>

      <div className={styles.codeBox}>
        <div className={styles.codeBox2}>
          <span className={styles.ansLabel}><Code2 className={styles.messageSquareTextIcon} /> Candidate code</span>
          <div className={styles.languageBox}>
            <select className={styles.languageSelect} value={fields.languageId} onChange={(e) => edit({ languageId: Number(e.target.value) })} aria-label="Language">
              {INTERVIEW_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={() => run.mutate()} disabled={!fields.code.trim() || run.isPending} className={styles.playButton}><Play className={styles.playCircleIcon} /> {run.isPending ? 'Running…' : 'Run'}</button>
          </div>
        </div>
        <div className={styles.eslintDisableBox2}>
          <Editor
            height="100%"
            language={lang.monacoLang}
            value={fields.code}
            onChange={(v) => { if ((v ?? '') !== fields.code) edit({ code: v ?? '' }); }}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, wordWrap: 'on' }}
          />
        </div>
        <div className={styles.inputStdinBox}>
          <div className={styles.inputStdinBox2}>
            <label className={styles.eslintDisableLabel} htmlFor={`stdin-${q.id}`}>Input (stdin)</label>
            <textarea id={`stdin-${q.id}`} className={styles.stdinTextarea} value={stdin} onChange={(e) => setStdin(e.target.value)} />
          </div>
          <div className={styles.terminalBox}>
            <p className={styles.executionResultText}><Terminal className={styles.terminalIcon} /> Execution result</p>
            {run.isError ? (
              <p className={styles.eslintDisableText}>{apiError(run.error, 'Run failed')}</p>
            ) : result ? (
              <div className={styles.statusBox}>
                <p className={`${styles.statusText} ${ok ? styles.statusTextOk : styles.eslintDisableLabelError}`}>
                  {result.status}{result.timeSeconds !== null && <span className={styles.eslintDisableLabel3}> · {result.timeSeconds}s</span>}
                </p>
                {result.stdout && <pre className={styles.stdoutPre}>{result.stdout}</pre>}
                {result.stderr && <pre className={styles.stderrPre}>{result.stderr}</pre>}
              </div>
            ) : (
              <p className={styles.runTheCodeText}>{MSG.runCodeSeeOutput}</p>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className={styles.sparklesBox}>
          <h3 className={styles.ansLabel}><Sparkles className={styles.messageSquareTextIcon} /> AI observations</h3>
          <button onClick={() => observe.mutate()} disabled={observe.isPending} className={styles.sparklesButton}>
            <Sparkles className={styles.playCircleIcon} /> {observe.isPending ? 'Analysing…' : q.aiObservations.length ? 'Refresh observations' : 'Generate observations'}
          </button>
        </div>
        {observe.isError && <p className={styles.eslintDisableText2}>{apiError(observe.error, 'Could not analyse')}</p>}
        {q.aiObservations.length ? (
          <ObservationList observations={q.aiObservations} />
        ) : (
          <p className={styles.captureAnAnswerText}>{MSG.captureAnswerCodeNotes}</p>
        )}
        <p className={styles.aiObservationsSupportText}>{MSG.aiObservationsSupportJudgement}{skills.join(', ')}.</p>
      </div>
    </div>
  );
}

function ObservationList({ observations }: { observations: Observation[] }) {
  return (
    <ul className={styles.eslintDisableList}>
      {observations.map((o, i) => {
        const s = SENTIMENT[o.sentiment];
        const Icon = s.icon;
        return (
          <li key={i} className={styles.observationItem}>
            <div className={styles.observationBox}>
              <span className={`${styles.label3} ${s.className}`} title={s.label}><Icon className={styles.playCircleIcon} /></span>
              <div className={styles.observationBox2}>
                <p className={styles.observationText}><span className={styles.skillLabel}>{o.skill}</span>{o.observation}</p>
                <ul className={styles.eslintDisableList2}>
                  {o.evidence.map((e, j) => (
                    <li key={j} className={styles.quoteItem}>
                      <Quote className={styles.quoteIcon} />
                      <span className={styles.eslintDisableLabel4}>
                        <span className={styles.eslintDisableLabel5}>{EVIDENCE_LABELS[e.source]}{e.detail ? ` · ${e.detail}` : ''}: </span>
                        <code className={styles.quoteCode}>{e.quote}</code>
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
    <div className={styles.overallBox}>
      <div className={styles.eslintDisableBox3}>
        {ratings.map((r, i) => {
          const related = allObservations.filter((o) => o.skill.toLowerCase() === r.skill.toLowerCase());
          return (
            <div key={r.skill} className={styles.skillBox}>
              <div className={styles.skillBox2}>
                <h3 className={styles.skillTitle}>{r.skill}</h3>
                <div className={styles.ratingForBox} role="radiogroup" aria-label={`Rating for ${r.skill}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={r.rating === n} aria-label={`${n} of 5`} onClick={() => setRatings((rs) => rs.map((x, j) => (j === i ? { ...x, rating: x.rating === n ? 0 : n } : x)))}>
                      <Star className={`${styles.starIcon} ${n <= r.rating ? styles.starIconHigh : styles.starIconLow}`} />
                    </button>
                  ))}
                  <span className={styles.eslintDisableLabel6}>{r.rating ? ['', 'Poor', 'Weak', 'Adequate', 'Strong', 'Exceptional'][r.rating] : 'Not rated'}</span>
                </div>
              </div>
              <textarea className={styles.evidenceForYourTextarea} placeholder={MSG.evidenceRating(r.skill)} value={r.comment} onChange={(e) => setRatings((rs) => rs.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))} maxLength={2000} />
              {related.length > 0 && (
                <details className={styles.sparklesDetails}>
                  <summary className={styles.lengthSummary}><Sparkles className={styles.sparklesIcon} /> {related.length} AI observation{related.length === 1 ? '' : 's'} for {r.skill}</summary>
                  <div className={styles.eslintDisableBox4}><ObservationList observations={related} /></div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.overallBox2}>
        <h3 className={styles.skillTitle}>Overall</h3>
        <p className={styles.averageRatingText}>Average rating <span className={styles.eslintDisableLabel7}>{avg !== null ? avg.toFixed(1) : '—'}</span> across {rated.length} of {ratings.length} skills</p>
        <div>
          <span className="label">Recommendation</span>
          <div className={styles.eslintDisableBox5}>
            {(Object.keys(RECOMMENDATION) as Exclude<Recommendation, ''>[]).map((k) => (
              <button key={k} type="button" onClick={() => setRecommendation(recommendation === k ? '' : k)} className={`${styles.labelButton} ${recommendation === k ? `${styles.labelButtonSelected} ${RECOMMENDATION[k].className}` : styles.labelButtonDefault}`}>
                {RECOMMENDATION[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="iv-summary">Summary</label>
          <textarea id="iv-summary" className={styles.ivSummaryTextarea} placeholder={MSG.keyStrengthsConcernsReason} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={8000} />
        </div>
        {save.isError && <p className={styles.pText}>{apiError(save.error, 'Could not save')}</p>}
        {save.isSuccess && <p className={styles.savedText}>Saved.</p>}
        <div className={styles.checkCircleBox}>
          <button onClick={() => save.mutate(true)} disabled={save.isPending || !recommendation} className="btn-primary" title={!recommendation ? 'Choose a recommendation' : ''}>
            <CheckCircle className={styles.playCircleIcon} /> {interview.status === 'completed' ? 'Update evaluation' : 'Complete interview'}
          </button>
          <button onClick={() => save.mutate(false)} disabled={save.isPending} className={styles.saveDraftButton}><Save className={styles.playCircleIcon} /> Save draft</button>
        </div>
      </div>
    </div>
  );
}
