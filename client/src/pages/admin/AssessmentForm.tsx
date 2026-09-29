import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import ShareLinksModal from '../../components/ShareLinksModal';
import { Spinner, AvailabilityBadge, parseJsonArray, toLocalInputValue, formatDate } from '../../components/ui';
import { getAssessment, getQuestions, createAssessment, updateAssessment, apiError } from '../../services/api';
import type { AccessMode, AssessmentDifficulty, AssessmentInput, AssessmentStatus, Question, QuestionType } from '../../types';
import {
  FileText, ListChecks, Settings2, Eye, Search, Plus, X, ArrowUp, ArrowDown, Save, Rocket, AlertTriangle,
  Clock, Target, Calendar, Shuffle, Code2, BarChart3, Check, Wand2, Sparkles, Users, Lock, Link2, Repeat,
  CheckCircle, XCircle, Globe, Mail,
} from 'lucide-react';

const LANGUAGES = [
  { id: 71, name: 'Python' },
  { id: 62, name: 'Java' },
  { id: 54, name: 'C++' },
  { id: 63, name: 'JavaScript' },
];

const DEFAULT_MARKS: Record<string, number> = { easy: 10, medium: 20, hard: 30 };

const STEPS = [
  { key: 'details', label: 'Basic details', icon: FileText },
  { key: 'questions', label: 'Select questions', icon: ListChecks },
  { key: 'config', label: 'Configure', icon: Settings2 },
  { key: 'review', label: 'Review', icon: Eye },
  { key: 'generate', label: 'Generate', icon: Wand2 },
  { key: 'publish', label: 'Publish', icon: Rocket },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const EMPTY_FORM: AssessmentInput = {
  name: '',
  description: '',
  instructions: `- Read every question carefully before you start.
- Use **Run code** to test against sample cases; hidden test cases are used for final grading.
- Your work is auto-saved. The test is submitted automatically when the timer reaches zero.`,
  timeLimitMinutes: 60,
  passingScore: 60,
  status: 'draft',
  startAt: null,
  endAt: null,
  shuffleQuestions: false,
  allowedLanguages: [],
  showResults: true,
  difficulty: 'mixed',
  topics: [],
  questionTypes: ['coding'],
  questionCount: null,
  shuffleOptions: false,
  maxAttempts: 1,
  accessMode: 'anyone',
  allowedEmails: [],
  questions: [],
};

const EMAIL_OR_DOMAIN = /^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/i;

type Issue = { step: StepKey; level: 'error' | 'warn'; text: string };

// Everything that must be right before generating/publishing, grouped by the step that fixes it
function checkReadiness(form: AssessmentInput, byId: Map<number, Question>, publishing: boolean): Issue[] {
  const issues: Issue[] = [];
  const add = (step: StepKey, text: string, level: 'error' | 'warn' = 'error') => issues.push({ step, level, text });
  const picked = form.questions.map((q) => byId.get(q.questionId)).filter(Boolean) as Question[];

  if (!form.name.trim()) add('details', 'Give the assessment a name.');
  if (!form.questionTypes.length) add('details', 'Choose at least one question type.');

  if (form.questions.length === 0) add('questions', publishing ? 'Add at least one question before publishing.' : 'No questions selected yet.', publishing ? 'error' : 'warn');
  const wrongType = picked.filter((q) => !form.questionTypes.includes(q.type));
  if (wrongType.length) add('questions', `${wrongType.length} selected question${wrongType.length === 1 ? ' is' : 's are'} a type you didn't choose (${Array.from(new Set(wrongType.map((q) => q.type === 'mcq' ? 'MCQ' : 'coding'))).join(', ')}).`);
  const untested = picked.filter((q) => q.type === 'coding' && !(q._count?.testCases));
  if (untested.length) add('questions', `${untested.map((q) => `"${q.title}"`).join(', ')} ${untested.length === 1 ? 'has' : 'have'} no test cases, so ${untested.length === 1 ? 'it' : 'they'} can't be graded.`);
  if (form.questions.some((q) => !Number.isInteger(q.marks) || q.marks < 1 || q.marks > 1000)) add('questions', 'Marks must be whole numbers between 1 and 1000.');
  if (form.difficulty !== 'mixed' && picked.some((q) => q.difficulty !== form.difficulty)) {
    add('questions', `Some questions aren't "${form.difficulty}" although that's the target difficulty.`, 'warn');
  }

  if (!Number.isInteger(form.timeLimitMinutes) || form.timeLimitMinutes < 1 || form.timeLimitMinutes > 600) add('config', 'Duration must be between 1 and 600 minutes.');
  if (!Number.isFinite(form.passingScore) || form.passingScore < 0 || form.passingScore > 100) add('config', 'Passing score must be between 0 and 100%.');
  if (form.questionCount !== null && (form.questionCount < 1 || form.questionCount > form.questions.length)) {
    add('config', `Questions per candidate must be between 1 and the ${form.questions.length} selected.`);
  }
  if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) add('config', 'The closing time must be after the opening time.');
  if (publishing && form.endAt && new Date(form.endAt) < new Date()) add('config', 'The closing time is in the past, so candidates could not start.');
  if (form.accessMode === 'restricted' && form.allowedEmails.length === 0) add('config', 'Add at least one allowed email or @domain, or choose another access option.');
  if (form.allowedEmails.some((e) => !EMAIL_OR_DOMAIN.test(e))) add('config', 'Some allowed entries are not valid emails or @domains.');
  if (!Number.isInteger(form.maxAttempts) || form.maxAttempts < 1 || form.maxAttempts > 10) add('config', 'Attempts must be between 1 and 10.');
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
    <label className="flex items-start gap-3 p-4 rounded-lg bg-surface-800/50 border border-surface-700 cursor-pointer hover:border-surface-600">
      <Icon className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-surface-100">{label}</p>
        <p className="text-xs text-surface-500 mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary-600' : 'bg-surface-600'}`}
      >
        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-on-accent transition-transform ${checked ? 'translate-x-4' : ''}`} />
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
    <div className="input flex flex-wrap items-center gap-1.5 min-h-[42px] py-1.5 cursor-text" onClick={() => document.getElementById(id)?.focus()}>
      {values.map((v) => {
        const bad = validate && !validate(v);
        return (
          <span key={v} className={`badge ring-1 gap-1 ${bad ? 'bg-red-500/10 text-red-700 ring-red-500/25' : 'bg-primary-500/10 text-primary-700 ring-primary-500/20'}`}>
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X className="w-3 h-3" /></button>
          </span>
        );
      })}
      <input
        id={id}
        className="flex-1 min-w-[140px] bg-transparent outline-none text-sm"
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

  const [form, setForm] = useState<AssessmentInput>(EMPTY_FORM);
  const [bank, setBank] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepKey>('details');
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
  const stepErrors = (k: StepKey) => errors.filter((i) => i.step === k);
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
      setServerError(apiError(err, 'Failed to save assessment'));
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
      setServerError(apiError(err, 'Failed to update status'));
    } finally {
      setSaving(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  if (loading) {
    return (
      <AdminLayout title={editId ? 'Edit Assessment' : 'Create Assessment'} maxWidth="max-w-6xl">
        <Spinner label="Loading..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={editId ? 'Edit Assessment' : 'Create Assessment'}
      subtitle={
        savedId ? (
          <span className="flex items-center gap-2">
            Currently <AvailabilityBadge value={savedStatus === 'published' ? 'open' : savedStatus} />
            {dirtySinceSave && <span className="text-amber-700 text-xs">· unsaved changes</span>}
          </span>
        ) : (
          'Basic details → questions → configuration → review → generate → publish'
        )
      }
      maxWidth="max-w-6xl"
      actions={
        <>
          <Link to="/admin/assessments" className="btn-ghost text-sm">Close</Link>
          <button onClick={saveDraftNow} disabled={saving} className="btn-outline text-sm">
            <Save className="w-4 h-4" /> {savedStatus === 'published' ? 'Save changes' : 'Save draft'}
          </button>
        </>
      }
    >
      {candidateCount > 0 && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/25 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <p>
            {candidateCount} candidate{candidateCount === 1 ? ' has' : 's have'} already taken this assessment. Changing
            questions or marks will change how their existing results are scored.
          </p>
        </div>
      )}
      {serverError && <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">{serverError}</div>}

      {/* Stepper */}
      <ol className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const hasError = stepErrors(s.key).length > 0 && (s.key !== 'questions' || form.questions.length > 0 || triedPublish);
          const active = s.key === step;
          const done = i < stepIndex;
          const Icon = s.icon;
          return (
            <li key={s.key}>
              <button
                onClick={() => setStep(s.key)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
                  active ? 'border-primary-500 bg-primary-600/15 text-white' : 'border-surface-800 bg-surface-900 text-surface-400 hover:text-white'
                }`}
              >
                <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center ${
                  hasError ? 'bg-red-500 text-on-accent' : active ? 'bg-primary-500 text-on-accent' : done ? 'bg-emerald-500 text-on-accent' : 'bg-surface-700 text-surface-300'
                }`}>
                  {hasError ? '!' : done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                <Icon className="w-4 h-4 hidden sm:block" />
                {s.label}
                {s.key === 'questions' && form.questions.length > 0 && <span className="text-xs text-surface-500">({form.questions.length})</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {['details', 'questions', 'config'].includes(step) && stepErrors(step).length > 0 && (step !== 'questions' || form.questions.length > 0 || triedPublish) ? (
        <ul className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700 list-disc list-inside">
          {stepErrors(step).map((e) => <li key={e.text}>{e.text}</li>)}
        </ul>
      ) : null}

      {/* ── Step 1: Basic details ── */}
      {step === 'details' && (
        <div className="grid lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="card space-y-5 lg:col-span-2">
            <div>
              <label className="label" htmlFor="a-name">Assessment name *</label>
              <input id="a-name" className="input" placeholder="e.g. Campus Hiring 2026 — Round 1" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="a-desc">Description</label>
              <textarea id="a-desc" className="input min-h-[80px]" placeholder="Shown to candidates on their dashboard" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="a-instr">Instructions <span className="text-surface-500 font-normal">(Markdown)</span></label>
              <textarea id="a-instr" className="input min-h-[120px] font-mono text-xs" value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
              <p className="text-xs text-surface-500 mt-1">Shown on the start screen before the timer begins.</p>
            </div>
          </div>
          <div className="card space-y-5">
            <div>
              <span className="label">Question types *</span>
              <div className="space-y-2">
                {([['coding', 'Coding', 'Programs graded by test cases', Code2], ['mcq', 'Multiple choice', 'Auto-graded answer options', ListChecks]] as const).map(([k, l, hint, Icon]) => {
                  const on = form.questionTypes.includes(k);
                  return (
                    <button key={k} type="button" onClick={() => toggleType(k)} className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left ${on ? 'border-primary-500 bg-primary-500/10' : 'border-surface-700 hover:border-surface-500'}`}>
                      <Icon className={`w-5 h-5 mt-0.5 ${on ? 'text-primary-600' : 'text-surface-500'}`} />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-white">{l}</span>
                        <span className="block text-xs text-surface-500">{hint}</span>
                      </span>
                      {on && <Check className="w-4 h-4 text-primary-600" />}
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
              <p className="text-xs text-surface-500 mt-1">Matching questions are shown first in the next step.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Select questions ── */}
      {step === 'questions' && (
        <div className="grid lg:grid-cols-2 gap-6 animate-fade-in">
          <div className="card p-0 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-surface-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">Question bank</h2>
                <div className="flex items-center gap-3">
                  <Link to="/admin/questions/ai" className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Generate with AI</Link>
                  <Link to="/admin/questions/new" className="text-xs text-primary-600 hover:text-primary-700">+ New question</Link>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input className="input pl-9 py-1.5 text-sm" placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select className="input py-1.5 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
                  <option value="">All levels</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
                <select className="input py-1.5 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
                  <option value="">All types</option>
                  {form.questionTypes.includes('coding') && <option value="coding">Coding</option>}
                  {form.questionTypes.includes('mcq') && <option value="mcq">MCQ</option>}
                </select>
                <select className="input py-1.5 text-sm" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} aria-label="Topic">
                  <option value="">All topics</option>
                  {allTopics.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <ul className="divide-y divide-surface-800/60 overflow-y-auto max-h-[480px]">
              {sortedAvailable.map((q) => {
                const topicMatch = form.topics.some((t) => matchesTopic(q, t));
                return (
                  <li key={q.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-800/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-100 truncate">{q.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700">{q.type === 'mcq' ? 'MCQ' : 'Coding'}</span>
                        <span className={`badge-${q.difficulty}`}>{q.difficulty}</span>
                        {topicMatch && <span className="badge bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/20">topic match</span>}
                        {parseJsonArray(q.tags).filter((t) => t !== 'ai-generated').slice(0, 2).map((t) => <span key={t} className="text-[11px] text-surface-500">#{t}</span>)}
                        {q.type === 'coding' && <span className={`text-[11px] ${q._count?.testCases ? 'text-surface-600' : 'text-red-600'}`}>· {q._count?.testCases ?? 0} tests</span>}
                      </div>
                    </div>
                    <button onClick={() => addQuestion(q)} className="btn-outline text-xs px-2.5 py-1"><Plus className="w-3.5 h-3.5" /> Add</button>
                  </li>
                );
              })}
              {sortedAvailable.length === 0 && (
                <li className="text-sm text-surface-500 text-center py-10 px-6">
                  {bank.length === 0 ? 'The question bank is empty.' : 'No matching questions. Change the filters, or generate new ones with AI.'}
                </li>
              )}
            </ul>
          </div>

          <div className="card p-0 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-surface-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Selected questions ({form.questions.length})</h2>
              <span className="text-sm text-surface-400">Total <span className="text-white font-semibold tabular-nums">{totalMarks}</span> marks</span>
            </div>
            {selectedQuestions.length === 0 ? (
              <p className="text-sm text-surface-500 text-center py-16 px-6">Add questions from the bank. Default marks: easy 10, medium 20, hard 30. You can change them.</p>
            ) : (
              <ol className="divide-y divide-surface-800/60 overflow-y-auto max-h-[540px]">
                {selectedQuestions.map((sq, idx) => (
                  <li key={sq.questionId} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-6 h-6 rounded-md bg-surface-800 text-xs text-surface-300 flex items-center justify-center shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-100 truncate">{sq.question?.title ?? `Question #${sq.questionId}`}</p>
                      {sq.question && (
                        <div className="flex gap-1.5 mt-1">
                          <span className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700">{sq.question.type === 'mcq' ? 'MCQ' : 'Coding'}</span>
                          <span className={`badge-${sq.question.difficulty}`}>{sq.question.difficulty}</span>
                        </div>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-surface-400">
                      <input type="number" min={1} max={1000} className="input w-16 py-1 px-2 text-sm text-right" value={Number.isNaN(sq.marks) ? '' : sq.marks} onChange={(e) => setMarks(sq.questionId, parseInt(e.target.value))} aria-label={`Marks for ${sq.question?.title}`} />
                      marks
                    </label>
                    <div className="flex flex-col">
                      <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} className="btn-ghost p-0.5" title="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveQuestion(idx, 1)} disabled={idx === selectedQuestions.length - 1} className="btn-ghost p-0.5" title="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <button onClick={() => removeQuestion(sq.questionId)} className="btn-ghost p-1.5 text-red-600 hover:bg-red-500/10" title="Remove"><X className="w-4 h-4" /></button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: Configure ── */}
      {step === 'config' && (
        <div className="grid lg:grid-cols-2 gap-6 animate-fade-in">
          <div className="space-y-6">
            <div className="card space-y-5">
              <h2 className="text-sm font-semibold text-white">Timing, questions &amp; scoring</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label flex items-center gap-1.5" htmlFor="a-time"><Clock className="w-3.5 h-3.5" /> Duration (minutes)</label>
                  <input id="a-time" type="number" min={1} max={600} className="input" value={Number.isNaN(form.timeLimitMinutes) ? '' : form.timeLimitMinutes} onChange={(e) => set('timeLimitMinutes', parseInt(e.target.value))} />
                </div>
                <div>
                  <label className="label flex items-center gap-1.5" htmlFor="a-pass"><Target className="w-3.5 h-3.5" /> Passing score (%)</label>
                  <input id="a-pass" type="number" min={0} max={100} className="input" value={Number.isNaN(form.passingScore) ? '' : form.passingScore} onChange={(e) => set('passingScore', parseInt(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="a-count">Questions per candidate</label>
                <div className="flex items-center gap-3">
                  <input
                    id="a-count"
                    type="number"
                    min={1}
                    max={form.questions.length || 1}
                    className="input w-28"
                    placeholder={String(form.questions.length || 'All')}
                    value={form.questionCount ?? ''}
                    onChange={(e) => set('questionCount', e.target.value ? parseInt(e.target.value) : null)}
                  />
                  <span className="text-xs text-surface-500">
                    of {form.questions.length} selected.{' '}
                    {form.questionCount && form.questionCount < form.questions.length
                      ? `Each candidate gets a random ${form.questionCount}.`
                      : 'Leave empty for everyone to get all questions.'}
                  </span>
                </div>
              </div>
              <div>
                <label className="label flex items-center gap-1.5" htmlFor="a-attempts"><Repeat className="w-3.5 h-3.5" /> Attempts allowed</label>
                <div className="flex items-center gap-3">
                  <input id="a-attempts" type="number" min={1} max={10} className="input w-28" value={Number.isNaN(form.maxAttempts) ? '' : form.maxAttempts} onChange={(e) => set('maxAttempts', parseInt(e.target.value))} />
                  <span className="text-xs text-surface-500">{form.maxAttempts > 1 ? 'The latest attempt counts; earlier scores are kept in the report.' : 'One attempt per candidate.'}</span>
                </div>
              </div>
            </div>

            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Validity window</h3>
              <p className="text-xs text-surface-500 -mt-2">Leave empty to allow starting any time. Candidates already mid-test can always finish.</p>
              <div className="grid grid-cols-2 gap-4">
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

          <div className="space-y-6">
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-1.5"><Users className="w-4 h-4" /> Who can take it</h2>
              <div className="space-y-2">
                {([
                  ['anyone', 'Any signed-in candidate', 'Everyone with an account, plus anyone you send a share link to.', Globe],
                  ['restricted', 'Only specific emails or domains', 'Candidates must match the allow-list below, including link joiners.', Mail],
                  ['invite_only', 'Only people with a share link', 'Hidden from other candidates; share links are the only way in.', Link2],
                ] as const).map(([k, l, hint, Icon]) => (
                  <label key={k} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${form.accessMode === k ? 'border-primary-500 bg-primary-500/10' : 'border-surface-700 hover:border-surface-500'}`}>
                    <input type="radio" name="access" className="mt-1" checked={form.accessMode === k} onChange={() => set('accessMode', k as AccessMode)} />
                    <Icon className={`w-4 h-4 mt-0.5 ${form.accessMode === k ? 'text-primary-600' : 'text-surface-500'}`} />
                    <span>
                      <span className="block text-sm font-medium text-white">{l}</span>
                      <span className="block text-xs text-surface-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {form.accessMode === 'restricted' && (
                <div>
                  <label className="label" htmlFor="a-emails">Allowed emails / domains</label>
                  <ChipInput id="a-emails" values={form.allowedEmails} onChange={(v) => set('allowedEmails', v.map((x) => x.toLowerCase()))} placeholder="jane@acme.com, @university.edu" validate={(v) => EMAIL_OR_DOMAIN.test(v)} />
                  <p className="text-xs text-surface-500 mt-1">Use <code>@domain.com</code> to allow a whole organisation.</p>
                </div>
              )}
            </div>

            <div className="card space-y-4">
              <h2 className="text-sm font-semibold text-white">Randomization &amp; experience</h2>
              <Toggle icon={Shuffle} label="Shuffle question order" hint="Each candidate gets a different (but stable) order." checked={form.shuffleQuestions} onChange={(v) => set('shuffleQuestions', v)} />
              {hasMcq && <Toggle icon={Shuffle} label="Shuffle answer options" hint="Multiple-choice options appear in a different order for each candidate." checked={form.shuffleOptions} onChange={(v) => set('shuffleOptions', v)} />}
              <Toggle icon={BarChart3} label="Show results to candidates" hint="If off, candidates only see a confirmation after submitting." checked={form.showResults} onChange={(v) => set('showResults', v)} />
              {hasCoding && (
                <div className="p-4 rounded-lg bg-surface-800/50 border border-surface-700">
                  <p className="text-sm font-medium text-surface-100 flex items-center gap-2"><Code2 className="w-5 h-5 text-primary-600" /> Allowed languages</p>
                  <p className="text-xs text-surface-500 mt-0.5 mb-3">None selected = all languages allowed.</p>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((l) => {
                      const on = form.allowedLanguages.includes(l.id);
                      return (
                        <button key={l.id} type="button" onClick={() => toggleLanguage(l.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${on ? 'border-primary-500 bg-primary-600/15 text-white' : 'border-surface-700 text-surface-400 hover:text-white'}`}>
                          {on && <Check className="w-3.5 h-3.5" />} {l.name}
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
        <div className="grid lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="card lg:col-span-2 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white">{form.name || <span className="text-surface-500">Untitled assessment</span>}</h2>
              {form.description && <p className="text-sm text-surface-400 mt-1">{form.description}</p>}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.questionTypes.map((t) => <span key={t} className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700">{t === 'mcq' ? 'Multiple choice' : 'Coding'}</span>)}
                <span className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700 capitalize">{form.difficulty} difficulty</span>
                {form.topics.map((t) => <span key={t} className="badge bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/20">{t}</span>)}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-surface-500 uppercase tracking-wider border-b border-surface-800">
                  <th className="text-left font-medium py-2">#</th>
                  <th className="text-left font-medium py-2">Question</th>
                  <th className="text-left font-medium py-2">Type</th>
                  <th className="text-left font-medium py-2">Difficulty</th>
                  <th className="text-right font-medium py-2">Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/60">
                {selectedQuestions.map((sq, i) => (
                  <tr key={sq.questionId}>
                    <td className="py-2 text-surface-500">{i + 1}</td>
                    <td className="py-2 text-surface-100">{sq.question?.title}</td>
                    <td className="py-2 text-surface-400">{sq.question?.type === 'mcq' ? 'MCQ' : 'Coding'}</td>
                    <td className="py-2">{sq.question && <span className={`badge-${sq.question.difficulty}`}>{sq.question.difficulty}</span>}</td>
                    <td className="py-2 text-right tabular-nums text-surface-200">{sq.marks}</td>
                  </tr>
                ))}
                {selectedQuestions.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-surface-500">No questions selected</td></tr>}
              </tbody>
              <tfoot>
                <tr className="border-t border-surface-700">
                  <td colSpan={4} className="py-2 text-right text-surface-400">Total{form.questionCount && form.questionCount < form.questions.length ? ` (each candidate answers ${form.questionCount})` : ''}</td>
                  <td className="py-2 text-right font-semibold text-white tabular-nums">{totalMarks}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="space-y-6">
            <div className="card space-y-3 text-sm">
              <h3 className="font-semibold text-white">Configuration</h3>
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
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-surface-500">{k}</span>
                  <span className="text-surface-200 text-right">{v}</span>
                </div>
              ))}
            </div>
            <ReadinessList issues={issues} onGo={setStep} />
          </div>
        </div>
      )}

      {/* ── Step 5: Generate ── */}
      {step === 'generate' && (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
          <div className="card text-center py-10">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${savedId && !dirtySinceSave ? 'bg-emerald-500/10 text-emerald-600' : 'bg-primary-500/10 text-primary-600'}`}>
              {savedId && !dirtySinceSave ? <CheckCircle className="w-7 h-7" /> : <Wand2 className="w-7 h-7" />}
            </div>
            {savedId && !dirtySinceSave ? (
              <>
                <h2 className="text-lg font-semibold text-white">Assessment generated</h2>
                <p className="text-sm text-surface-500 mt-1">Saved as {savedStatus === 'published' ? 'a live assessment' : 'a draft'} with {form.questions.length} question{form.questions.length === 1 ? '' : 's'} ({totalMarks} marks).</p>
                <button onClick={() => setStep('publish')} className="btn-primary mt-5">Continue to publish <Rocket className="w-4 h-4" /></button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-white">{savedId ? 'Save your changes' : 'Generate the assessment'}</h2>
                <p className="text-sm text-surface-500 mt-1 max-w-md mx-auto">
                  This saves the assessment with its questions and settings{savedStatus === 'published' ? '. It stays live.' : ' as a draft. Candidates can’t see it until you publish.'}
                </p>
                <button onClick={async () => { if (await generate()) setStep('publish'); }} disabled={saving || draftErrors.length > 0} className="btn-primary mt-5">
                  <Wand2 className="w-4 h-4" /> {saving ? 'Generating...' : savedId ? 'Save changes' : 'Generate assessment'}
                </button>
              </>
            )}
          </div>
          <ReadinessList issues={issues} onGo={setStep} />
        </div>
      )}

      {/* ── Step 6: Publish ── */}
      {step === 'publish' && (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
          {!savedId ? (
            <div className="card text-center py-10">
              <p className="text-sm text-surface-400">Generate the assessment first.</p>
              <button onClick={() => setStep('generate')} className="btn-primary mt-4"><Wand2 className="w-4 h-4" /> Go to Generate</button>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider">Status</p>
                    <p className="text-lg font-semibold text-white mt-0.5 flex items-center gap-2">
                      {savedStatus === 'published' ? <><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse-dot" /> Published</> : <><Lock className="w-4 h-4 text-surface-500" /> Draft</>}
                    </p>
                    <p className="text-xs text-surface-500 mt-1">
                      {savedStatus === 'published'
                        ? form.startAt && new Date(form.startAt) > new Date() ? `Visible to candidates; opens ${formatDate(form.startAt)}.` : 'Candidates can start now.'
                        : 'Hidden from candidates.'}
                    </p>
                  </div>
                  {savedStatus === 'published' ? (
                    <button onClick={() => setPublished(false)} disabled={saving} className="btn-outline text-sm">Unpublish</button>
                  ) : (
                    <button onClick={() => setPublished(true)} disabled={saving} className="btn-primary"><Rocket className="w-4 h-4" /> {saving ? 'Publishing...' : 'Publish now'}</button>
                  )}
                </div>
                {dirtySinceSave && <p className="text-xs text-amber-700 mt-3">You have unsaved changes; publishing saves them first.</p>}
              </div>
              {triedPublish && issues.some((i) => i.level === 'error') && <ReadinessList issues={issues} onGo={setStep} />}
              <div className="card flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white flex items-center gap-2"><Link2 className="w-4 h-4 text-primary-600" /> Invite candidates</p>
                  <p className="text-xs text-surface-500 mt-0.5">{form.accessMode === 'invite_only' ? 'This assessment is only reachable through share links.' : 'Create a link anyone can use to take this test.'}</p>
                </div>
                <button onClick={() => setShareOpen(true)} className="btn-outline text-sm"><Link2 className="w-4 h-4" /> Share link</button>
              </div>
              <div className="flex justify-end gap-2">
                <Link to={`/admin/submissions/${savedId}`} className="btn-ghost text-sm">View results</Link>
                <Link to="/admin/assessments" className="btn-primary text-sm">Done</Link>
              </div>
            </>
          )}
        </div>
      )}

      {shareOpen && savedId && (
        <ShareLinksModal assessment={{ id: savedId, name: form.name, status: savedStatus }} onClose={() => setShareOpen(false)} />
      )}

      {/* Step navigation */}
      <div className="flex justify-between mt-6">
        <button onClick={() => setStep(STEPS[stepIndex - 1].key)} disabled={stepIndex === 0} className="btn-ghost text-sm">← Back</button>
        {stepIndex < STEPS.length - 1 && !(step === 'generate' && (!savedId || dirtySinceSave)) && (
          <button onClick={() => setStep(STEPS[stepIndex + 1].key)} className="btn-outline text-sm">Next: {STEPS[stepIndex + 1].label} →</button>
        )}
      </div>
    </AdminLayout>
  );
}

function ReadinessList({ issues, onGo }: { issues: Issue[]; onGo: (s: StepKey) => void }) {
  const errs = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-white mb-3">Readiness check</h3>
      {issues.length === 0 ? (
        <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Everything looks good.</p>
      ) : (
        <ul className="space-y-2">
          {[...errs, ...warns].map((i) => (
            <li key={i.text} className="flex items-start gap-2 text-sm">
              {i.level === 'error' ? <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
              <span className="flex-1 text-surface-300">{i.text}</span>
              <button onClick={() => onGo(i.step)} className="text-xs text-primary-600 hover:text-primary-700 shrink-0">Fix</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
