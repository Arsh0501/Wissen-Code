import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import CodeEditor from '../editor/CodeEditor';
import ReferenceReview from './ReferenceReview';
import WizardSection from './WizardSection';
import DraftSolutionTester from './DraftSolutionTester';
import {
  apiData,
  workflowKeys,
  type QuestionDraft,
  type QuestionContent,
} from '../../services/workflows';
import { apiError } from '../../services/api';

const languages = [
  { id: 71, name: 'Python', editor: 'python' },
  { id: 63, name: 'JavaScript', editor: 'javascript' },
  { id: 62, name: 'Java', editor: 'java' },
  { id: 54, name: 'C++', editor: 'cpp' },
];
const steps = ['Question', 'Starter code', 'Test cases', 'Solution', 'Verification', 'Approve'];
type CodingDraft = QuestionDraft & { content: QuestionContent };
type Pending = { stage: string; body: Record<string, unknown> };
function lastStep(d?: CodingDraft) {
  return !d
    ? 0
    : !d.content.starterCodes?.length
      ? 1
      : d.content.testCases.length < 10
        ? 2
        : !d.content.referenceSolution
          ? 3
          : !d.referenceVerified
            ? 4
            : 5;
}
export default function CodingQuestionWizard() {
  const panelRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState<number>();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return sessionStorage.getItem('coding-wizard:sidebar') !== 'closed';
    } catch {
      return true;
    }
  });
  useLayoutEffect(() => {
    const measure = () => {
      if (panelRef.current)
        setPanelHeight(
          Math.max(260, window.innerHeight - panelRef.current.getBoundingClientRect().top - 16),
        );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [sidebarOpen]);
  const client = useQueryClient();
  const { user } = useAuth();
  const { theme } = useTheme();
  const storageKey = `coding-wizard:${user?.id}`;
  const drafts = useQuery({
    queryKey: workflowKeys.drafts,
    queryFn: () => apiData<QuestionDraft[]>('/ai/drafts'),
  });
  const [selected, setSelected] = useState<number | null>(() => {
    try {
      return Number(sessionStorage.getItem(storageKey)) || null;
    } catch {
      return null;
    }
  });
  const queue = (drafts.data ?? []).filter(
    (d) =>
      d.content.questionType !== 'mcq' &&
      !d.questionId &&
      !['approved', 'rejected'].includes(d.status),
  ) as CodingDraft[];
  const draft = queue.find((d) => d.id === selected);
  const [verificationDirty, setVerificationDirty] = useState(false);
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [topic, setTopic] = useState(''),
    [difficulty, setDifficulty] = useState('medium');
  const [fields, setFields] = useState({
    title: '',
    statement: '',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    functionSignature: '',
  });
  const [chosen, setChosen] = useState([71]),
    [activeLanguage, setActiveLanguage] = useState(71),
    [code, setCode] = useState('');
  const [sampleCount, setSampleCount] = useState(2),
    [hiddenCount, setHiddenCount] = useState(8);
  const [tests, setTests] = useState<QuestionContent['testCases']>([]),
    [verificationView, setVerificationView] = useState<'trusted' | 'tests'>('trusted');
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey + ':pending') ?? 'null');
    } catch {
      return null;
    }
  });
  function remember(p: Pending | null) {
    setPending(p);
    try {
      if (p) sessionStorage.setItem(storageKey + ':pending', JSON.stringify(p));
      else sessionStorage.removeItem(storageKey + ':pending');
    } catch {}
  }
  function select(id: number | null) {
    if (dirty) {
      setError('Save or discard edits before changing questions.');
      return;
    }
    setSelected(id);
    setError('');
    setNotice('');
    try {
      if (id) sessionStorage.setItem(storageKey, String(id));
      else sessionStorage.removeItem(storageKey);
    } catch {}
    const d = queue.find((d) => d.id === id);
    setStep(lastStep(d));
  }
  function cache(d: QuestionDraft) {
    client.setQueryData<QuestionDraft[]>(workflowKeys.drafts, (old) => [
      d,
      ...(old ?? []).filter((row) => row.id !== d.id),
    ]);
    setSelected(d.id);
    try {
      sessionStorage.setItem(storageKey, String(d.id));
    } catch {}
  }
  useEffect(() => {
    if (!draft) return;
    const c = draft.content;
    setFields({
      title: c.title,
      statement: c.statement,
      inputFormat: c.inputFormat ?? '',
      outputFormat: c.outputFormat ?? '',
      constraints: c.constraints ?? '',
      functionSignature: c.functionSignature ?? '',
    });
    setTests(c.testCases);
    setSampleCount(c.testCases.length ? c.testCases.filter((t) => t.isSample).length : 2);
    setHiddenCount(c.testCases.length ? c.testCases.filter((t) => !t.isSample).length : 8);
    const language =
      step === 3 && c.referenceSolution
        ? c.referenceSolution.languageId
        : c.starterCodes?.some((s) => s.languageId === activeLanguage)
          ? activeLanguage
          : (c.starterCodes?.[0]?.languageId ?? 71);
    setActiveLanguage(language);
    setCode(
      step === 3 && c.referenceSolution?.languageId === language
        ? c.referenceSolution.code
        : (c.starterCodes?.find((s) => s.languageId === language)?.code ?? ''),
    );
  }, [draft?.id, draft?.revision, step]);
  useEffect(() => {
    if (draft) setStep((s) => Math.min(s, lastStep(draft)));
  }, [draft?.id, draft?.revision]);
  useEffect(() => {
    if (draft) {
      try {
        const raw = sessionStorage.getItem(storageKey + ':step:' + draft.id);
        const saved = raw === null ? lastStep(draft) : Number(raw);
        if (Number.isInteger(saved) && saved >= 0) setStep(Math.min(saved, lastStep(draft)));
      } catch {}
    }
  }, [draft?.id]);
  function go(next: number) {
    if (dirty) {
      setError('Save or discard edits before changing steps.');
      return;
    }
    setError('');
    setStep(next);
    try {
      if (draft) sessionStorage.setItem(storageKey + ':step:' + draft.id, String(next));
    } catch {}
  }
  async function generate(stage: string, body: Record<string, unknown>, retry = false) {
    const request = retry ? pending! : { stage, body: { ...body, requestId: crypto.randomUUID() } };
    remember(request);
    const result = await apiData<CodingDraft>(
      `/ai/coding/generate-${request.stage}`,
      'post',
      request.body,
    );
    if (request.stage === 'question') {
      try {
        sessionStorage.setItem(storageKey + ':step:' + result.id, '0');
      } catch {}
    }
    cache(result);
    remember(null);
    return result;
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(stage: string, data: unknown) {
    if (!draft) return;
    const result = await apiData<CodingDraft>(`/ai/coding/${draft.id}`, 'put', {
      revision: draft.revision,
      stage,
      data,
    });
    cache(result);
    setNotice('Changes saved.');
  }
  const c = draft?.content;
  const savedFields = c
    ? {
        title: c.title,
        statement: c.statement,
        inputFormat: c.inputFormat ?? '',
        outputFormat: c.outputFormat ?? '',
        constraints: c.constraints ?? '',
        functionSignature: c.functionSignature ?? '',
      }
    : null;
  const starter = c?.starterCodes?.find((s) => s.languageId === activeLanguage);
  const savedCode =
    step === 1
      ? (starter?.code ?? '')
      : c?.referenceSolution?.languageId === activeLanguage
        ? c.referenceSolution.code
        : (starter?.code ?? '');
  const dirty =
    !!draft &&
    (step === 0
      ? JSON.stringify(fields) !== JSON.stringify(savedFields)
      : step === 1 || step === 3
        ? code !== savedCode
        : step === 2
          ? JSON.stringify(tests) !== JSON.stringify(c?.testCases)
          : step === 4
            ? verificationDirty
            : false);
  const maxStep = lastStep(draft);
  function chooseLanguage(id: number) {
    if (dirty) {
      setError('Save or discard your code before switching languages.');
      return;
    }
    setActiveLanguage(id);
    setCode(
      step === 3 && c?.referenceSolution?.languageId === id
        ? c.referenceSolution.code
        : (c?.starterCodes?.find((s) => s.languageId === id)?.code ?? ''),
    );
  }
  function discard() {
    if (!draft) return;
    if (step === 0) setFields(savedFields!);
    else if (step === 2) setTests(c!.testCases);
    else setCode(savedCode);
    setError('');
  }
  async function starters() {
    let current = draft!;
    for (const languageId of chosen) {
      current = await generate('starter', {
        draftId: current.id,
        revision: current.revision,
        languageId,
      });
      setChosen((old) => old.filter((id) => id !== languageId));
    }
    setActiveLanguage(
      current.content.starterCodes?.[current.content.starterCodes.length - 1]?.languageId ?? 71,
    );
    setCode(current.content.starterCodes?.[current.content.starterCodes.length - 1]?.code ?? '');
    setNotice('Selected starter languages saved.');
  }
  return (
    <div
      className={`grid gap-4 items-start ${sidebarOpen ? 'lg:grid-cols-[210px_minmax(0,1fr)]' : 'grid-cols-1'}`}
    >
      <div className="lg:hidden flex items-center gap-2 min-w-0">
        <select
          aria-label="Saved coding draft"
          className="input min-w-0 flex-1"
          value={selected ?? ''}
          disabled={busy}
          onChange={(e) => select(Number(e.target.value) || null)}
        >
          <option value="">New question</option>
          {queue.map((d) => (
            <option key={d.id} value={d.id}>
              {d.content.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-outline"
          aria-label="New question"
          disabled={busy}
          onClick={() => select(null)}
        >
          New question
        </button>
      </div>
      {sidebarOpen && (
        <aside
          id="coding-draft-sidebar"
          className="hidden lg:block card p-3 space-y-2 max-h-[calc(100dvh-18rem)] overflow-y-auto"
        >
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={() => select(null)}
          >
            New question
          </button>
          <h2 className="px-2 pt-3 text-sm font-semibold">Saved coding drafts</h2>
          {queue.map((d) => (
            <div
              key={d.id}
              className={`rounded-xl p-2 ${selected === d.id ? 'bg-primary-500/15' : 'bg-surface-800/40'}`}
            >
              <button
                className="w-full text-left text-sm font-medium p-1"
                disabled={busy}
                onClick={() => select(d.id)}
              >
                {d.content.title}
              </button>
              <div className="flex items-center justify-between mt-1">
                <button
                  type="button"
                  aria-label={`Reject ${d.content.title}`}
                  className="btn-ghost text-red-500 p-1"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await apiData(`/ai/drafts/${d.id}`, 'delete', { revision: d.revision });
                      if (selected === d.id) select(null);
                      await client.invalidateQueries({ queryKey: workflowKeys.drafts });
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </aside>
      )}
      <section
        ref={panelRef}
        style={{ height: panelHeight }}
        className="card p-0 min-w-0 overflow-hidden flex flex-col h-[calc(100dvh-21rem)] lg:h-[calc(100dvh-18rem)]"
      >
        <header className="shrink-0 p-4 sm:p-5 border-b border-surface-700 space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-ghost hidden lg:inline-flex shrink-0 p-2"
              aria-label={sidebarOpen ? 'Collapse saved drafts' : 'Expand saved drafts'}
              aria-expanded={sidebarOpen}
              aria-controls="coding-draft-sidebar"
              onClick={() => {
                setSidebarOpen(!sidebarOpen);
                try {
                  sessionStorage.setItem('coding-wizard:sidebar', sidebarOpen ? 'closed' : 'open');
                } catch {
                  /* storage unavailable */
                }
              }}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeftOpen className="h-5 w-5" />
              )}
            </button>
            <h2 className="text-xl font-semibold">
              {draft?.content.title ?? 'Create coding question'}
            </h2>
          </div>
          <nav aria-label="Coding question steps" className="flex gap-1 overflow-x-auto">
            {steps.map((name, index) => (
              <button
                key={name}
                type="button"
                aria-current={step === index ? 'step' : undefined}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm ${step === index ? 'bg-primary-500 text-white' : 'bg-surface-800 text-surface-400'}`}
                disabled={busy || index > maxStep}
                onClick={() => go(index)}
              >
                {name}
              </button>
            ))}
          </nav>
        </header>
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto min-h-0 space-y-3">
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 p-3 text-sm text-red-500"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-emerald-600">
              {notice}
            </p>
          )}
          {pending && (
            <div className="rounded-xl border border-amber-500/30 p-3 text-sm space-y-2">
              <p>Unfinished {pending.stage} request.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-outline text-xs"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const result = await generate(pending.stage, pending.body, true);
                      setStep(
                        pending.stage === 'question'
                          ? 0
                          : pending.stage === 'starter'
                            ? 1
                            : pending.stage === 'tests'
                              ? 2
                              : 3,
                      );
                      if (pending.stage === 'starter')
                        setChosen((old) =>
                          old.filter((id) => id !== Number(pending.body.languageId)),
                        );
                      setSelected(result.id);
                    })
                  }
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry request
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={busy}
                  onClick={() => remember(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <fieldset disabled={busy || !!pending} className="space-y-4 min-w-0">
            {step === 0 &&
              (!draft ? (
                <form
                  className="grid sm:grid-cols-2 gap-4 items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await generate('question', { topic, difficulty });
                      setStep(0);
                    });
                  }}
                >
                  <label className="label">
                    Topic
                    <input
                      className="input mt-1"
                      required
                      minLength={2}
                      maxLength={100}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="For example: array sums"
                    />
                  </label>
                  <label className="label">
                    Difficulty
                    <select
                      className="input mt-1"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      {['easy', 'medium', 'hard'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="btn-primary justify-self-end sm:col-span-2"
                    disabled={!!pending}
                  >
                    Generate question
                  </button>
                </form>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-3 items-start">
                    {Object.entries(fields).map(([key, value]) => {
                      const label =
                        {
                          title: 'Title',
                          statement: 'Question',
                          inputFormat: 'Input format',
                          outputFormat: 'Output format',
                          constraints: 'Constraints',
                          functionSignature: 'Function signature',
                        }[key] ?? key;
                      return (
                        <WizardSection
                          key={`${draft.id}-${key}`}
                          title={label}
                          defaultOpen={key === 'title' || key === 'statement'}
                          className={key === 'title' || key === 'statement' ? 'sm:col-span-2' : ''}
                        >
                          <label className="block">
                            <span className="sr-only">{label}</span>
                            <textarea
                              className="input"
                              rows={key === 'statement' ? 4 : key === 'title' ? 1 : 3}
                              value={value}
                              onChange={(e) =>
                                setFields((old) => ({ ...old, [key]: e.target.value }))
                              }
                            />
                          </label>
                        </WizardSection>
                      );
                    })}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!dirty}
                      onClick={() => void act(() => save('question', fields))}
                    >
                      Save question
                    </button>
                  </div>
                </>
              ))}
            {step === 1 && draft && (
              <>
                <WizardSection title="Starter languages">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {languages.map((l) => (
                        <label
                          key={l.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-surface-700 p-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={chosen.includes(l.id)}
                            onChange={(e) =>
                              setChosen((old) =>
                                e.target.checked ? [...old, l.id] : old.filter((id) => id !== l.id),
                              )
                            }
                          />
                          {l.name}
                          {c?.starterCodes?.some((s) => s.languageId === l.id) && (
                            <span className="text-xs text-emerald-600">Saved</span>
                          )}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!chosen.length || dirty || !!pending}
                      onClick={() => void act(starters)}
                    >
                      Generate selected starters
                    </button>
                  </div>
                </WizardSection>
                {!!c?.starterCodes?.length && (
                  <WizardSection title="Starter editor">
                    <div className="space-y-3">
                      <label className="label block sm:max-w-xs">
                        View/edit language
                        <select
                          className="input mt-1"
                          value={activeLanguage}
                          onChange={(e) => chooseLanguage(Number(e.target.value))}
                        >
                          {c.starterCodes.map((s) => (
                            <option key={s.languageId} value={s.languageId}>
                              {s.languageName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <CodeEditor
                        height="260px"
                        language={languages.find((l) => l.id === activeLanguage)?.editor}
                        theme={theme === 'dark' ? 'vs-dark' : 'light'}
                        value={code}
                        onChange={(v) => setCode(v ?? '')}
                        options={{
                          minimap: { enabled: false },
                          automaticLayout: true,
                          readOnly: busy || !!pending,
                        }}
                      />
                      <button
                        type="button"
                        className="btn-outline"
                        disabled={!dirty}
                        onClick={() =>
                          void act(() => save('starter', { languageId: activeLanguage, code }))
                        }
                      >
                        Save starter
                      </button>
                    </div>
                  </WizardSection>
                )}
              </>
            )}
            {step === 2 && draft && (
              <>
                <WizardSection title="Test case settings">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="label">
                      Sample / non-hidden cases
                      <input
                        type="number"
                        className="input mt-1"
                        min={1}
                        max={29}
                        value={sampleCount}
                        onChange={(e) => setSampleCount(Number(e.target.value))}
                      />
                    </label>
                    <label className="label">
                      Hidden cases
                      <input
                        type="number"
                        className="input mt-1"
                        min={1}
                        max={29}
                        value={hiddenCount}
                        onChange={(e) => setHiddenCount(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={
                        dirty ||
                        !!pending ||
                        sampleCount < 1 ||
                        hiddenCount < 1 ||
                        sampleCount + hiddenCount < 10 ||
                        sampleCount + hiddenCount > 30
                      }
                      onClick={() =>
                        void act(() =>
                          generate('tests', {
                            draftId: draft.id,
                            revision: draft.revision,
                            sampleCount,
                            hiddenCount,
                          }),
                        )
                      }
                    >
                      Generate test cases
                    </button>
                  </div>
                </WizardSection>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
                  {tests.map((t, i) => (
                    <details
                      key={i}
                      className="group min-w-0 rounded-xl border border-surface-700 p-3"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium list-none [&::-webkit-details-marker]:hidden">
                        <span>
                          Test {i + 1} · {t.isSample ? 'Sample' : 'Hidden'}
                          {t.isEdgeCase ? ' · Edge case' : ''}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-primary-400 transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <div className="mt-3 grid sm:grid-cols-2 gap-3">
                        {(['input', 'expectedOutput'] as const).map((field) => (
                          <label key={field} className="label min-w-0">
                            {field === 'input' ? 'Input' : 'Expected output'} {i + 1}
                            <textarea
                              className="input mt-1 font-mono text-xs"
                              rows={3}
                              value={t[field]}
                              onChange={(e) =>
                                setTests((old) =>
                                  old.map((row, index) =>
                                    index === i ? { ...row, [field]: e.target.value } : row,
                                  ),
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
                {!!tests.length && (
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={!dirty}
                    onClick={() => void act(() => save('tests', tests))}
                  >
                    Save test case edits
                  </button>
                )}
              </>
            )}
            {step === 3 && draft && (
              <>
                <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                  <label className="label">
                    Solution language
                    <select
                      className="input mt-1"
                      value={activeLanguage}
                      onChange={(e) => chooseLanguage(Number(e.target.value))}
                    >
                      {c?.starterCodes?.map((s) => (
                        <option key={s.languageId} value={s.languageId}>
                          {s.languageName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={dirty || !!pending}
                    onClick={() =>
                      void act(() =>
                        generate('solution', {
                          draftId: draft.id,
                          revision: draft.revision,
                          languageId: activeLanguage,
                        }),
                      )
                    }
                  >
                    Generate solution with AI
                  </button>
                </div>
                <WizardSection title="Solution editor">
                  <CodeEditor
                    height="280px"
                    language={languages.find((l) => l.id === activeLanguage)?.editor}
                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                    value={code}
                    onChange={(v) => setCode(v ?? '')}
                    options={{
                      minimap: { enabled: false },
                      automaticLayout: true,
                      readOnly: busy || !!pending,
                    }}
                  />
                </WizardSection>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!code.trim() || (!dirty && !!c?.referenceSolution)}
                    onClick={() =>
                      void act(() => save('solution', { languageId: activeLanguage, code }))
                    }
                  >
                    Save solution
                  </button>
                </div>
              </>
            )}
            {step === 4 && draft && (
              <>
                <div className="inline-flex gap-2">
                  <button
                    type="button"
                    className={verificationView === 'trusted' ? 'btn-primary' : 'btn-outline'}
                    onClick={() => setVerificationView('trusted')}
                  >
                    Verify test cases
                  </button>
                  <button
                    type="button"
                    className={verificationView === 'tests' ? 'btn-primary' : 'btn-outline'}
                    disabled={!draft.referenceVerified}
                    onClick={() => {
                      if (verificationDirty) {
                        setError('Save or discard test case edits first.');
                        return;
                      }
                      setVerificationView('tests');
                    }}
                  >
                    Solution test runner
                  </button>
                </div>
                {verificationView === 'trusted' ? (
                  <ReferenceReview
                    key={draft.revision}
                    draft={draft}
                    dirty={false}
                    disabled={busy}
                    onDirtyChange={setVerificationDirty}
                    onBusyChange={setBusy}
                    onEditStarter={() => go(1)}
                    onEditSolution={() => go(3)}
                  />
                ) : (
                  <DraftSolutionTester
                    key={draft.revision}
                    draftId={draft.id}
                    revision={draft.revision}
                    content={c!}
                    dirty={false}
                    disabled={busy || !draft.referenceVerified}
                    outputsVerified={!!draft.referenceVerified}
                    initialSolution={c?.referenceSolution}
                  />
                )}
              </>
            )}
            {step === 5 && draft && (
              <>
                <WizardSection title="Approval summary">
                  <dl className="grid sm:grid-cols-2 gap-3 text-sm [&>div]:rounded-xl [&>div]:border [&>div]:border-surface-700 [&>div]:p-3">
                    <div>
                      <dt className="text-surface-400">Question</dt>
                      <dd className="font-semibold mt-1">{c?.title}</dd>
                    </div>
                    <div>
                      <dt className="text-surface-400">Languages</dt>
                      <dd className="mt-1">
                        {c?.starterCodes?.map((s) => s.languageName).join(', ')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-surface-400">Test cases</dt>
                      <dd className="mt-1">
                        {c?.testCases.filter((t) => t.isSample).length} sample,{' '}
                        {c?.testCases.filter((t) => !t.isSample).length} hidden
                      </dd>
                    </div>
                    <div>
                      <dt className="text-surface-400">Solution verification</dt>
                      <dd className="text-emerald-600 mt-1">
                        {draft.referenceVerified ? 'Verified for this revision' : 'Needs review'}
                      </dd>
                    </div>
                  </dl>
                </WizardSection>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!draft.referenceVerified}
                    onClick={() =>
                      void act(async () => {
                        await apiData(`/ai/coding/${draft.id}/approve`, 'post', {
                          revision: draft.revision,
                        });
                        select(null);
                        setNotice('Question approved into the Question Bank.');
                        await client.invalidateQueries({ queryKey: workflowKeys.drafts });
                        await client.invalidateQueries({ queryKey: ['question-bank'] });
                      })
                    }
                  >
                    Approve into Question Bank
                  </button>
                </div>
              </>
            )}
          </fieldset>
        </div>
        <footer className="shrink-0 border-t border-surface-700 p-4 flex items-center gap-3">
          <button
            type="button"
            className="btn-outline"
            disabled={busy || step === 0}
            onClick={() => go(step - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          {dirty && step !== 4 && (
            <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={discard}>
              Discard edits
            </button>
          )}
          {busy && (
            <span role="status" className="ml-auto text-xs text-surface-400">
              Working...
            </span>
          )}
          {step < 5 && (
            <button
              type="button"
              className="btn-primary ml-auto"
              disabled={busy || !!pending || step >= maxStep || dirty}
              onClick={() => go(step + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
