import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiError } from '../../services/api';
import {
  apiData,
  retryWorkflowRequest,
  workflowKeys,
  QuestionDraft,
} from '../../services/workflows';
import { Spinner } from '../../components/ui';
import MCQDraftEditor from '../../components/questions/MCQDraftEditor';

interface GenerationRequest {
  requestId: string;
  topic: string;
  topics?: string[];
  difficulty: string;
  questionType: string;
  count: number;
  starterLanguages?: { id: number; name: string }[];
}

export default function MCQQuestionsStudio() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const pendingKey = `wissen-ai-studio-pending:${user?.id}`;
  const [pendingGeneration, setPendingGeneration] = useState<GenerationRequest | null>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(pendingKey) ?? 'null');
      return value?.requestId && value?.topic && value?.questionType === 'mcq' ? value : null;
    } catch {
      return null;
    }
  });
  const rememberGeneration = (request: GenerationRequest | null) => {
    setPendingGeneration(request);
    try {
      if (request) localStorage.setItem(pendingKey, JSON.stringify(request));
      else localStorage.removeItem(pendingKey);
    } catch {}
  };
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => apiData<{ configured: boolean; canVerify: boolean }>('/ai/status'),
  });
  const drafts = useQuery({
    queryKey: workflowKeys.drafts,
    queryFn: () => apiData<QuestionDraft[]>('/ai/drafts'),
    refetchInterval: pendingGeneration ? 3000 : false,
  });
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const questionType = 'mcq';
  const [count, setCount] = useState(3);
  const [selected, setSelected] = useState<number | null>(null);
  const [batchIds, setBatchIds] = useState<number[]>([]);
  const [batchNotice, setBatchNotice] = useState('');
  const queue = (drafts.data ?? []).filter(
    (d) =>
      d.content.questionType === 'mcq' &&
      !['approved', 'rejected'].includes(d.status) &&
      !d.questionId,
  );
  const mcqs = queue.filter((d) => d.content.questionType === 'mcq');
  const batchSelection = mcqs.filter((d) => batchIds.includes(d.id));
  const batch = useMutation({
    mutationFn: async (items: QuestionDraft[]) => {
      const failures: string[] = [];
      let approved = 0;
      for (const item of items) {
        try {
          await apiData(`/ai/drafts/${item.id}/approve`, 'post', {
            revision: item.revision,
            directApprove: true,
          });
          approved++;
          setBatchIds((old) => old.filter((id) => id !== item.id));
          setSelected((old) => (old === item.id ? null : old));
          queryClient.setQueryData<QuestionDraft[]>(workflowKeys.drafts, (old) =>
            old?.filter((d) => d.id !== item.id),
          );
        } catch (error) {
          failures.push(`${item.content.title}: ${apiError(error)}`);
        }
      }
      return { approved, failures };
    },
    onSuccess: (result) =>
      setBatchNotice(
        `Approved ${result.approved} MCQ(s).${result.failures.length ? ` ${result.failures.length} could not be approved: ${result.failures.join('; ')}` : ''}`,
      ),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workflowKeys.drafts }),
        queryClient.invalidateQueries({ queryKey: ['question-bank'] }),
      ]);
    },
  });
  const generate = useMutation({
    mutationFn: (request: GenerationRequest) =>
      apiData<QuestionDraft[]>('/ai/generate', 'post', request),
    retry: retryWorkflowRequest,
    retryDelay: (attempt) => 1000 * (attempt + 1),
    onSuccess: async (result) => {
      rememberGeneration(null);
      setSelected(result[0]?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: workflowKeys.drafts });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.drafts });
    },
  });
  const remove = useMutation({
    mutationFn: (draft: QuestionDraft) =>
      apiData(`/ai/drafts/${draft.id}`, 'delete', { revision: draft.revision }),
    retry: retryWorkflowRequest,
    onSuccess: async (_, draft) => {
      if (selected === draft.id) setSelected(null);
      await queryClient.invalidateQueries({ queryKey: workflowKeys.drafts });
    },
  });
  const draft = queue.find((d) => d.id === selected);
  return (
    <div>
      {!status.isLoading && !status.data?.configured && (
        <p className="card mb-4 text-amber-700">
          AI generation requires a Groq or OpenAI API key configured on the backend. You can still
          inspect existing drafts.
        </p>
      )}
      <form
        className="card grid md:grid-cols-3 gap-4 mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          const request: GenerationRequest = {
            requestId: crypto.randomUUID(),
            topic,
            topics: topic
              .split(/[,;\n]/)
              .map((t) => t.trim())
              .filter(Boolean),
            difficulty,
            questionType,
            count,
          };
          rememberGeneration(request);
          generate.mutate(request);
        }}
      >
        <label className="label">
          Topics (comma separated)
          <input
            required
            className="input mt-2"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="SQL, networking, operating systems"
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
          Total number of questions (at least one per topic)
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
          className="btn-primary self-end justify-self-end md:col-start-3 min-w-[160px]"
          disabled={generate.isPending || !status.data?.configured}
        >
          {generate.isPending ? 'Generating drafts…' : 'Generate'}
        </button>
        {generate.error && (
          <p role="alert" className="text-red-600 md:col-span-3">
            {apiError(generate.error)}
          </p>
        )}
        {pendingGeneration && !generate.isPending && (
          <div className="md:col-span-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-surface-500">
              Resume the unfinished request for {pendingGeneration.count} question(s) on{' '}
              {pendingGeneration.topic}. Saved drafts will be kept.
            </p>
            <button
              type="button"
              className="btn-outline"
              onClick={() => generate.mutate(pendingGeneration)}
            >
              Retry generation
            </button>
          </div>
        )}
      </form>
      {drafts.isLoading ? (
        <Spinner />
      ) : drafts.error ? (
        <p role="alert">{apiError(drafts.error)}</p>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-5">
          <div className="card space-y-2">
            <h2 className="font-semibold mb-4">Draft queue ({queue.length})</h2>
            {queue.length === 0 && <p className="text-surface-500">Generate questions to begin.</p>}
            {remove.error && (
              <p role="alert" className="text-sm text-red-600">
                {apiError(remove.error)}
              </p>
            )}
            {mcqs.length > 0 && (
              <div className="space-y-2 border-b border-surface-700 pb-3">
                <label className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={batchSelection.length === mcqs.length}
                    disabled={batch.isPending}
                    onChange={(e) => setBatchIds(e.target.checked ? mcqs.map((d) => d.id) : [])}
                  />
                  Select all MCQs
                </label>
                <button
                  className="btn-primary text-xs"
                  disabled={!batchSelection.length || batch.isPending || remove.isPending}
                  onClick={() => {
                    setBatchNotice('');
                    batch.mutate(batchSelection);
                  }}
                >
                  {batch.isPending
                    ? 'Approving MCQs…'
                    : `Approve selected MCQs (${batchSelection.length})`}
                </button>
                <p className="text-xs text-surface-400">
                  Batch approval uses saved drafts and skips AI review. Correct answer keys and
                  duplicate checks still apply.
                </p>
              </div>
            )}
            {batchNotice && (
              <p role="status" className="text-sm">
                {batchNotice}
              </p>
            )}
            {queue.map((d) => (
              <div
                key={d.id}
                className={`rounded-lg ${selected === d.id ? 'bg-primary-500/15' : 'bg-surface-800/40'}`}
              >
                {d.content.questionType === 'mcq' && (
                  <label className="flex items-center gap-2 px-3 pt-3 text-xs">
                    <input
                      type="checkbox"
                      aria-label={`Select MCQ ${d.content.title}`}
                      checked={batchIds.includes(d.id)}
                      disabled={batch.isPending}
                      onChange={(e) =>
                        setBatchIds((old) =>
                          e.target.checked ? [...old, d.id] : old.filter((id) => id !== d.id),
                        )
                      }
                    />
                    Select for approval
                  </label>
                )}
                <button
                  disabled={batch.isPending}
                  onClick={() => setSelected(d.id)}
                  className="w-full text-left p-3"
                >
                  <strong className="block text-sm">{d.content.title}</strong>
                  <span className="text-xs text-surface-500">
                    {d.status.replace(/_/g, ' ')} · revision {d.revision}
                  </span>
                </button>
                {d.status !== 'approved' && (
                  <div className="px-3 pb-3">
                    <button
                      type="button"
                      className="btn-ghost text-xs text-red-500"
                      aria-label={`Reject draft ${d.content.title}`}
                      disabled={remove.isPending || batch.isPending}
                      onClick={() => remove.mutate(d)}
                    >
                      {remove.isPending && remove.variables?.id === d.id ? 'Rejecting…' : 'Reject'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <fieldset disabled={batch.isPending} className="min-w-0">
            {draft?.content.questionType === 'mcq' ? (
              <MCQDraftEditor
                key={`${draft.id}:${draft.revision}:${draft.status}`}
                draft={
                  draft as QuestionDraft & {
                    content: import('../../services/workflows').MCQContent;
                  }
                }
              />
            ) : (
              <div className="card text-surface-500">
                Select a draft to preview, edit and validate it.
              </div>
            )}
          </fieldset>
        </div>
      )}
    </div>
  );
}
