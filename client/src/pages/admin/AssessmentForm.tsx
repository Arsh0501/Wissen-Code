import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import ShareLinksModal from '../../components/ShareLinksModal';
import { Spinner, AvailabilityBadge, parseJsonArray, toLocalInputValue, formatDate } from '../../components/ui';
import { getAssessment, getQuestions, createAssessment, updateAssessment, apiError } from '../../services/api';
import type { AccessMode, AssessmentDifficulty, AssessmentInput, AssessmentStatus, Question, QuestionType, ReadinessIssue, WizardStepKey } from '../../types';
import {
  ListChecks, Search, Plus, X, ArrowUp, ArrowDown, Save, Rocket, AlertTriangle,
  Clock, Target, Calendar, Shuffle, Code2, BarChart3, Check, Wand2, Sparkles, Users, Lock, Link2, Repeat,
  CheckCircle, XCircle, Globe, Mail,
} from 'lucide-react';
import styles from './AssessmentForm.module.css';
import { DEFAULT_MARKS, EMAIL_OR_DOMAIN_RE, EMPTY_ASSESSMENT_FORM, LANGUAGES, WIZARD_STEPS, ASSESSMENT_FORM_MESSAGES as MSG } from '../../constants';


// Everything that must be right before generating/publishing, grouped by the step that fixes it
function checkReadiness(form: AssessmentInput, byId: Map<number, Question>, publishing: boolean): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const add = (step: WizardStepKey, text: string, level: 'error' | 'warn' = 'error') => issues.push({ step, level, text });
  const picked = form.questions.map((q) => byId.get(q.questionId)).filter(Boolean) as Question[];

  if (!form.name.trim()) add('details', MSG.giveAssessmentName);
  if (!form.questionTypes.length) add('details', MSG.chooseLeastOneQuestion);

  if (form.questions.length === 0) add('questions', publishing ? MSG.addLeastOneQuestion : MSG.noQuestionsSelectedYet, publishing ? 'error' : 'warn');
  const wrongType = picked.filter((q) => !form.questionTypes.includes(q.type));
  if (wrongType.length) add('questions', MSG.selectedQuestionTypeDidnt(wrongType.length, Array.from(new Set(wrongType.map((q) => q.type === 'mcq' ? 'MCQ' : 'coding'))).join(', ')));
  const untested = picked.filter((q) => q.type === 'coding' && !(q._count?.testCases));
  if (untested.length) add('questions', MSG.noTestCasesSo(untested.map((q) => `"${q.title}"`).join(', '), untested.length));
  if (form.questions.some((q) => !Number.isInteger(q.marks) || q.marks < 1 || q.marks > 1000)) add('questions', MSG.marksMustWholeNumbers);
  if (form.difficulty !== 'mixed' && picked.some((q) => q.difficulty !== form.difficulty)) {
    add('questions', MSG.someQuestionsArentAlthough(form.difficulty), 'warn');
  }

  if (!Number.isInteger(form.timeLimitMinutes) || form.timeLimitMinutes < 1 || form.timeLimitMinutes > 600) add('config', MSG.durationMustBetween1);
  if (!Number.isFinite(form.passingScore) || form.passingScore < 0 || form.passingScore > 100) add('config', MSG.passingScoreMustBetween);
  if (form.questionCount !== null && (form.questionCount < 1 || form.questionCount > form.questions.length)) {
    add('config', MSG.questionsPerCandidateMust(form.questions.length));
  }
  if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) add('config', MSG.closingTimeMustAfter);
  if (publishing && form.endAt && new Date(form.endAt) < new Date()) add('config', MSG.closingTimePastSo);
  if (form.accessMode === 'restricted' && form.allowedEmails.length === 0) add('config', MSG.addLeastOneAllowed);
  if (form.allowedEmails.some((e) => !EMAIL_OR_DOMAIN_RE.test(e))) add('config', MSG.someAllowedEntriesNot);
  if (!Number.isInteger(form.maxAttempts) || form.maxAttempts < 1 || form.maxAttempts > 10) add('config', MSG.attemptsMustBetween1);
  return issues;
}

function Toggle({ checked, onChange, label, hint, icon: Icon }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <label className={styles.label}>
      <Icon className={styles.icon} />
      <div className={styles.labelBox}>
        <p className={styles.labelText}>{label}</p>
        <p className={styles.hintText}>{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`${styles.switchButton} ${checked ? styles.switchButtonChecked : styles.switchButtonDefault}`}
      >
        <span className={`${styles.label2} ${checked ? styles.labelChecked : ''}`} />
      </button>
    </label>
  );
}

