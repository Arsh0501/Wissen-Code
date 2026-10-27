import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api, { apiError } from '../../services/api';
import type { QuestionSet, SetQuestion } from '../../services/questionSets';

export default function QuestionSetPicker({
  interviewId,
  assignedIds,
  onAdded,
}: {
  interviewId: number;
  assignedIds: number[];
  onAdded: () => Promise<unknown>;
}) {
  const [search, setSearch] = useState(''),
    [setId, setSetId] = useState<number | null>(null);
  const [selection, setSelection] = useState<Record<number, SetQuestion>>({});
  const sets = useQuery({
    queryKey: ['interview-question-sets'],
    queryFn: async () => (await api.get<QuestionSet[]>('/interview-question-sets')).data,
  });
  const detail = useQuery({
    queryKey: ['interview-question-set', setId],
    queryFn: async () => (await api.get<QuestionSet>(`/interview-question-sets/${setId}`)).data,
    enabled: !!setId,
  });
  const availableQuestions = (detail.data?.questions ?? []).filter(
    (question) => question.id !== undefined && !assignedIds.includes(question.id),
  );
  const selectedInSet = availableQuestions.filter((question) => !!selection[question.id!]).length;
  const allSelected = availableQuestions.length > 0 && selectedInSet === availableQuestions.length;

  function selectWholeSet(checked: boolean) {
    setSelection((previous) => {
      const next = { ...previous };
      for (const question of availableQuestions) {
        if (checked) next[question.id!] = question;
        else delete next[question.id!];
      }
      return next;
    });
  }
  const add = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ count: number }>(`/interviews/${interviewId}/import-set-questions`, {
          itemIds: Object.keys(selection)
            .map(Number)
            .filter((id) => !assignedIds.includes(id)),
        })
      ).data,
    onSuccess: async () => {
      setSelection({});
      await onAdded();
    },
  });
  return (
    <section
      aria-label="Question sets"
      className="border border-surface-700 rounded-lg p-4 space-y-3 min-w-0"
    >
      <h3 className="font-semibold">Select questions from multiple sets</h3>
      <input
        className="input"
        aria-label="Search question sets"
        placeholder="Search sets"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {sets.isLoading && <p>Loading sets…</p>}
      {sets.error && (
        <p role="alert">
          {apiError(sets.error)}{' '}
          <button className="btn-outline" onClick={() => sets.refetch()}>
            Retry
          </button>
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {sets.data
          ?.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
          .map((s) => (
            <button
              key={s.id}
              className="btn-outline shrink-0"
              aria-pressed={setId === s.id}
              onClick={() => setSetId(s.id)}
            >
              {s.title} ({s._count?.questions || 0})
            </button>
          ))}
      </div>
      {sets.data?.length === 0 && <p>No question sets available.</p>}
      {detail.isLoading && <p>Loading questions…</p>}
      {detail.error && (
        <p role="alert">
          {apiError(detail.error)}{' '}
          <button className="btn-outline" onClick={() => detail.refetch()}>
            Retry
          </button>
        </p>
      )}
      {detail.data && !detail.isError && (
        <label className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-800/50 p-3 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(element) => {
              if (element) element.indeterminate = selectedInSet > 0 && !allSelected;
            }}
            disabled={add.isPending || !availableQuestions.length}
            onChange={(event) => selectWholeSet(event.target.checked)}
          />
          <span>Select all questions in this set</span>
          <span className="text-surface-400">
            ({selectedInSet}/{availableQuestions.length} available selected)
          </span>
        </label>
      )}
      <fieldset disabled={add.isPending} className="space-y-3">
        {detail.data?.questions.map((q) => (
          <article key={q.id} className="border border-surface-700 rounded-lg p-3 break-words">
            <label className="flex gap-2 items-start">
              <input
                type="checkbox"
                disabled={assignedIds.includes(q.id!)}
                checked={assignedIds.includes(q.id!) || !!selection[q.id!]}
                onChange={(e) =>
                  setSelection((old) => {
                    const next = { ...old };
                    if (e.target.checked) next[q.id!] = q;
                    else delete next[q.id!];
                    return next;
                  })
                }
              />
              <span>
                {q.title}
                {assignedIds.includes(q.id!) && ' (already assigned)'}
              </span>
            </label>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-surface-400">View question</summary>
              <p className="whitespace-pre-wrap text-sm mt-2">{q.statement}</p>
            </details>
            {q.answer && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm">Interviewer reference answer</summary>
                <p className="whitespace-pre-wrap text-sm">{q.answer}</p>
              </details>
            )}
          </article>
        ))}
      </fieldset>
      {!!Object.keys(selection).length && (
        <div className="text-sm space-y-2">
          <p>Selected across sets: {Object.keys(selection).length}</p>
          {Object.entries(selection).map(([id, q]) => (
            <button
              key={id}
              className="btn-outline text-xs mr-2"
              disabled={add.isPending}
              onClick={() =>
                setSelection((old) => {
                  const next = { ...old };
                  delete next[Number(id)];
                  return next;
                })
              }
            >
              {q.title} ×
            </button>
          ))}
        </div>
      )}
      <button
        className="btn-primary text-xs"
        disabled={!Object.keys(selection).length || add.isPending}
        onClick={() => add.mutate()}
      >
        {add.isPending ? 'Adding…' : 'Add selected to interview'}
      </button>
      {add.error && (
        <p role="alert" className="text-red-400">
          {apiError(add.error)}
        </p>
      )}
      {add.isSuccess && <p role="status">Added {add.data.count} questions.</p>}
    </section>
  );
}
