import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import StringListInput from '../../components/StringListInput';
import AdminLayout from '../../components/AdminLayout';
import { apiError } from '../../services/api';
import {
  apiData,
  workflowKeys,
  QuestionDraft,
  QuestionContent,
} from '../../services/workflows';
import { Spinner } from '../../components/ui';

interface AutoResult {
  drafts: QuestionDraft[];
  added: { id: number; questionId: number; title: string; verified: boolean }[];
  needsReview: { id: number; title: string; failed: string[]; reason: string }[];
}

export default function AIQuestions() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () =>
      apiData<{ configured: boolean; canVerify: boolean }>('/ai/status'),
  });
  const drafts = useQuery({
    queryKey: workflowKeys.drafts,
    queryFn: () => apiData<QuestionDraft[]>('/ai/drafts'),
  });
  const [topic, setTopic] = useState('');
  const [skills, setSkills] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [questionType, setType] = useState('coding');
  const [count, setCount] = useState(3);
  const [selected, setSelected] = useState<number | null>(null);
  const [autoAdd, setAutoAdd] = useState(true);
  const [summary, setSummary] = useState<AutoResult | null>(null);
  const generate = useMutation({
    mutationFn: async () => {
      const body = {
        topic,
        difficulty,
        questionType,
        count,
        requiredSkills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (autoAdd) return apiData<AutoResult>('/ai/auto', 'post', body);
      const drafts = await apiData<QuestionDraft[]>('/ai/generate', 'post', body);
      return { drafts, added: [], needsReview: [] } satisfies AutoResult;
    },
    onSuccess: async (result) => {
      setSummary(autoAdd ? result : null);
      setSelected(result.drafts[0]?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: workflowKeys.drafts });
      await queryClient.invalidateQueries({ queryKey: ['question-bank'] });
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
          AI generation requires an OpenAI API key configured on the backend.
          You can still inspect existing drafts.
        </p>
      )}
      {status.data && !status.data.canVerify && (
        <p className="card mb-4 text-amber-700">
          The judge is in mock mode, so reference solutions are not executed.
          Questions that pass the AI review are added to the bank tagged
          “unverified”; run them against a live judge before using them in a
          real assessment.
        </p>
      )}
      <form
        className="card grid md:grid-cols-3 gap-4 mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          generate.mutate();
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
            <option value="debugging">Debugging</option>
          </select>
        </label>
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
        <label className="label">
          Required skills
          <input
            required
            className="input mt-2"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="Python, problem solving"
          />
        </label>
        <label className="label flex items-center gap-2 self-end md:col-span-2">
          <input
            type="checkbox"
            checked={autoAdd}
            onChange={(e) => setAutoAdd(e.target.checked)}
          />
          <span>
            Automatically validate and add passing questions to the Question
            Bank
          </span>
        </label>
        <button
          className="btn-primary self-end"
          disabled={generate.isPending || !status.data?.configured}
        >
          {generate.isPending
            ? autoAdd
              ? 'Generating, validating and adding…'
              : 'Generating drafts…'
            : autoAdd
              ? 'Generate & add to bank'
              : 'Generate'}
        </button>
        {generate.error && (
          <p role="alert" className="text-red-600 md:col-span-3">
            {apiError(generate.error)}
          </p>
        )}
      </form>
      {summary && (
        <section className="card mb-6 space-y-3" aria-live="polite">
          <h2 className="font-semibold">
            {summary.added.length} added to the Question Bank
            {summary.needsReview.length
              ? ` · ${summary.needsReview.length} need${summary.needsReview.length === 1 ? 's' : ''} review`
              : ''}
          </h2>
          {summary.added.length > 0 && (
            <ul className="space-y-1 text-sm">
              {summary.added.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-emerald-600">✓</span>
                  <Link
                    className="underline"
                    to={`/admin/questions/${q.questionId}/edit`}
                  >
                    {q.title}
                  </Link>
                  {!q.verified && (
                    <span className="badge bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/25">
                      unverified
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {summary.needsReview.length > 0 && (
            <ul className="space-y-1 text-sm">
              {summary.needsReview.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setSelected(q.id)}
                  >
                    {q.title}
                  </button>
                  <span className="text-surface-500">
                    {' '}
                    · {q.failed.length ? `failed: ${q.failed.join(', ')}` : q.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-surface-500">
            <Link className="underline" to="/admin/questions">
              Open the Question Bank
            </Link>{' '}
            to review, edit or use them in an assessment.
          </p>
        </section>
      )}
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
            {drafts.data?.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                className={`w-full text-left p-3 rounded-lg ${selected === d.id ? 'bg-primary-500/15' : 'bg-surface-800/40'}`}
              >
                <strong className="block text-sm">{d.content.title}</strong>
                <span className="text-xs text-surface-500">
                  {d.status.replace(/_/g, ' ')} · revision {d.revision}
                </span>
              </button>
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
  const dirty =
    JSON.stringify(content) !== JSON.stringify(draft.content) ||
    testCases !== JSON.stringify(draft.content.testCases, null, 2);
  const approved = draft.status === 'approved';
  const change = <K extends keyof QuestionContent>(
    key: K,
    value: QuestionContent[K],
  ) => setContent((c) => ({ ...c, [key]: value }));
  const action = useMutation({
    mutationFn: async (operation: 'save' | 'validate' | 'approve') => {
      if (operation === 'save') {
        let cases;
        try {
          cases = JSON.parse(testCases);
          setTestError('');
        } catch {
          setTestError('Test cases must be valid JSON.');
          throw new Error('Test cases must be valid JSON.');
        }
        return apiData(`/ai/drafts/${draft.id}`, 'put', {
          content: { ...content, testCases: cases },
          revision: draft.revision,
        });
      }
      return apiData(`/ai/drafts/${draft.id}/${operation}`, 'post', {
        revision: draft.revision,
      });
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
              <option value="debugging">Debugging</option>
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
          Required skills
          <StringListInput
            value={content.requiredSkills}
            onChange={(values) => change('requiredSkills', values)}
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
        <label className="label">
          Python starter code
          <textarea
            rows={4}
            className="input mt-2 font-mono"
            value={content.starterCodePython}
            onChange={(e) => change('starterCodePython', e.target.value)}
          />
        </label>
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
        <section className="space-y-3">
          <h3 className="font-semibold">Validation results</h3>
          <p className="text-sm">{draft.validation.feedback}</p>
          {draft.validation.checks.map((c) => (
            <div
              key={c.key}
              className={`p-3 rounded-lg border ${c.passed ? 'border-emerald-500/30' : 'border-red-500/30'}`}
            >
              <strong className="text-sm">
                {c.passed ? '✓' : '✕'} {c.key}
              </strong>
              <p className="text-xs text-surface-500 mt-1">{c.evidence}</p>
            </div>
          ))}
        </section>
      )}
      {(action.error || testError) && (
        <p role="alert" className="text-red-600">
          {testError || apiError(action.error)}
        </p>
      )}
      {!approved && (
        <div className="flex flex-wrap gap-3">
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
          >
            {action.isPending ? 'Working…' : 'Validate'}
          </button>
          <button
            className="btn-primary"
            disabled={dirty || action.isPending || draft.status !== 'validated'}
            onClick={() => action.mutate('approve')}
          >
            Approve into Question Bank
          </button>
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