function ChipInput({ values, onChange, placeholder, id, validate }: {
  values: string[]; onChange: (v: string[]) => void; placeholder: string; id: string; validate?: (v: string) => boolean;
}) {
  const [draft, setDraft] = useState('');
  function commit() {
    const parts = draft.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...values, ...parts])));
    setDraft('');
  }
  return (
    <div className={styles.box} onClick={() => document.getElementById(id)?.focus()}>
      {values.map((v) => {
        const bad = validate && !validate(v);
        return (
          <span key={v} className={`${styles.vLabel} ${bad ? styles.vLabelBad : styles.vLabelDefault}`}>
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X className={styles.xIcon} /></button>
          </span>
        );
      })}
      <input
        id={id}
        className={styles.idInput}
        placeholder={values.length ? '' : placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={commit}
      />
    </div>
  );
}

export default function AssessmentForm() {
  const { id } = useParams();
  const editId = id ? parseInt(id) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState<AssessmentInput>(EMPTY_ASSESSMENT_FORM);
  const [bank, setBank] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<WizardStepKey>('details');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [candidateCount, setCandidateCount] = useState(0);
  const [savedId, setSavedId] = useState<number | null>(editId);
  const [savedStatus, setSavedStatus] = useState<AssessmentStatus>('draft');
  const [dirtySinceSave, setDirtySinceSave] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [triedPublish, setTriedPublish] = useState(false);

  // Question picker filters
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const questions = await getQuestions();
        setBank(questions);
        if (editId) {
          const a = await getAssessment(editId);
          setSavedStatus(a.status);
          setCandidateCount(a.stats?.candidatesStarted ?? 0);
          setForm({
            name: a.name,
            description: a.description,
            instructions: a.instructions,
            timeLimitMinutes: a.timeLimitMinutes,
            passingScore: a.passingScore,
            status: a.status,
            startAt: a.startAt,
            endAt: a.endAt,
            shuffleQuestions: a.shuffleQuestions,
            allowedLanguages: parseJsonArray<number>(a.allowedLanguages),
            showResults: a.showResults,
            difficulty: a.difficulty ?? 'mixed',
            topics: parseJsonArray(a.topics),
            questionTypes: parseJsonArray<QuestionType>(a.questionTypes).length ? parseJsonArray<QuestionType>(a.questionTypes) : ['coding'],
            questionCount: a.questionCount ?? null,
            shuffleOptions: a.shuffleOptions ?? false,
            maxAttempts: a.maxAttempts ?? 1,
            accessMode: a.accessMode ?? 'anyone',
            allowedEmails: parseJsonArray(a.allowedEmails),
            questions: a.questions.map((aq) => ({ questionId: aq.questionId, marks: aq.marks })),
          });
        }
      } catch (err) {
        setServerError(apiError(err, 'Failed to load'));
      } finally {
        setLoading(false);
      }
    })();
  }, [editId]);

  const set = <K extends keyof AssessmentInput>(key: K, value: AssessmentInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirtySinceSave(true);
  };

  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const allTopics = useMemo(
    () => Array.from(new Set(bank.flatMap((q) => [q.topic, ...parseJsonArray(q.tags)]).filter((t) => t && t !== 'ai-generated'))).sort(),
    [bank]
  );
  const selectedIds = new Set(form.questions.map((q) => q.questionId));
  const matchesTopic = (q: Question, t: string) => q.topic.toLowerCase() === t.toLowerCase() || parseJsonArray(q.tags).map((x) => x.toLowerCase()).includes(t.toLowerCase());
  const available = bank.filter(
    (q) =>
      !selectedIds.has(q.id) &&
      form.questionTypes.includes(q.type) &&
      (!search || q.title.toLowerCase().includes(search.toLowerCase())) &&
      (!difficulty || q.difficulty === difficulty) &&
      (!typeFilter || q.type === typeFilter) &&
      (!topicFilter || matchesTopic(q, topicFilter))
  );
  // Questions matching the assessment's own topics float to the top
  const sortedAvailable = form.topics.length
    ? [...available].sort((a, b) => Number(form.topics.some((t) => matchesTopic(b, t))) - Number(form.topics.some((t) => matchesTopic(a, t))))
    : available;
  const totalMarks = form.questions.reduce((a, q) => a + (q.marks || 0), 0);
  const selectedQuestions = form.questions.map((q) => ({ ...q, question: byId.get(q.questionId) }));
  const hasCoding = selectedQuestions.some((q) => q.question?.type === 'coding') || form.questionTypes.includes('coding');
  const hasMcq = selectedQuestions.some((q) => q.question?.type === 'mcq') || form.questionTypes.includes('mcq');

  function addQuestion(q: Question) {
    set('questions', [...form.questions, { questionId: q.id, marks: DEFAULT_MARKS[q.difficulty] ?? 10 }]);
  }
  function removeQuestion(qid: number) {
    const next = form.questions.filter((q) => q.questionId !== qid);
    set('questions', next);
    if (form.questionCount !== null && form.questionCount > next.length) set('questionCount', next.length || null);
  }
  function moveQuestion(idx: number, dir: -1 | 1) {
    const next = [...form.questions];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    set('questions', next);
  }
  function setMarks(qid: number, marks: number) {
    set('questions', form.questions.map((q) => (q.questionId === qid ? { ...q, marks } : q)));
  }
  function toggleLanguage(langId: number) {
    const cur = form.allowedLanguages;
    set('allowedLanguages', cur.includes(langId) ? cur.filter((l) => l !== langId) : [...cur, langId]);
  }
  function toggleType(t: QuestionType) {
    const cur = form.questionTypes;
    set('questionTypes', cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  }

  const issues = checkReadiness(form, byId, triedPublish);
  const errors = issues.filter((i) => i.level === 'error');
  const stepErrors = (k: WizardStepKey) => errors.filter((i) => i.step === k);
  // Errors that block saving at all (a draft may have no questions yet)
  const draftErrors = checkReadiness(form, byId, false).filter((i) => i.level === 'error');

  // Generate = persist the assessment (as a draft unless it's already live)
  async function generate(): Promise<number | null> {
    const blocking = checkReadiness(form, byId, false).filter((i) => i.level === 'error');
    if (blocking.length) {
      setStep(blocking[0].step);
      return null;
    }
    setSaving(true);
    setServerError('');
    try {
      const status: AssessmentStatus = savedStatus === 'published' ? 'published' : 'draft';
      const payload = { ...form, status };
      const saved = savedId ? await updateAssessment(savedId, payload) : await createAssessment(payload);
      setSavedId(saved.id);
      setSavedStatus(saved.status);
      setDirtySinceSave(false);
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      return saved.id;
    } catch (err) {
      setServerError(apiError(err, MSG.failedSaveAssessment));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraftNow() {
    const idSaved = await generate();
    if (idSaved) navigate('/admin/assessments');
  }

  async function setPublished(publish: boolean) {
    setTriedPublish(publish);
    if (publish) {
      const blocking = checkReadiness(form, byId, true).filter((i) => i.level === 'error');
      if (blocking.length) {
        setStep(blocking[0].step);
        return;
      }
    }
    const idSaved = dirtySinceSave || !savedId ? await generate() : savedId;
    if (!idSaved) return;
    setSaving(true);
    try {
      const saved = await updateAssessment(idSaved, { status: publish ? 'published' : 'draft' });
      setSavedStatus(saved.status);
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      setServerError(apiError(err, MSG.failedUpdateStatus));
    } finally {
      setSaving(false);
    }
  }

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === step);

  if (loading) {
    return (
      <AdminLayout title={editId ? 'Edit Assessment' : 'Create Assessment'} maxWidth={styles.adminLayoutMaxWidth}>
        <Spinner label="Loading..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={editId ? 'Edit Assessment' : 'Create Assessment'}
      subtitle={
        savedId ? (
          <span className={styles.currentlyLabel}>
            Currently <AvailabilityBadge value={savedStatus === 'published' ? 'open' : savedStatus} />
            {dirtySinceSave && <span className={styles.unsavedChangesLabel}>· unsaved changes</span>}
          </span>
        ) : (
          MSG.basicDetailsQuestionsConfiguration
        )
      }
      maxWidth={styles.adminLayoutMaxWidth}
      actions={
        <>
          <Link to="/admin/assessments" className={styles.closeLink}>Close</Link>
          <button onClick={saveDraftNow} disabled={saving} className={styles.saveDraftNowButton}>
            <Save className={styles.saveIcon} /> {savedStatus === 'published' ? 'Save changes' : 'Save draft'}
          </button>
        </>
      }
    >
      {candidateCount > 0 && (
        <div className={styles.alertTriangleBox}>
          <AlertTriangle className={styles.alertTriangleIcon} />
          <p>
            {candidateCount} candidate{candidateCount === 1 ? ' has' : 's have'} {MSG.alreadyTakenAssessmentChanging}</p>
        </div>
      )}
      {serverError && <div className={styles.serverErrorBox}>{serverError}</div>}

      {/* Stepper */}
      <ol className={styles.stepperList}>
        {WIZARD_STEPS.map((s, i) => {
          const hasError = stepErrors(s.key).length > 0 && (s.key !== 'questions' || form.questions.length > 0 || triedPublish);
          const active = s.key === step;
          const done = i < stepIndex;
          const Icon = s.icon;
          return (
            <li key={s.key}>
              <button
                onClick={() => setStep(s.key)}
                className={`${styles.labelButton} ${active ? styles.labelButtonActive : styles.labelButtonInactive}`}
              >
                <span className={`${styles.stepperLabel} ${hasError ? styles.stepperLabelError : active ? styles.stepperLabelActive : done ? styles.stepperLabelDone : styles.stepperLabelDefault}`}>
                  {hasError ? '!' : done ? <Check className={styles.xIcon} /> : i + 1}
                </span>
                <Icon className={styles.stepperIcon} />
                {s.label}
                {s.key === 'questions' && form.questions.length > 0 && <span className={styles.stepperLabel2}>({form.questions.length})</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {['details', 'questions', 'config'].includes(step) && stepErrors(step).length > 0 && (step !== 'questions' || form.questions.length > 0 || triedPublish) ? (
        <ul className={styles.stepperList2}>
          {stepErrors(step).map((e) => <li key={e.text}>{e.text}</li>)}
        </ul>
      ) : null}

      {/* ── Step 1: Basic details ── */}
      {step === 'details' && (
        <div className={styles.aNameBox}>
          <div className={styles.aNameBox2}>
            <div>
              <label className="label" htmlFor="a-name">Assessment name *</label>
              <input id="a-name" className="input" placeholder={MSG.campusHiring2026RoundExample} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="a-desc">Description</label>
              <textarea id="a-desc" className={styles.aDescTextarea} placeholder={MSG.shownCandidatesTheirDashboard} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="a-instr">Instructions <span className={styles.markdownLabel}>(Markdown)</span></label>
              <textarea id="a-instr" className={styles.aInstrTextarea} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
              <p className={styles.shownOnTheText}>{MSG.shownStartScreenBefore}</p>
            </div>
          </div>
          <div className={styles.aDiffBox}>
            <div>
              <span className="label">Question types *</span>
              <div className={styles.stepBasicBox}>
                {([['coding', 'Coding', MSG.programsGradedTestCases, Code2], ['mcq', 'Multiple choice', 'Auto-graded answer options', ListChecks]] as const).map(([k, l, hint, Icon]) => {
                  const on = form.questionTypes.includes(k);
                  return (
                    <button key={k} type="button" onClick={() => toggleType(k)} className={`${styles.lButton} ${on ? styles.lButtonOn : styles.lButtonDefault}`}>
                      <Icon className={`${styles.stepBasicIcon} ${on ? styles.stepBasicIconOn : styles.stepBasicIconDefault}`} />
                      <span className={styles.labelBox}>
                        <span className={styles.lLabel}>{l}</span>
                        <span className={styles.hintLabel}>{hint}</span>
                      </span>
                      {on && <Check className={styles.checkIcon} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="a-diff">Target difficulty</label>
              <select id="a-diff" className="input" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as AssessmentDifficulty)}>
                <option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="a-topics">Topics</label>
              <ChipInput id="a-topics" values={form.topics} onChange={(v) => set('topics', v)} placeholder="arrays, react, sql…" />
              <p className={styles.shownOnTheText}>{MSG.matchingQuestionsShownFirst}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Select questions ── */}
      {step === 'questions' && (
        <div className={styles.searchBox}>
          <div className={styles.searchBox2}>
            <div className={styles.searchBox3}>
              <div className={styles.questionBankBox}>
                <h2 className={styles.questionBankTitle}>Question bank</h2>
                <div className={styles.sparklesBox}>
                  <Link to="/admin/questions/ai" className={styles.generateWithAiLink}><Sparkles className={styles.xIcon} /> Generate with AI</Link>
                  <Link to="/admin/questions/new" className={styles.newQuestionLink}>+ New question</Link>
                </div>
              </div>
              <div className={styles.searchBox4}>
                <Search className={styles.searchIcon} />
                <input className={styles.searchQuestionsInput} placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className={styles.difficultyBox}>
                <select className={styles.difficultySelect} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
                  <option value="">All levels</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
                <select className={styles.difficultySelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
                  <option value="">All types</option>
                  {form.questionTypes.includes('coding') && <option value="coding">Coding</option>}
                  {form.questionTypes.includes('mcq') && <option value="mcq">MCQ</option>}
                </select>
                <select className={styles.difficultySelect} value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} aria-label="Topic">
                  <option value="">All topics</option>
                  {allTopics.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <ul className={styles.stepSelectList}>
              {sortedAvailable.map((q) => {
                const topicMatch = form.topics.some((t) => matchesTopic(q, t));
                return (
                  <li key={q.id} className={styles.plusItem}>
                    <div className={styles.titleBox}>
                      <p className={styles.titleText}>{q.title}</p>
                      <div className={styles.difficultyBox2}>
                        <span className={styles.stepSelectLabel}>{q.type === 'mcq' ? 'MCQ' : 'Coding'}</span>
                        <span className={`badge-${q.difficulty}`}>{q.difficulty}</span>
                        {topicMatch && <span className={styles.topicMatchLabel}>topic match</span>}
                        {parseJsonArray(q.tags).filter((t) => t !== 'ai-generated').slice(0, 2).map((t) => <span key={t} className={styles.stepSelectLabel2}>#{t}</span>)}
                        {q.type === 'coding' && <span className={`${styles.stepSelectLabel3} ${q._count?.testCases ? styles.stepSelectLabelTestCases : styles.stepSelectLabelDefault}`}>· {q._count?.testCases ?? 0} tests</span>}
                      </div>
                    </div>
                    <button onClick={() => addQuestion(q)} className={styles.addButton}><Plus className={styles.plusIcon} /> Add</button>
                  </li>
                );
              })}
              {sortedAvailable.length === 0 && (
                <li className={styles.stepSelectItem}>
                  {bank.length === 0 ? MSG.questionBankEmpty : MSG.noMatchingQuestionsChange}
                </li>
              )}
            </ul>
          </div>

          <div className={styles.searchBox2}>
            <div className={styles.selectedQuestionsBox}>
              <h2 className={styles.questionBankTitle}>Selected questions ({form.questions.length})</h2>
              <span className={styles.totalLabel}>Total <span className={styles.totalMarksLabel}>{totalMarks}</span> marks</span>
            </div>
            {selectedQuestions.length === 0 ? (
              <p className={styles.addQuestionsFromText}>{MSG.addQuestionsBankDefault}</p>
            ) : (
              <ol className={styles.stepSelectList2}>
                {selectedQuestions.map((sq, idx) => (
                  <li key={sq.questionId} className={styles.removeItem}>
                    <span className={styles.stepSelectLabel4}>{idx + 1}</span>
                    <div className={styles.titleBox}>
                      <p className={styles.titleText}>{sq.question?.title ?? `Question #${sq.questionId}`}</p>
                      {sq.question && (
                        <div className={styles.difficultyBox3}>
                          <span className={styles.stepSelectLabel}>{sq.question.type === 'mcq' ? 'MCQ' : 'Coding'}</span>
                          <span className={`badge-${sq.question.difficulty}`}>{sq.question.difficulty}</span>
                        </div>
                      )}
                    </div>
                    <label className={styles.marksLabel}>
                      <input type="number" min={1} max={1000} className={styles.marksForInput} value={Number.isNaN(sq.marks) ? '' : sq.marks} onChange={(e) => setMarks(sq.questionId, parseInt(e.target.value))} aria-label={`Marks for ${sq.question?.title}`} />
                      marks
                    </label>
                    <div className={styles.moveUpBox}>
                      <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} className={styles.moveUpButton} title="Move up"><ArrowUp className={styles.plusIcon} /></button>
                      <button onClick={() => moveQuestion(idx, 1)} disabled={idx === selectedQuestions.length - 1} className={styles.moveUpButton} title="Move down"><ArrowDown className={styles.plusIcon} /></button>
                    </div>
                    <button onClick={() => removeQuestion(sq.questionId)} className={styles.removeButton} title="Remove"><X className={styles.saveIcon} /></button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: Configure ── */}
      {step === 'config' && (
        <div className={styles.searchBox}>
          <div className={styles.timingQuestionsAmpBox}>
            <div className={styles.aDiffBox}>
              <h2 className={styles.questionBankTitle}>Timing, questions &amp; scoring</h2>
              <div className={styles.aTimeBox}>
                <div>
                  <label className={styles.aTimeLabel} htmlFor="a-time"><Clock className={styles.plusIcon} /> Duration (minutes)</label>
                  <input id="a-time" type="number" min={1} max={600} className="input" value={Number.isNaN(form.timeLimitMinutes) ? '' : form.timeLimitMinutes} onChange={(e) => set('timeLimitMinutes', parseInt(e.target.value))} />
                </div>
                <div>
                  <label className={styles.aTimeLabel} htmlFor="a-pass"><Target className={styles.plusIcon} /> Passing score (%)</label>
                  <input id="a-pass" type="number" min={0} max={100} className="input" value={Number.isNaN(form.passingScore) ? '' : form.passingScore} onChange={(e) => set('passingScore', parseInt(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="a-count">Questions per candidate</label>
                <div className={styles.sparklesBox}>
                  <input
                    id="a-count"
                    type="number"
                    min={1}
                    max={form.questions.length || 1}
                    className={styles.aCountInput}
                    placeholder={String(form.questions.length || 'All')}
                    value={form.questionCount ?? ''}
                    onChange={(e) => set('questionCount', e.target.value ? parseInt(e.target.value) : null)}
                  />
                  <span className={styles.stepperLabel2}>
                    of {form.questions.length} selected.{' '}
                    {form.questionCount && form.questionCount < form.questions.length
                      ? MSG.eachCandidateGetsRandom(form.questionCount)
                      : MSG.leaveEmptyEveryoneGet}
                  </span>
                </div>
              </div>
              <div>
                <label className={styles.aTimeLabel} htmlFor="a-attempts"><Repeat className={styles.plusIcon} /> Attempts allowed</label>
                <div className={styles.sparklesBox}>
                  <input id="a-attempts" type="number" min={1} max={10} className={styles.aCountInput} value={Number.isNaN(form.maxAttempts) ? '' : form.maxAttempts} onChange={(e) => set('maxAttempts', parseInt(e.target.value))} />
                  <span className={styles.stepperLabel2}>{form.maxAttempts > 1 ? MSG.latestAttemptCountsEarlier : MSG.oneAttemptPerCandidate}</span>
                </div>
              </div>
            </div>

            <div className={styles.calendarBox}>
              <h3 className={styles.validityWindowTitle}><Calendar className={styles.saveIcon} /> Validity window</h3>
              <p className={styles.leaveEmptyToText}>{MSG.leaveEmptyAllowStarting}</p>
              <div className={styles.aTimeBox}>
                <div>
                  <label className="label" htmlFor="a-start">Opens</label>
                  <input id="a-start" type="datetime-local" className="input" value={toLocalInputValue(form.startAt)} onChange={(e) => set('startAt', e.target.value ? new Date(e.target.value).toISOString() : null)} />
                </div>
                <div>
                  <label className="label" htmlFor="a-end">Closes</label>
                  <input id="a-end" type="datetime-local" className="input" value={toLocalInputValue(form.endAt)} onChange={(e) => set('endAt', e.target.value ? new Date(e.target.value).toISOString() : null)} />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.timingQuestionsAmpBox}>
            <div className={styles.calendarBox}>
              <h2 className={styles.validityWindowTitle}><Users className={styles.saveIcon} /> {MSG.whoTake}</h2>
              <div className={styles.stepBasicBox}>
                {([
                  ['anyone', 'Any signed-in candidate', MSG.everyoneAccountPlusAnyone, Globe],
                  ['restricted', MSG.onlySpecificEmailsDomains, MSG.candidatesMustMatchAllow, Mail],
                  ['invite_only', MSG.onlyPeopleShareLink, MSG.hiddenOtherCandidatesShare, Link2],
                ] as const).map(([k, l, hint, Icon]) => (
                  <label key={k} className={`${styles.lLabel2} ${form.accessMode === k ? styles.lButtonOn : styles.lButtonDefault}`}>
                    <input type="radio" name="access" className={styles.stepConfigureInput} checked={form.accessMode === k} onChange={() => set('accessMode', k as AccessMode)} />
                    <Icon className={`${styles.stepConfigureIcon} ${form.accessMode === k ? styles.stepBasicIconOn : styles.stepBasicIconDefault}`} />
                    <span>
                      <span className={styles.lLabel3}>{l}</span>
                      <span className={styles.hintLabel}>{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {form.accessMode === 'restricted' && (
                <div>
                  <label className="label" htmlFor="a-emails">Allowed emails / domains</label>
                  <ChipInput id="a-emails" values={form.allowedEmails} onChange={(v) => set('allowedEmails', v.map((x) => x.toLowerCase()))} placeholder="jane@acme.com, @university.edu" validate={(v) => EMAIL_OR_DOMAIN_RE.test(v)} />
                  <p className={styles.shownOnTheText}>Use <code>@domain.com</code> {MSG.allowWholeOrganisation}</p>
                </div>
              )}
            </div>

            <div className={styles.calendarBox}>
              <h2 className={styles.questionBankTitle}>Randomization &amp; experience</h2>
              <Toggle icon={Shuffle} label="Shuffle question order" hint={MSG.eachCandidateGetsDifferent} checked={form.shuffleQuestions} onChange={(v) => set('shuffleQuestions', v)} />
              {hasMcq && <Toggle icon={Shuffle} label="Shuffle answer options" hint={MSG.multipleChoiceOptionsAppear} checked={form.shuffleOptions} onChange={(v) => set('shuffleOptions', v)} />}
              <Toggle icon={BarChart3} label={MSG.showResultsCandidates} hint={MSG.ifOffCandidatesOnly} checked={form.showResults} onChange={(v) => set('showResults', v)} />
              {hasCoding && (
                <div className={styles.codeBox}>
                  <p className={styles.allowedLanguagesText}><Code2 className={styles.codeIcon} /> Allowed languages</p>
                  <p className={styles.noneSelectedAllText}>{MSG.noneSelectedAllLanguages}</p>
                  <div className={styles.stepConfigureBox}>
                    {LANGUAGES.map((l) => {
                      const on = form.allowedLanguages.includes(l.id);
                      return (
                        <button key={l.id} type="button" onClick={() => toggleLanguage(l.id)} className={`${styles.nameButton} ${on ? styles.labelButtonActive : styles.nameButtonDefault}`}>
                          {on && <Check className={styles.plusIcon} />} {l.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Review ── */}
      {step === 'review' && (
        <div className={styles.aNameBox}>
          <div className={styles.difficultyBox4}>
            <div>
              <h2 className={styles.stepReviewTitle}>{form.name || <span className={styles.stepBasicIconDefault}>Untitled assessment</span>}</h2>
              {form.description && <p className={styles.descriptionText}>{form.description}</p>}
              <div className={styles.difficultyBox5}>
                {form.questionTypes.map((t) => <span key={t} className={styles.stepSelectLabel}>{t === 'mcq' ? 'Multiple choice' : 'Coding'}</span>)}
                <span className={styles.difficultyLabel}>{form.difficulty} difficulty</span>
                {form.topics.map((t) => <span key={t} className={styles.topicMatchLabel}>{t}</span>)}
              </div>
            </div>
            <table className={styles.stepReviewTable}>
              <thead>
                <tr className={styles.stepReviewRow}>
                  <th className={styles.stepReviewTh}>#</th>
                  <th className={styles.stepReviewTh}>Question</th>
                  <th className={styles.stepReviewTh}>Type</th>
                  <th className={styles.stepReviewTh}>Difficulty</th>
                  <th className={styles.marksTh}>Marks</th>
                </tr>
              </thead>
              <tbody className={styles.stepReviewBody}>
                {selectedQuestions.map((sq, i) => (
                  <tr key={sq.questionId}>
                    <td className={styles.stepReviewCell}>{i + 1}</td>
                    <td className={styles.titleCell}>{sq.question?.title}</td>
                    <td className={styles.stepReviewCell2}>{sq.question?.type === 'mcq' ? 'MCQ' : 'Coding'}</td>
                    <td className={styles.stepReviewCell3}>{sq.question && <span className={`badge-${sq.question.difficulty}`}>{sq.question.difficulty}</span>}</td>
                    <td className={styles.marksCell}>{sq.marks}</td>
                  </tr>
                ))}
                {selectedQuestions.length === 0 && <tr><td colSpan={5} className={styles.noQuestionsSelectedCell}>No questions selected</td></tr>}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={4} className={styles.totalCell}>Total{form.questionCount && form.questionCount < form.questions.length ? ` (each candidate answers ${form.questionCount})` : ''}</td>
                  <td className={styles.totalMarksCell}>{totalMarks}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className={styles.timingQuestionsAmpBox}>
            <div className={styles.configurationBox}>
              <h3 className={styles.configurationTitle}>Configuration</h3>
              {[
                ['Duration', `${form.timeLimitMinutes} minutes`],
                ['Passing score', `${form.passingScore}%`],
                ['Questions per candidate', form.questionCount && form.questionCount < form.questions.length ? `${form.questionCount} random of ${form.questions.length}` : `All ${form.questions.length}`],
                ['Attempts', String(form.maxAttempts)],
                ['Opens', form.startAt ? formatDate(form.startAt) : 'Immediately'],
                ['Closes', form.endAt ? formatDate(form.endAt) : 'No deadline'],
                ['Access', form.accessMode === 'anyone' ? 'Any candidate' : form.accessMode === 'restricted' ? `${form.allowedEmails.length} allowed email/domain${form.allowedEmails.length === 1 ? '' : 's'}` : 'Share links only'],
                ['Question order', form.shuffleQuestions ? 'Shuffled' : 'Fixed'],
                ...(hasMcq ? [['Answer options', form.shuffleOptions ? 'Shuffled' : 'Fixed']] : []),
                ...(hasCoding ? [['Languages', form.allowedLanguages.length ? LANGUAGES.filter((l) => form.allowedLanguages.includes(l.id)).map((l) => l.name).join(', ') : 'All']] : []),
                ['Results to candidate', form.showResults ? 'Shown' : 'Hidden'],
              ].map(([k, v]) => (
                <div key={k} className={styles.kBox}>
                  <span className={styles.stepBasicIconDefault}>{k}</span>
                  <span className={styles.vLabel2}>{v}</span>
                </div>
              ))}
            </div>
            <ReadinessList issues={issues} onGo={setStep} />
          </div>
        </div>
      )}

      {/* ── Step 5: Generate ── */}
      {step === 'generate' && (
        <div className={styles.stepGenerateBox}>
          <div className={styles.stepGenerateBox2}>
            <div className={`${styles.stepGenerateBox3} ${savedId && !dirtySinceSave ? styles.stepGenerateBoxOn : styles.stepGenerateBoxOff}`}>
              {savedId && !dirtySinceSave ? <CheckCircle className={styles.checkCircleIcon} /> : <Wand2 className={styles.checkCircleIcon} />}
            </div>
            {savedId && !dirtySinceSave ? (
              <>
                <h2 className={styles.assessmentGeneratedTitle}>Assessment generated</h2>
                <p className={styles.savedAsText}>Saved as {savedStatus === 'published' ? 'a live assessment' : 'a draft'} with {form.questions.length} question{form.questions.length === 1 ? '' : 's'} ({totalMarks} marks).</p>
                <button onClick={() => setStep('publish')} className={styles.continueToPublishButton}>Continue to publish <Rocket className={styles.saveIcon} /></button>
              </>
            ) : (
              <>
                <h2 className={styles.assessmentGeneratedTitle}>{savedId ? 'Save your changes' : 'Generate the assessment'}</h2>
                <p className={styles.thisSavesTheText}>
                  {MSG.savesAssessmentItsQuestions}{savedStatus === 'published' ? '. It stays live.' : MSG.draftCandidatesCantSee}
                </p>
                <button onClick={async () => { if (await generate()) setStep('publish'); }} disabled={saving || draftErrors.length > 0} className={styles.continueToPublishButton}>
                  <Wand2 className={styles.saveIcon} /> {saving ? 'Generating...' : savedId ? 'Save changes' : 'Generate assessment'}
                </button>
              </>
            )}
          </div>
          <ReadinessList issues={issues} onGo={setStep} />
        </div>
      )}

      {/* ── Step 6: Publish ── */}
      {step === 'publish' && (
        <div className={styles.stepGenerateBox}>
          {!savedId ? (
            <div className={styles.stepGenerateBox2}>
              <p className={styles.totalLabel}>{MSG.generateAssessmentFirst}</p>
              <button onClick={() => setStep('generate')} className={styles.goToGenerateButton}><Wand2 className={styles.saveIcon} /> Go to Generate</button>
            </div>
          ) : (
            <>
              <div className="card">
                <div className={styles.statusBox}>
                  <div>
                    <p className={styles.statusText}>Status</p>
                    <p className={styles.stepPublishText}>
                      {savedStatus === 'published' ? <><span className={styles.stepPublishLabel} /> Published</> : <><Lock className={styles.lockIcon} /> Draft</>}
                    </p>
                    <p className={styles.shownOnTheText}>
                      {savedStatus === 'published'
                        ? form.startAt && new Date(form.startAt) > new Date() ? MSG.visibleCandidatesOpens(formatDate(form.startAt)) : MSG.candidatesStartNow
                        : 'Hidden from candidates.'}
                    </p>
                  </div>
                  {savedStatus === 'published' ? (
                    <button onClick={() => setPublished(false)} disabled={saving} className={styles.saveDraftNowButton}>Unpublish</button>
                  ) : (
                    <button onClick={() => setPublished(true)} disabled={saving} className="btn-primary"><Rocket className={styles.saveIcon} /> {saving ? 'Publishing...' : 'Publish now'}</button>
                  )}
                </div>
                {dirtySinceSave && <p className={styles.youHaveUnsavedText}>{MSG.haveUnsavedChangesPublishing}</p>}
              </div>
              {triedPublish && issues.some((i) => i.level === 'error') && <ReadinessList issues={issues} onGo={setStep} />}
              <div className={styles.linkBox}>
                <div>
                  <p className={styles.inviteCandidatesText}><Link2 className={styles.checkIcon} /> Invite candidates</p>
                  <p className={styles.hintText}>{form.accessMode === 'invite_only' ? MSG.assessmentOnlyReachableThrough : MSG.createLinkAnyoneUse}</p>
                </div>
                <button onClick={() => setShareOpen(true)} className={styles.saveDraftNowButton}><Link2 className={styles.saveIcon} /> Share link</button>
              </div>
              <div className={styles.viewResultsBox}>
                <Link to={`/admin/submissions/${savedId}`} className={styles.closeLink}>View results</Link>
                <Link to="/admin/assessments" className={styles.doneLink}>Done</Link>
              </div>
            </>
          )}
        </div>
      )}

      {shareOpen && savedId && (
        <ShareLinksModal assessment={{ id: savedId, name: form.name, status: savedStatus }} onClose={() => setShareOpen(false)} />
      )}

      {/* Step navigation */}
      <div className={styles.backBox}>
        <button onClick={() => setStep(WIZARD_STEPS[stepIndex - 1].key)} disabled={stepIndex === 0} className={styles.closeLink}>← Back</button>
        {stepIndex < WIZARD_STEPS.length - 1 && !(step === 'generate' && (!savedId || dirtySinceSave)) && (
          <button onClick={() => setStep(WIZARD_STEPS[stepIndex + 1].key)} className={styles.saveDraftNowButton}>Next: {WIZARD_STEPS[stepIndex + 1].label} →</button>
        )}
      </div>
    </AdminLayout>
  );
}

function ReadinessList({ issues, onGo }: { issues: ReadinessIssue[]; onGo: (s: WizardStepKey) => void }) {
  const errs = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  return (
    <div className="card">
      <h3 className={styles.readinessCheckTitle}>Readiness check</h3>
      {issues.length === 0 ? (
        <p className={styles.everythingLooksGoodText}><CheckCircle className={styles.saveIcon} /> Everything looks good.</p>
      ) : (
        <ul className={styles.stepBasicBox}>
          {[...errs, ...warns].map((i) => (
            <li key={i.text} className={styles.textItem}>
              {i.level === 'error' ? <XCircle className={styles.xcircleIcon} /> : <AlertTriangle className={styles.alertTriangleIcon2} />}
              <span className={styles.textLabel}>{i.text}</span>
              <button onClick={() => onGo(i.step)} className={styles.fixButton}>Fix</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
