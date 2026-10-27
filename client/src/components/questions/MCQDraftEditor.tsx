import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import StringListInput from '../forms/StringListInput';
import {
  apiData,
  MCQContent,
  QuestionDraft,
  retryWorkflowRequest,
  workflowKeys,
} from '../../services/workflows';
import { apiError } from '../../services/api';
import QuestionValidationFeedback from './QuestionValidationFeedback';

export default function MCQDraftEditor({
  draft,
}: {
  draft: QuestionDraft & { content: MCQContent };
}) {
  const client = useQueryClient();
  const [content, setContent] = useState(draft.content);
  const dirty = JSON.stringify(content) !== JSON.stringify(draft.content);
  const approved = draft.status === 'approved';
  const change = <K extends keyof MCQContent>(key: K, value: MCQContent[K]) =>
    setContent((c) => ({ ...c, [key]: value }));
  const action = useMutation({
    retry: retryWorkflowRequest,
    mutationFn: async (operation: 'save' | 'validate' | 'approve' | 'directApprove') => {
      let revision = draft.revision;
      if (dirty || operation === 'save') {
        const saved = await apiData<QuestionDraft>(`/ai/drafts/${draft.id}`, 'put', {
          content,
          revision,
        });
        revision = saved.revision;
        if (operation === 'save') return saved;
      }
      return apiData(
        `/ai/drafts/${draft.id}/${operation === 'directApprove' ? 'approve' : operation}`,
        'post',
        {
          revision,
          ...(operation === 'directApprove' ? { directApprove: true } : {}),
        },
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: workflowKeys.drafts });
      await client.invalidateQueries({ queryKey: ['question-bank'] });
    },
  });
  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">Single-choice MCQ preview and editor</h2>
      <p className="text-sm">
        Select exactly one correct answer. Approved questions are saved under their topic tags and
        can be added to assessments.
      </p>
      <fieldset disabled={approved || action.isPending} className="space-y-4">
        <label className="label">
          Title
          <input
            className="input mt-2"
            value={content.title}
            onChange={(e) => change('title', e.target.value)}
          />
        </label>
        <label className="label">
          Difficulty
          <select
            className="input mt-2"
            value={content.difficulty}
            onChange={(e) => change('difficulty', e.target.value as MCQContent['difficulty'])}
          >
            {['easy', 'medium', 'hard'].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Topics
          <StringListInput value={content.topics} onChange={(v) => change('topics', v)} />
        </label>
        <label className="label">
          Question
          <textarea
            rows={5}
            className="input mt-2"
            value={content.statement}
            onChange={(e) => change('statement', e.target.value)}
          />
        </label>
        <div className="space-y-3" role="group" aria-label="Answer options">
          {content.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-3">
              <input
                type="radio"
                name={`correct-${draft.id}`}
                aria-label={`Mark option ${index + 1} correct`}
                checked={content.correctOptionId === option.id}
                onChange={() => change('correctOptionId', option.id)}
              />
              <input
                className="input flex-1"
                aria-label={`Option ${index + 1}`}
                value={option.text}
                onChange={(e) =>
                  change(
                    'options',
                    content.options.map((o) =>
                      o.id === option.id ? { ...o, text: e.target.value } : o,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={content.options.length <= 2}
                onClick={() => {
                  const options = content.options.filter((o) => o.id !== option.id);
                  setContent((c) => ({
                    ...c,
                    options,
                    correctOptionId: c.correctOptionId === option.id ? '' : c.correctOptionId,
                  }));
                }}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-outline"
            disabled={content.options.length >= 6}
            onClick={() =>
              change('options', [...content.options, { id: crypto.randomUUID(), text: '' }])
            }
          >
            Add option
          </button>
        </div>
      </fieldset>
      {draft.validation && draft.validatedRevision === draft.revision && (
        <QuestionValidationFeedback validation={draft.validation} />
      )}
      {action.error && (
        <p role="alert" className="text-red-600">
          {apiError(action.error)}
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
            Validate through AI
          </button>
          <button
            className="btn-primary"
            disabled={dirty || action.isPending || draft.status !== 'validated'}
            onClick={() => action.mutate('approve')}
          >
            Approve into Question Bank
          </button>
          <button
            className="btn-outline"
            disabled={action.isPending}
            onClick={() => action.mutate('directApprove')}
          >
            Direct Approve (Skip AI)
          </button>
        </div>
      )}
      {approved && (
        <Link className="underline" to={`/admin/questions/${draft.questionId}/edit`}>
          Open bank question
        </Link>
      )}
    </div>
  );
}
