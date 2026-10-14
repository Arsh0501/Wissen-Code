import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getAssessments,
  getAssessment,
  updateAssessment,
  apiError,
} from '../../services/api';
import { Question } from '../../types';
export default function AssessmentSelection({
  selectedIds,
  questions,
  onAdded,
}: {
  selectedIds: number[];
  questions: Question[];
  onAdded: () => void;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [target, setTarget] = useState('');
  const [items, setItems] = useState<{ questionId: number; marks: number }[]>(
    [],
  );
  const [saved, setSaved] = useState(false);
  const assessments = useQuery({
    queryKey: ['assessments'],
    queryFn: getAssessments,
  });
  const detail = useQuery({
    queryKey: ['assessment', Number(target)],
    queryFn: () => getAssessment(Number(target)),
    enabled: !!target,
  });
  useEffect(() => {
    if (detail.data) {
      setItems(
        detail.data.questions.map((q) => ({
          questionId: q.questionId,
          marks: q.marks,
        })),
      );
      setSaved(false);
    }
  }, [detail.data]);
  const original =
    detail.data?.questions.map((q) => ({
      questionId: q.questionId,
      marks: q.marks,
    })) ?? [];
  const dirty = JSON.stringify(items) !== JSON.stringify(original);
  const save = useMutation({
    mutationFn: async () => {
      const current = await getAssessment(Number(target));
      if (current.status !== 'draft')
        throw new Error('Only draft assessments can be edited here.');
      if (current.updatedAt !== detail.data?.updatedAt)
        throw new Error(
          'This assessment changed. Reload it before applying your selection.',
        );
      return updateAssessment(Number(target), {
        questions: items,
        questionCount: Math.max(1, items.length),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ['assessment', Number(target)],
      });
      await client.invalidateQueries({ queryKey: ['assessments'] });
      await client.invalidateQueries({ queryKey: ['assessment-dashboard'] });
      await client.invalidateQueries({ queryKey: ['question-bank'] });
      setSaved(true);
    },
  });
  const names = new Map(questions.map((q) => [q.id, q]));
  return (
    <section
      className="card space-y-4"
      aria-label="Assessment question selection"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="font-semibold">Add questions to an assessment</h2>
        <button
          className="btn-outline text-sm"
          disabled={!selectedIds.length}
          onClick={() =>
            navigate('/admin/assessments/new', {
              state: { questionIds: selectedIds },
            })
          }
        >
          Create assessment with selection
        </button>
      </div>
      <label className="label">
        Draft assessment
        <select
          className="input mt-2"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setItems([]);
            setSaved(false);
          }}
          disabled={save.isPending}
        >
          <option value="">Select a draft assessment</option>
          {assessments.data
            ?.filter((a) => a.status === 'draft')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      {assessments.isLoading && <p role="status">Loading assessments…</p>}
      {assessments.error && <p role="alert">{apiError(assessments.error)}</p>}
      {assessments.data &&
        !assessments.data.some((a) => a.status === 'draft') && (
          <p className="text-sm text-surface-500">
            No draft assessments yet. Create one with your selected questions.
          </p>
        )}
      {target && (
        <>
          <button
            className="btn-outline"
            disabled={!selectedIds.length || !detail.data || save.isPending}
            onClick={() => {
              setItems((prev) => [
                ...prev,
                ...selectedIds
                  .filter((id) => !prev.some((q) => q.questionId === id))
                  .map((questionId) => ({
                    questionId,
                    marks: { easy: 10, medium: 20, hard: 30 }[
                      names.get(questionId)?.difficulty || 'medium'
                    ],
                  })),
              ]);
              setSaved(false);
              onAdded();
            }}
          >
            Add selected questions
          </button>
          {detail.isLoading ? (
            <p role="status">Loading assessment questions…</p>
          ) : detail.error ? (
            <div role="alert">
              {apiError(detail.error)}
              <button
                className="btn-outline ml-3"
                onClick={() => detail.refetch()}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold">
                Assessment questions ({items.length})
              </h3>
              {!items.length && (
                <p className="text-sm text-surface-500">
                  This draft has no questions. Select bank questions and add
                  them.
                </p>
              )}
              <ol className="space-y-2">
                {items.map((item, index) => (
                  <li
                    key={item.questionId}
                    className="flex flex-wrap items-center gap-2 bg-surface-800/40 p-3 rounded"
                  >
                    <span className="text-xs text-surface-500">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm">
                      {names.get(item.questionId)?.title ||
                        detail.data?.questions.find(
                          (q) => q.questionId === item.questionId,
                        )?.question.title}
                    </span>
                    <button
                      className="btn-ghost text-xs"
                      aria-label={`Move assessment question ${index + 1} up`}
                      disabled={!index || save.isPending}
                      onClick={() =>
                        setItems((prev) => {
                          const next = [...prev];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          return next;
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      className="btn-ghost text-xs"
                      aria-label={`Move assessment question ${index + 1} down`}
                      disabled={index === items.length - 1 || save.isPending}
                      onClick={() =>
                        setItems((prev) => {
                          const next = [...prev];
                          [next[index + 1], next[index]] = [
                            next[index],
                            next[index + 1],
                          ];
                          return next;
                        })
                      }
                    >
                      ↓
                    </button>
                    <button
                      className="btn-ghost text-xs text-red-600"
                      aria-label={`Remove ${names.get(item.questionId)?.title || item.questionId} from assessment`}
                      disabled={save.isPending}
                      onClick={() =>
                        setItems((prev) =>
                          prev.filter((q) => q.questionId !== item.questionId),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="btn-primary"
                  disabled={!dirty || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? 'Saving…' : 'Save assessment selection'}
                </button>
                <button
                  className="btn-outline"
                  disabled={!dirty || save.isPending}
                  onClick={() => setItems(original)}
                >
                  Discard changes
                </button>
                {dirty && (
                  <span className="text-xs text-amber-700">
                    Unsaved changes
                  </span>
                )}
                {saved && (
                  <span role="status" className="text-sm text-emerald-700">
                    Assessment selection saved.
                  </span>
                )}
              </div>
            </>
          )}
          {save.error && (
            <p role="alert" className="text-red-600">
              {apiError(save.error)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
