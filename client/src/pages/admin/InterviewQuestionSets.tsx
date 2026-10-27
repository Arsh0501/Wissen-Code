import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/layout/AdminLayout';
import InterviewNavigation from '../../components/interview/InterviewNavigation';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import api, { apiError } from '../../services/api';
import { emptySetQuestion, type QuestionSet, type SetQuestion } from '../../services/questionSets';

export default function InterviewQuestionSets() {
  const client = useQueryClient();
  const sets = useQuery({
    queryKey: ['interview-question-sets'],
    queryFn: async () => (await api.get<QuestionSet[]>('/interview-question-sets')).data,
  });
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{
    id?: number;
    title: string;
    description: string;
    revision?: number;
    questions: SetQuestion[];
  } | null>(null);
  const [editorSnapshot, setEditorSnapshot] = useState('null');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [topics, setTopics] = useState(''),
    [count, setCount] = useState(3);
  const [questionDescription, setQuestionDescription] = useState('');
  const [answers, setAnswers] = useState(true),
    [detail, setDetail] = useState('standard');
  const [drafts, setDrafts] = useState<SetQuestion[]>([]),
    [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false),
    [generating, setGenerating] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  function open(value: typeof editor) {
    setEditor(value);
    setEditorSnapshot(JSON.stringify(value));
    setDrafts([]);
    setSelected([]);
    setError('');
    setNotice('');
    setConfirmLeave(false);
  }
  function backToSets() {
    if (JSON.stringify(editor) !== editorSnapshot || drafts.length) setConfirmLeave(true);
    else open(null);
  }
  async function load(id: number) {
    setBusy(true);
    try {
      open((await api.get<QuestionSet>(`/interview-question-sets/${id}`)).data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editor) return;
    setBusy(true);
    setError('');
    try {
      if (editor.id) await api.put<QuestionSet>(`/interview-question-sets/${editor.id}`, editor);
      else await api.post<QuestionSet>('/interview-question-sets', editor);
      await client.invalidateQueries({ queryKey: ['interview-question-sets'] });
      open(null);
      setNotice('Question set saved.');
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    if (
      !window.confirm(
        'Delete this question set? Questions already imported into interviews will remain available.',
      )
    )
      return;
    setBusy(true);
    try {
      await api.delete(`/interview-question-sets/${id}`);
      if (editor?.id === id) open(null);
      await client.invalidateQueries({ queryKey: ['interview-question-sets'] });
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const { data } = await api.post<{ questions: SetQuestion[] }>(
        '/interview-question-sets/generate-preview',
        {
          topics,
          description: questionDescription.trim() || undefined,
          count,
          includeAnswers: answers,
          answerDetail: detail,
        },
        { timeout: 600000 },
      );
      setDrafts(data.questions);
      setSelected(data.questions.map((_, i) => i));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setGenerating(false);
    }
  }
  function fields(q: SetQuestion, update: (q: SetQuestion) => void, required = true) {
    return (
      <div className="space-y-3 min-w-0">
        <label className="label">
          Question title
          <input
            className="input mt-1"
            required={required}
            maxLength={500}
            value={q.title}
            onChange={(e) => update({ ...q, title: e.target.value })}
          />
        </label>
        <label className="label">
          Question
          <textarea
            className="input mt-1"
            required={required}
            rows={4}
            maxLength={20000}
            value={q.statement}
            onChange={(e) => update({ ...q, statement: e.target.value })}
          />
        </label>
        <label className="label">
          Reference answer (optional, interviewer only)
          <textarea
            className="input mt-1"
            rows={3}
            maxLength={20000}
            value={q.answer || ''}
            onChange={(e) => update({ ...q, answer: e.target.value || null })}
          />
        </label>
      </div>
    );
  }
  return (
    <AdminLayout
      title="Interview Question Sets"
      subtitle="Reusable discussion questions with optional interviewer reference answers."
      actions={
        !editor && (
          <button
            className="btn-primary"
            disabled={busy || generating}
            onClick={() => open({ title: '', description: '', questions: [] })}
          >
            Create question set
          </button>
        )
      }
    >
      <InterviewNavigation />
      {confirmLeave && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          description="Your edits and unsaved AI drafts will be discarded. Save the question set first if you want to keep them."
          confirmLabel="Discard and go back"
          cancelLabel="Keep editing"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => open(null)}
        />
      )}
      {error && (
        <p role="alert" className="text-red-400 mb-4">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4">
          {notice}
        </p>
      )}
      {editor ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || generating} className="space-y-5 min-w-0">
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-outline" onClick={backToSets}>
                Back to sets
              </button>
              <button className="btn-primary">{busy ? 'Saving…' : 'Save question set'}</button>
            </div>
            <label className="label">
              Set title
              <input
                className="input mt-1"
                required
                maxLength={200}
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              />
            </label>
            <label className="label">
              Description / topics
              <textarea
                className="input mt-1"
                maxLength={2000}
                value={editor.description}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
              />
            </label>
            <section className="border border-surface-700 rounded-xl p-4 space-y-4">
              <h2 className="font-semibold">Generate questions with AI</h2>
              <label className="label">
                Topics
                <input
                  className="input mt-1"
                  maxLength={2000}
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                />
              </label>
              <label className="label">
                Question description (optional)
                <textarea
                  className="input mt-1"
                  rows={3}
                  maxLength={4000}
                  placeholder="For example: scenario-based questions for a senior Java developer, focusing on concurrency and tradeoffs."
                  value={questionDescription}
                  onChange={(e) => setQuestionDescription(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-4 items-end">
                <label className="label">
                  Number of questions
                  <input
                    type="number"
                    className="input mt-1"
                    min={1}
                    max={10}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
                <label className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={answers}
                    onChange={(e) => setAnswers(e.target.checked)}
                  />
                  Include reference answers
                </label>
                {answers && (
                  <label className="label">
                    Answer detail
                    <select
                      className="input mt-1"
                      value={detail}
                      onChange={(e) => setDetail(e.target.value)}
                    >
                      <option value="brief">Brief</option>
                      <option value="standard">Standard</option>
                      <option value="detailed">Detailed</option>
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className="btn-outline"
                  disabled={!topics.trim() || count < 1 || count > 10 || !Number.isInteger(count)}
                  onClick={() => {
                    if (!drafts.length || window.confirm('Replace the current generated drafts?'))
                      void generate();
                  }}
                >
                  Generate review drafts
                </button>
              </div>
              <p className="text-sm text-surface-400">
                Review drafts below. Only questions you include and save become part of this set.
              </p>
            </section>
            {!!drafts.length && (
              <section className="space-y-3">
                <h2 className="font-semibold">Review generated questions</h2>
                {drafts.map((q, i) => (
                  <article key={i} className="border border-surface-700 rounded-xl p-4 space-y-3">
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(i)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? [...selected, i] : selected.filter((n) => n !== i),
                          )
                        }
                      />
                      Include this draft
                    </label>
                    {fields(
                      q,
                      (value) => setDrafts(drafts.map((old, n) => (n === i ? value : old))),
                      false,
                    )}
                  </article>
                ))}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={
                    !selected.length ||
                    selected.some((i) => !drafts[i].title.trim() || !drafts[i].statement.trim()) ||
                    editor.questions.length + selected.length > 200
                  }
                  onClick={() => {
                    setEditor({
                      ...editor,
                      questions: [
                        ...editor.questions,
                        ...drafts.filter((_, i) => selected.includes(i)),
                      ],
                    });
                    setDrafts(drafts.filter((_, i) => !selected.includes(i)));
                    setSelected([]);
                  }}
                >
                  Add selected to set ({selected.length})
                </button>
              </section>
            )}
            <section className="space-y-4">
              <div className="flex flex-wrap justify-between gap-3">
                <h2 className="font-semibold">Set questions ({editor.questions.length})</h2>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={editor.questions.length >= 200}
                  onClick={() =>
                    setEditor({ ...editor, questions: [...editor.questions, emptySetQuestion()] })
                  }
                >
                  Add manual question
                </button>
              </div>
              {editor.questions.map((q, i) => (
                <article
                  key={q.id || `new-${i}`}
                  className="border border-surface-700 rounded-xl p-4 space-y-3"
                >
                  {fields(q, (value) =>
                    setEditor({
                      ...editor,
                      questions: editor.questions.map((old, n) => (n === i ? value : old)),
                    }),
                  )}
                  <button
                    type="button"
                    className="btn-outline text-red-400"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove this question from the set? Save the set to apply the removal.',
                        )
                      )
                        setEditor({
                          ...editor,
                          questions: editor.questions.filter((_, n) => n !== i),
                        });
                    }}
                  >
                    Remove question
                  </button>
                </article>
              ))}
            </section>
          </fieldset>
          {generating && (
            <p role="status">Generating review drafts… You can review them before saving.</p>
          )}
        </form>
      ) : (
        <div className="space-y-4">
          <input
            className="input"
            placeholder="Search question sets"
            aria-label="Search question sets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {sets.isLoading && <p>Loading question sets…</p>}
          {sets.error && (
            <p role="alert">
              {apiError(sets.error)}{' '}
              <button className="btn-outline" onClick={() => sets.refetch()}>
                Retry
              </button>
            </p>
          )}
          {sets.data
            ?.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
            .map((s) => (
              <article
                key={s.id}
                className="border border-surface-700 rounded-xl p-4 flex flex-wrap justify-between gap-4"
              >
                <div className="min-w-0 break-words">
                  <h2 className="font-semibold">{s.title}</h2>
                  <p className="text-sm text-surface-400">{s.description}</p>
                  <p className="text-sm">{s._count?.questions || 0} questions</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={busy} onClick={() => load(s.id)}>
                    View / edit
                  </button>
                  <button
                    className="btn-outline text-red-400"
                    disabled={busy}
                    onClick={() => remove(s.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          {sets.data?.length === 0 && <p>No question sets yet. Create your first set.</p>}
        </div>
      )}
    </AdminLayout>
  );
}
