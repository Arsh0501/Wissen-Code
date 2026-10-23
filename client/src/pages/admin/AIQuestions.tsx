import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import StringListInput from '../../components/StringListInput';
import AdminLayout from '../../components/AdminLayout';
import { apiError } from '../../services/api';
import {
  apiData,
  retryWorkflowRequest,
  workflowKeys,
  QuestionDraft,
  QuestionContent,
} from '../../services/workflows';
import { Spinner } from '../../components/ui';
import QuestionValidationFeedback from '../../components/questions/QuestionValidationFeedback';
import DirectApproveInfo from '../../components/questions/DirectApproveInfo';

export const AVAILABLE_STARTER_LANGUAGES = [
  { id: 71, name: 'Python' },
  { id: 63, name: 'JavaScript' },
  { id: 62, name: 'Java' },
  { id: 54, name: 'C++' },
];

interface GenerationRequest {
  requestId: string;
  topic: string;
  difficulty: string;
  questionType: string;
  count: number;
  starterLanguages?: { id: number; name: string }[];
}

export default function AIQuestions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const pendingKey = `wissen-ai-studio-pending:${user?.id}`;
  const [pendingGeneration, setPendingGeneration] = useState<GenerationRequest | null>(() => {
    try { const value = JSON.parse(localStorage.getItem(pendingKey) ?? 'null'); return value?.requestId && value?.topic ? value : null; }
    catch { return null; }
  });
  const rememberGeneration = (request: GenerationRequest | null) => {
    setPendingGeneration(request);
    try { if (request) localStorage.setItem(pendingKey, JSON.stringify(request)); else localStorage.removeItem(pendingKey); } catch {}
  };
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () =>
      apiData<{ configured: boolean; canVerify: boolean }>('/ai/status'),
  });
  const drafts = useQuery({
    queryKey: workflowKeys.drafts,
    queryFn: () => apiData<QuestionDraft[]>('/ai/drafts'),
    refetchInterval: pendingGeneration ? 3000 : false,
  });
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [questionType, setType] = useState('coding');
  const [count, setCount] = useState(3);
  const [selectedLanguages, setSelectedLanguages] = useState<number[]>([71, 63]);
  const [selected, setSelected] = useState<number | null>(null);
  const generate = useMutation({
    mutationFn: (request: GenerationRequest) => apiData<QuestionDraft[]>('/ai/generate', 'post', request),
    retry: retryWorkflowRequest,
    retryDelay: (attempt) => 1000 * (attempt + 1),
    onSuccess: async (result) => {
      rememberGeneration(null);
      setSelected(result[0]?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: workflowKeys.drafts });
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: workflowKeys.drafts }); },
  });
  const remove = useMutation({
    mutationFn: (draft: QuestionDraft) => apiData(`/ai/drafts/${draft.id}`, 'delete', { revision: draft.revision }),
    retry: retryWorkflowRequest,
    onSuccess: async (_, draft) => {
      if (selected === draft.id) setSelected(null);
      await queryClient.invalidateQueries({ queryKey: workflowKeys.drafts });
    },
  });
  const draft = drafts.data?.find((d) => d.id === selected);
  return (
    <AdminLayout
      title="AI Question Studio"
      subtitle="Generate → Preview → Edit → Validate → Approve → Question Bank"
      actions={
        <Link className="btn-outline" to="/admin/questions">
          Question Bank
        </Link>
      }
    >
      {!status.isLoading && !status.data?.configured && (
        <p className="card mb-4 text-amber-700">
          AI generation requires a Groq or OpenAI API key configured on the backend.
          You can still inspect existing drafts.
        </p>
      )}
      {status.data && !status.data.canVerify && (
        <p className="card mb-4 text-amber-700">
          The judge is in mock mode. Reference solutions must pass real
          execution before approval; validation will report this requirement.
        </p>
      )}
      <form
        className="card grid md:grid-cols-3 gap-4 mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          const request: GenerationRequest = {
            requestId: crypto.randomUUID(), topic, difficulty, questionType, count,
            starterLanguages: questionType === 'coding' ? selectedLanguages.map((id) => {
              const language = AVAILABLE_STARTER_LANGUAGES.find((item) => item.id === id)!;
              return { id, name: language.name };
            }) : undefined,
          };
          rememberGeneration(request);
          generate.mutate(request);
        }}
      >
        <label className="label">
          Topic
          <input
            required
            className="input mt-2"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Arrays, React state, debugging…"
          />
        </label>
        <label className="label">
          Difficulty
          <select
            className="input mt-2"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            {['easy', 'medium', 'hard'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Question type
          <select
            className="input mt-2"
            value={questionType}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="coding">Coding</option>
          </select>
        </label>
        {questionType === 'coding' && (
          <div className="md:col-span-3 card bg-surface-900/60 p-4 border border-surface-700/60 rounded-xl space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-sm font-semibold text-surface-200">
                Starter Code Languages
              </span>
              <span className="text-xs text-surface-400">
                Select languages. Starters include input/output handling; candidates implement only the marked core logic.
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {AVAILABLE_STARTER_LANGUAGES.map((lang) => {
                const isSelected = selectedLanguages.includes(lang.id);
                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        if (selectedLanguages.length > 1) {
                          setSelectedLanguages((prev) =>
                            prev.filter((id) => id !== lang.id),
                          );
                        }
                      } else {
                        setSelectedLanguages((prev) => [...prev, lang.id]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border cursor-pointer ${
                      isSelected
                        ? 'bg-primary-500/20 text-primary-400 border-primary-500/50 shadow-sm'
                        : 'bg-surface-800 text-surface-400 border-surface-700 hover:text-surface-200 hover:bg-surface-750'
                    }`}
                  >
                    <span
                      className={
                        isSelected ? 'text-primary-400 font-bold' : 'text-surface-500'
                      }
                    >
                      {isSelected ? '✓' : '+'}
                    </span>
                    <span>{lang.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <label className="label">
          Number of questions
          <input
            className="input mt-2"
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <button
          className="btn-primary self-end"
          disabled={generate.isPending || !status.data?.configured}
        >
          {generate.isPending ? 'Generating drafts…' : 'Generate'}
        </button>
        {generate.error && <p role="alert" className="text-red-600 md:col-span-3">{apiError(generate.error)}</p>}
        {pendingGeneration && !generate.isPending && <div className="md:col-span-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-surface-500">Resume the unfinished request for {pendingGeneration.count} question(s) on {pendingGeneration.topic}. Saved drafts will be kept.</p>
          <button type="button" className="btn-outline" onClick={() => generate.mutate(pendingGeneration)}>Retry generation</button>
        </div>}
      </form>
      {drafts.isLoading ? (
        <Spinner />
      ) : drafts.error ? (
        <p role="alert">{apiError(drafts.error)}</p>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-5">
          <div className="card space-y-2">
            <h2 className="font-semibold mb-4">
              Draft queue ({drafts.data?.length ?? 0})
            </h2>
            {drafts.data?.length === 0 && (
              <p className="text-surface-500">Generate questions to begin.</p>
            )}
            {remove.error && <p role="alert" className="text-sm text-red-600">{apiError(remove.error)}</p>}
            {drafts.data?.map((d) => (
              <div key={d.id} className={`rounded-lg ${selected === d.id ? 'bg-primary-500/15' : 'bg-surface-800/40'}`}>
                <button onClick={() => setSelected(d.id)} className="w-full text-left p-3">
                  <strong className="block text-sm">{d.content.title}</strong>
                  <span className="text-xs text-surface-500">{d.status.replace(/_/g, ' ')} · revision {d.revision}</span>
                </button>
                {d.status !== 'approved' && <div className="px-3 pb-3">
                  <button type="button" className="btn-ghost text-xs text-red-500" aria-label={`Delete draft ${d.content.title}`} disabled={remove.isPending} onClick={() => remove.mutate(d)}>
                    {remove.isPending && remove.variables?.id === d.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>}
              </div>
            ))}
          </div>
          {draft ? (
            <DraftEditor
              key={`${draft.id}:${draft.revision}:${draft.status}`}
              draft={draft}
            />
          ) : (
            <div className="card text-surface-500">
              Select a draft to preview, edit and validate it.
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
function DraftEditor({ draft }: { draft: QuestionDraft }) {
  const client = useQueryClient();
  const [content, setContent] = useState<QuestionContent>(draft.content);
  const [testCases, setTestCases] = useState(
    JSON.stringify(content.testCases, null, 2),
  );
  const [testError, setTestError] = useState('');

  const currentStarters =
    content.starterCodes && content.starterCodes.length > 0
      ? content.starterCodes
      : [
          {
            languageId: 71,
            languageName: 'Python',
            code: content.starterCodePython || '# Write your solution here\n',
          },
        ];

  const [activeLangId, setActiveLangId] = useState<number>(
    () => currentStarters[0]?.languageId || 71,
  );

  const updateStarterCode = (langId: number, code: string) => {
    const updated = currentStarters.map((sc) =>
      sc.languageId === langId ? { ...sc, code } : sc,
    );
    if (!updated.some((sc) => sc.languageId === langId)) {
      const info = AVAILABLE_STARTER_LANGUAGES.find((l) => l.id === langId);
      updated.push({
        languageId: langId,
        languageName: info?.name || 'Code',
        code,
      });
    }
    setContent((c) => {
      const py = updated.find((s) => s.languageId === 71);
      return {
        ...c,
        starterCodes: updated,
        starterCodePython: py ? py.code : c.starterCodePython,
      };
    });
  };

  const addStarterLanguage = (langId: number) => {
    const info = AVAILABLE_STARTER_LANGUAGES.find((l) => l.id === langId);
    if (!info) return;
    const defaultSnippet =
      langId === 71
        ? '# Write your solution here\n'
        : langId === 63
        ? '// Write your solution here\n'
        : langId === 62
        ? '// Write your solution here\n'
        : langId === 54
        ? '// Write your solution here\n'
        : '-- Write your query here\n';
    const updated = [
      ...currentStarters,
      {
        languageId: langId,
        languageName: info.name,
        code: defaultSnippet,
      },
    ];
    setContent((c) => ({
      ...c,
      starterCodes: updated,
    }));
    setActiveLangId(langId);
  };

  const removeStarterLanguage = (langId: number) => {
    if (currentStarters.length <= 1) return;
    const updated = currentStarters.filter((s) => s.languageId !== langId);
    setContent((c) => ({
      ...c,
      starterCodes: updated,
    }));
    if (activeLangId === langId) {
      setActiveLangId(updated[0]?.languageId || 71);
    }
  };

  const dirty =
    JSON.stringify(content) !== JSON.stringify(draft.content) ||
    testCases !== JSON.stringify(draft.content.testCases, null, 2);
  const approved = draft.status === 'approved';
  const change = <K extends keyof QuestionContent>(
    key: K,
    value: QuestionContent[K],
  ) => setContent((c) => ({ ...c, [key]: value }));
  const action = useMutation({
    retry: retryWorkflowRequest,
    retryDelay: (attempt) => 1000 * (attempt + 1),
    mutationFn: async (
      operation: 'save' | 'validate' | 'approve' | 'directApprove',
    ) => {
      let currentRevision = draft.revision;
      if (dirty || operation === 'save') {
        let cases;
        try {
          cases = JSON.parse(testCases);
          setTestError('');
        } catch {
          setTestError('Test cases must be valid JSON.');
          throw new Error('Test cases must be valid JSON.');
        }
        const updated = await apiData<QuestionDraft>(
          `/ai/drafts/${draft.id}`,
          'put',
          {
            content: { ...content, testCases: cases },
            revision: draft.revision,
          },
        );
        currentRevision = updated.revision;
        if (operation === 'save') return updated;
      }
      if (operation === 'directApprove') {
        return apiData(`/ai/drafts/${draft.id}/approve`, 'post', {
          revision: currentRevision,
          directApprove: true,
        });
      }
      return apiData(`/ai/drafts/${draft.id}/${operation}`, 'post', {
        revision: currentRevision,
      });
    },
    onError: (error) => {
      if ((error as any).response?.data?.diagnostics || (error as any).response?.data?.fixes) void client.invalidateQueries({ queryKey: workflowKeys.drafts });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: workflowKeys.drafts });
      await client.invalidateQueries({ queryKey: ['question-bank'] });
    },
  });
  return (
    <div className="card space-y-4">
      <div className="flex justify-between gap-4">
        <h2 className="text-lg font-semibold">Question preview and editor</h2>
        <span className="badge">{draft.status.replace(/_/g, ' ')}</span>
      </div>
      <fieldset disabled={approved || action.isPending} className="space-y-4">
        <label className="label">
          Title
          <input
            className="input mt-2"
            value={content.title}
            onChange={(e) => change('title', e.target.value)}
          />
        </label>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="label">
            Difficulty
            <select
              className="input mt-2"
              value={content.difficulty}
              onChange={(e) =>
                change(
                  'difficulty',
                  e.target.value as QuestionContent['difficulty'],
                )
              }
            >
              {['easy', 'medium', 'hard'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="label">
            Question type
            <select
              className="input mt-2"
              value={content.questionType}
              onChange={(e) =>
                change(
                  'questionType',
                  e.target.value as QuestionContent['questionType'],
                )
              }
            >
              <option value="coding">Coding</option>
            </select>
          </label>
        </div>
        <label className="label">
          Topics
          <StringListInput
            value={content.topics}
            onChange={(values) => change('topics', values)}
          />
        </label>
        <label className="label">
          Problem statement
          <textarea
            rows={7}
            className="input mt-2"
            value={content.statement}
            onChange={(e) => change('statement', e.target.value)}
          />
        </label>
        <label className="label">
          Test cases
          <textarea
            rows={8}
            className="input mt-2 font-mono text-xs"
            value={testCases}
            onChange={(e) => setTestCases(e.target.value)}
          />
        </label>
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="label mb-0">Starter code by language</label>
            {AVAILABLE_STARTER_LANGUAGES.some(
              (l) => !currentStarters.some((s) => s.languageId === l.id),
            ) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-surface-400">Add language:</span>
                {AVAILABLE_STARTER_LANGUAGES.filter(
                  (l) => !currentStarters.some((s) => s.languageId === l.id),
                ).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => addStarterLanguage(l.id)}
                    className="btn-outline text-xs py-1 px-2 border-surface-700 hover:border-primary-500/50"
                  >
                    + {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex border-b border-surface-700/60 gap-1 overflow-x-auto pt-1">
            {currentStarters.map((sc) => (
              <div key={sc.languageId} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setActiveLangId(sc.languageId)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all flex items-center gap-1.5 ${
                    activeLangId === sc.languageId
                      ? 'bg-surface-800 text-primary-400 border-t-2 border-primary-500 font-semibold'
                      : 'text-surface-400 hover:text-surface-200 hover:bg-surface-850'
                  }`}
                >
                  <span>{sc.languageName}</span>
                </button>
                {currentStarters.length > 1 && (
                  <button
                    type="button"
                    title={`Remove ${sc.languageName}`}
                    onClick={() => removeStarterLanguage(sc.languageId)}
                    className="text-surface-500 hover:text-red-400 text-xs px-1 -ml-1"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <textarea
            rows={5}
            className="input font-mono text-xs w-full mt-1"
            value={
              currentStarters.find((s) => s.languageId === activeLangId)?.code ?? ''
            }
            onChange={(e) => updateStarterCode(activeLangId, e.target.value)}
            placeholder={`Write starter code for ${
              currentStarters.find((s) => s.languageId === activeLangId)?.languageName || 'selected language'
            }...`}
          />
        </div>
        <label className="label">
          Expected Python solution
          <textarea
            rows={6}
            className="input mt-2 font-mono"
            value={content.expectedSolutionPython}
            onChange={(e) => change('expectedSolutionPython', e.target.value)}
          />
        </label>
        <label className="label">
          Solution explanation
          <textarea
            rows={3}
            className="input mt-2"
            value={content.solutionExplanation}
            onChange={(e) => change('solutionExplanation', e.target.value)}
          />
        </label>
      </fieldset>
      {dirty && (
        <p className="text-amber-700 text-sm">
          Save edits before validating. Editing invalidates previous validation.
        </p>
      )}
      {draft.validation && draft.validatedRevision === draft.revision && (
        <QuestionValidationFeedback validation={draft.validation} />
      )}
      {(action.error || testError) && (
        <p role="alert" className="text-red-600">
          {testError || apiError(action.error)}
        </p>
      )}
      {action.error && action.variables && <button className="btn-outline" disabled={action.isPending} onClick={() => action.mutate(action.variables!)}>
        {action.variables === 'save' ? 'Retry save' : action.variables === 'validate' ? 'Retry validation' : 'Retry approval'}
      </button>}
      {!approved && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            className="btn-outline"
            disabled={!dirty || action.isPending}
            onClick={() => action.mutate('save')}
          >
            Save edits
          </button>
          <button
            className="btn-outline"
            disabled={dirty || action.isPending}
            onClick={() => action.mutate('validate')}
            aria-label="Validate"
          >
            {action.isPending ? 'Working…' : 'Validate through AI'}
          </button>
          <button
            className="btn-primary"
            disabled={dirty || action.isPending || draft.status !== 'validated'}
            onClick={() => action.mutate('approve')}
          >
            Approve into Question Bank
          </button>
          <div className="inline-flex items-center gap-1">
          <button
            className="btn-outline border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer font-medium"
            disabled={action.isPending}
            onClick={() => action.mutate('directApprove')}
            title="Skip AI review; generated starter input/output drivers still require execution checks"
          >
            Direct Approve (Skip AI)
          </button>
          <DirectApproveInfo id={draft.id} verifiesStarters={content.starterContractVersion === 2} />
          </div>
        </div>
      )}
      {approved && (
        <p className="text-emerald-700">
          Approved by reviewer #{draft.approvedBy} on{' '}
          {draft.approvedAt && new Date(draft.approvedAt).toLocaleString()}.{' '}
          <Link
            className="underline"
            to={`/admin/questions/${draft.questionId}/edit`}
          >
            Open bank question
          </Link>
        </p>
      )}
    </div>
  );
}
