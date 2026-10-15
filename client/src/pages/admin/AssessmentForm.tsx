import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { Spinner, AvailabilityBadge, parseJsonArray, toLocalInputValue, formatDate } from '../../components/ui';
import { getAssessment, getQuestions, createAssessment, updateAssessment, apiError } from '../../services/api';
import type { AssessmentInput, AssessmentStatus, Question } from '../../types';
import {
  FileText, ListChecks, Settings2, Eye, Search, Plus, X, ArrowUp, ArrowDown,
  Save, Rocket, AlertTriangle, Clock, Target, Calendar, Shuffle, Code2, BarChart3, Check,
} from 'lucide-react';

import { useLanguages } from '../../hooks/useLanguages';
import LanguageLogo from '../../components/LanguageLogo';

const DEFAULT_MARKS: Record<string, number> = { easy: 10, medium: 20, hard: 30 };

const STEPS = [
  { key: 'details', label: 'Details', icon: FileText },
  { key: 'questions', label: 'Questions', icon: ListChecks },
  { key: 'config', label: 'Configuration', icon: Settings2 },
  { key: 'review', label: 'Review', icon: Eye },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const EMPTY_FORM: AssessmentInput = {
  name: '',
  description: '',
  instructions: `- Read every question carefully before you start coding.
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
  questions: [],
};

function validate(form: AssessmentInput, publishing: boolean): Partial<Record<StepKey, string[]>> {
  const errors: Partial<Record<StepKey, string[]>> = {};
  const add = (step: StepKey, msg: string) => (errors[step] = [...(errors[step] || []), msg]);

  if (!form.name.trim()) add('details', 'Give the assessment a name.');
  if (publishing && form.questions.length === 0) add('questions', 'Add at least one question before publishing.');
  if (form.questions.some((q) => !Number.isInteger(q.marks) || q.marks < 1 || q.marks > 1000)) {
    add('questions', 'Marks must be whole numbers between 1 and 1000.');
  }
  if (!Number.isInteger(form.timeLimitMinutes) || form.timeLimitMinutes < 1 || form.timeLimitMinutes > 600) {
    add('config', 'Time limit must be between 1 and 600 minutes.');
  }
  if (!Number.isFinite(form.passingScore) || form.passingScore < 0 || form.passingScore > 100) {
    add('config', 'Passing score must be between 0 and 100%.');
  }
  if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) {
    add('config', 'The closing time must be after the opening time.');
  }
  if (publishing && form.endAt && new Date(form.endAt) < new Date()) {
    add('config', 'The closing time is in the past — candidates would not be able to start.');
  }
  return errors;
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

export default function AssessmentForm() {
  const { id } = useParams();
  const editId = id ? parseInt(id) : null;
  const navigate = useNavigate();

  const [form, setForm] = useState<AssessmentInput>(EMPTY_FORM);
  const [bank, setBank] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepKey>('details');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  // Validation errors are shown only after a save attempt, for the status being saved
  const [attempted, setAttempted] = useState<AssessmentStatus | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);
  const [originalStatus, setOriginalStatus] = useState<AssessmentStatus>('draft');

  const { languages: allJudgeLanguages } = useLanguages();

  // Question picker filters
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [tag, setTag] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const questions = await getQuestions();
        setBank(questions);
        if (editId) {
          const a = await getAssessment(editId);
          setOriginalStatus(a.status);
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

  const set = <K extends keyof AssessmentInput>(key: K, value: AssessmentInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const allTags = useMemo(
    () => Array.from(new Set(bank.flatMap((q) => parseJsonArray(q.tags)))).sort(),
    [bank]
  );
  const selectedIds = new Set(form.questions.map((q) => q.questionId));
  const available = bank.filter(
    (q) =>
      !selectedIds.has(q.id) &&
      (!search || q.title.toLowerCase().includes(search.toLowerCase())) &&
      (!difficulty || q.difficulty === difficulty) &&
      (!tag || parseJsonArray(q.tags).includes(tag))
  );
  const totalMarks = form.questions.reduce((a, q) => a + (q.marks || 0), 0);
  const selectedQuestions = form.questions.map((q) => ({ ...q, question: byId.get(q.questionId) }));

  function addQuestion(q: Question) {
    set('questions', [...form.questions, { questionId: q.id, marks: DEFAULT_MARKS[q.difficulty] ?? 10 }]);
  }
  function removeQuestion(qid: number) {
    set('questions', form.questions.filter((q) => q.questionId !== qid));
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

  async function save(status: AssessmentStatus) {
    const payload = { ...form, status };
    const errors = validate(payload, status === 'published');
    const firstBadStep = STEPS.find((s) => errors[s.key]?.length);
    setAttempted(status);
    if (firstBadStep) {
      setStep(firstBadStep.key);
      return;
    }
    setSaving(true);
    setServerError('');
    try {
      if (editId) await updateAssessment(editId, payload);
      else await createAssessment(payload);
      navigate('/admin/assessments');
    } catch (err) {
      setServerError(apiError(err, 'Failed to save assessment'));
    } finally {
      setSaving(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const errors = attempted ? validate(form, attempted === 'published') : {};

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
        editId ? (
          <span className="flex items-center gap-2">
            Currently <AvailabilityBadge value={originalStatus === 'published' ? 'open' : originalStatus} />
          </span>
        ) : (
          'Set up the test, pick questions, and configure how candidates take it'
        )
      }
      maxWidth="max-w-6xl"
      actions={
        <>
          <Link to="/admin/assessments" className="btn-ghost text-sm">Cancel</Link>
          <button onClick={() => save('draft')} disabled={saving} className="btn-outline text-sm">
            <Save className="w-4 h-4" /> {originalStatus === 'published' && editId ? 'Save & unpublish' : 'Save draft'}
          </button>
          <button onClick={() => save('published')} disabled={saving} className="btn-primary text-sm">
            <Rocket className="w-4 h-4" /> {saving ? 'Saving...' : editId && originalStatus === 'published' ? 'Save changes' : 'Publish'}
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
      {serverError && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">{serverError}</div>
      )}

      {/* Stepper */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {STEPS.map((s, i) => {
          const hasError = !!errors[s.key]?.length;
          const active = s.key === step;
          return (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'border-primary-500 bg-primary-600/15 text-white'
                  : 'border-surface-800 bg-surface-900 text-surface-400 hover:text-white'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full text-xs flex items-center justify-center ${
                  hasError ? 'bg-red-500 text-on-accent' : active ? 'bg-primary-500 text-on-accent' : 'bg-surface-700 text-surface-300'
                }`}
              >
                {hasError ? '!' : i + 1}
              </span>
              {s.label}
              {s.key === 'questions' && form.questions.length > 0 && (
                <span className="text-xs text-surface-500">({form.questions.length})</span>
              )}
            </button>
          );
        })}
      </div>

      {errors[step]?.length ? (
        <ul className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700 list-disc list-inside">
          {errors[step]!.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}

      {/* ── Step 1: Details ── */}
      {step === 'details' && (
        <div className="card space-y-5 animate-fade-in">
          <div>
            <label className="label" htmlFor="a-name">Assessment name *</label>
            <input
              id="a-name"
              className="input"
              placeholder="e.g. Campus Hiring 2026 — Round 1"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="a-desc">Description</label>
            <textarea
              id="a-desc"
              className="input min-h-[80px]"
              placeholder="Shown to candidates on the assessment list"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="a-instr">Instructions <span className="text-surface-500 font-normal">(Markdown)</span></label>
            <textarea
              id="a-instr"
              className="input min-h-[140px] font-mono text-xs"
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
            />
            <p className="text-xs text-surface-500 mt-1">Shown on the start screen before the timer begins.</p>
          </div>
        </div>
      )}

      {/* ── Step 2: Questions ── */}
      {step === 'questions' && (
        <div className="grid lg:grid-cols-2 gap-6 animate-fade-in">
          {/* Question bank */}
          <div className="card p-0 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-surface-800 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Question bank</h2>
                <Link to="/admin/questions/new" className="text-xs text-primary-600 hover:text-primary-700">+ New question</Link>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input className="input pl-9 py-1.5 text-sm" placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <select className="input py-1.5 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="">All difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <select className="input py-1.5 text-sm" value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">All topics</option>
                  {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <ul className="divide-y divide-surface-800/60 overflow-y-auto max-h-[480px]">
              {available.map((q) => (
                <li key={q.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-800/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-100 truncate">{q.title}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`badge-${q.difficulty}`}>{q.difficulty}</span>
                      {parseJsonArray(q.tags).slice(0, 3).map((t) => (
                        <span key={t} className="text-[11px] text-surface-500">#{t}</span>
                      ))}
                      <span className="text-[11px] text-surface-600">· {q._count?.testCases ?? 0} tests</span>
                    </div>
                  </div>
                  <button onClick={() => addQuestion(q)} className="btn-outline text-xs px-2.5 py-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </li>
              ))}
              {available.length === 0 && (
                <li className="text-sm text-surface-500 text-center py-10">
                  {bank.length === 0 ? 'The question bank is empty.' : 'No matching questions.'}
                </li>
              )}
            </ul>
          </div>

          {/* Selected */}
          <div className="card p-0 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-surface-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Selected questions ({form.questions.length})</h2>
              <span className="text-sm text-surface-400">Total <span className="text-white font-semibold tabular-nums">{totalMarks}</span> marks</span>
            </div>
            {selectedQuestions.length === 0 ? (
              <p className="text-sm text-surface-500 text-center py-16 px-6">
                Add questions from the bank. Default marks: easy 10, medium 20, hard 30. You can change them.
              </p>
            ) : (
              <ol className="divide-y divide-surface-800/60 overflow-y-auto max-h-[540px]">
                {selectedQuestions.map((sq, idx) => (
                  <li key={sq.questionId} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-6 h-6 rounded-md bg-surface-800 text-xs text-surface-300 flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-100 truncate">{sq.question?.title ?? `Question #${sq.questionId}`}</p>
                      {sq.question && <span className={`badge-${sq.question.difficulty} mt-1`}>{sq.question.difficulty}</span>}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-surface-400">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        className="input w-16 py-1 px-2 text-sm text-right"
                        value={Number.isNaN(sq.marks) ? '' : sq.marks}
                        onChange={(e) => setMarks(sq.questionId, parseInt(e.target.value))}
                        aria-label={`Marks for ${sq.question?.title}`}
                      />
                      marks
                    </label>
                    <div className="flex flex-col">
                      <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} className="btn-ghost p-0.5" title="Move up">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moveQuestion(idx, 1)} disabled={idx === selectedQuestions.length - 1} className="btn-ghost p-0.5" title="Move down">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button onClick={() => removeQuestion(sq.questionId)} className="btn-ghost p-1.5 text-red-600 hover:bg-red-500/10" title="Remove">
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: Configuration ── */}
      {step === 'config' && (
        <div className="grid lg:grid-cols-2 gap-6 animate-fade-in">
          <div className="card space-y-5">
            <h2 className="text-sm font-semibold text-white">Timing & scoring</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label flex items-center gap-1.5" htmlFor="a-time"><Clock className="w-3.5 h-3.5" /> Duration (minutes)</label>
                <input
                  id="a-time"
                  type="number"
                  min={1}
                  max={600}
                  className="input"
                  value={Number.isNaN(form.timeLimitMinutes) ? '' : form.timeLimitMinutes}
                  onChange={(e) => set('timeLimitMinutes', parseInt(e.target.value))}
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5" htmlFor="a-pass"><Target className="w-3.5 h-3.5" /> Passing score (%)</label>
                <input
                  id="a-pass"
                  type="number"
                  min={0}
                  max={100}
                  className="input"
                  value={Number.isNaN(form.passingScore) ? '' : form.passingScore}
                  onChange={(e) => set('passingScore', parseInt(e.target.value))}
                />
              </div>
            </div>
            <p className="text-xs text-surface-500 -mt-2">
              {totalMarks > 0 && Number.isFinite(form.passingScore)
                ? `Candidates need ${Math.ceil((form.passingScore / 100) * totalMarks)} of ${totalMarks} marks to pass.`
                : 'Score is the percentage of total marks earned across all test cases.'}
            </p>

            <div className="pt-2 border-t border-surface-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5 mb-1"><Calendar className="w-4 h-4" /> Availability window</h3>
              <p className="text-xs text-surface-500 mb-3">Leave empty to allow candidates to start any time. Candidates already mid-test can always finish.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="a-start">Opens</label>
                  <input
                    id="a-start"
                    type="datetime-local"
                    className="input"
                    value={toLocalInputValue(form.startAt)}
                    onChange={(e) => set('startAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="a-end">Closes</label>
                  <input
                    id="a-end"
                    type="datetime-local"
                    className="input"
                    value={toLocalInputValue(form.endAt)}
                    onChange={(e) => set('endAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-white">Candidate experience</h2>
            <Toggle
              icon={Shuffle}
              label="Shuffle question order"
              hint="Each candidate gets a different (but stable) question order."
              checked={form.shuffleQuestions}
              onChange={(v) => set('shuffleQuestions', v)}
            />
            <Toggle
              icon={BarChart3}
              label="Show results to candidates"
              hint="If off, candidates only see a confirmation after submitting; you still see the full evaluation."
              checked={form.showResults}
              onChange={(v) => set('showResults', v)}
            />
            <div className="p-4 rounded-lg bg-surface-800/50 border border-surface-700 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-surface-100 flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-primary-600" /> Allowed languages
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {form.allowedLanguages.length === 0
                      ? 'None selected = all 4 languages allowed.'
                      : `${form.allowedLanguages.length} of ${allJudgeLanguages.length} languages permitted.`}
                  </p>
                </div>
                {form.allowedLanguages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => set('allowedLanguages', [])}
                    className="text-xs text-primary-500 hover:text-primary-400 font-medium"
                  >
                    Clear (Allow All)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {allJudgeLanguages.map((l) => {
                  const on = form.allowedLanguages.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLanguage(l.id)}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
                        on
                          ? 'border-primary-500 bg-primary-600/15 text-white font-medium ring-1 ring-primary-500/30'
                          : 'border-surface-700 bg-surface-900/60 text-surface-300 hover:border-surface-600 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <LanguageLogo languageId={l.id} name={l.name} className="w-4 h-4 shrink-0" />
                        <span>{l.name}</span>
                      </div>
                      {on && <Check className="w-3.5 h-3.5 text-primary-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
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
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-surface-500 uppercase tracking-wider border-b border-surface-800">
                  <th className="text-left font-medium py-2">#</th>
                  <th className="text-left font-medium py-2">Question</th>
                  <th className="text-left font-medium py-2">Difficulty</th>
                  <th className="text-right font-medium py-2">Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/60">
                {selectedQuestions.map((sq, i) => (
                  <tr key={sq.questionId}>
                    <td className="py-2 text-surface-500">{i + 1}</td>
                    <td className="py-2 text-surface-100">{sq.question?.title}</td>
                    <td className="py-2">{sq.question && <span className={`badge-${sq.question.difficulty}`}>{sq.question.difficulty}</span>}</td>
                    <td className="py-2 text-right tabular-nums text-surface-200">{sq.marks}</td>
                  </tr>
                ))}
                {selectedQuestions.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-surface-500">No questions selected</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-surface-700">
                  <td colSpan={3} className="py-2 text-right text-surface-400">Total</td>
                  <td className="py-2 text-right font-semibold text-white tabular-nums">{totalMarks}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="card space-y-3 text-sm">
            <h3 className="font-semibold text-white">Configuration</h3>
            {[
              ['Duration', `${form.timeLimitMinutes} minutes`],
              ['Passing score', `${form.passingScore}%`],
              ['Opens', form.startAt ? formatDate(form.startAt) : 'Immediately'],
              ['Closes', form.endAt ? formatDate(form.endAt) : 'No deadline'],
              ['Question order', form.shuffleQuestions ? 'Shuffled per candidate' : 'Fixed'],
              ['Languages', form.allowedLanguages.length ? allJudgeLanguages.filter((l) => form.allowedLanguages.includes(l.id)).map((l) => l.name).join(', ') : 'All supported languages'],
              ['Results to candidate', form.showResults ? 'Shown' : 'Hidden'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <span className="text-surface-500">{k}</span>
                <span className="text-surface-200 text-right">{v}</span>
              </div>
            ))}
            <p className="text-xs text-surface-500 pt-3 border-t border-surface-800">
              <strong className="text-surface-300">Publish</strong> makes it visible to candidates. <strong className="text-surface-300">Save draft</strong> keeps it hidden.
            </p>
          </div>
        </div>
      )}

      {/* Step navigation */}
      <div className="flex justify-between mt-6">
        <button onClick={() => setStep(STEPS[stepIndex - 1].key)} disabled={stepIndex === 0} className="btn-ghost text-sm">
          ← Back
        </button>
        {stepIndex < STEPS.length - 1 && (
          <button onClick={() => setStep(STEPS[stepIndex + 1].key)} className="btn-outline text-sm">
            Next: {STEPS[stepIndex + 1].label} →
          </button>
        )}
      </div>
    </AdminLayout>
  );
}
