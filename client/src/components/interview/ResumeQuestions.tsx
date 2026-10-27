import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';

interface Draft {
  title: string;
  statement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  keyDiscussionPoints: string[];
  expectedSolution: string;
}

export default function ResumeQuestions({
  interviewId,
  resume,
  hasPdf,
  onAdded,
}: {
  interviewId: number;
  resume?: string | null;
  hasPdf: boolean;
  onAdded: () => Promise<unknown>;
}) {
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [focus, setFocus] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [added, setAdded] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const updateDraft = (index: number, changes: Partial<Draft>) => {
    setDrafts((old) => old.map((draft, i) => (i === index ? { ...draft, ...changes } : draft)));
  };
  const invalidSelection = selected.some(
    (index) => !drafts[index]?.title.trim() || !drafts[index]?.statement.trim(),
  );
  const generate = useMutation({
    mutationFn: () =>
      apiData<{ questions: Draft[] }>(
        `/interview-workflows/${interviewId}/resume-questions`,
        'post',
        {
          count,
          difficulty,
          focus,
        },
      ),
    onSuccess: (data) => {
      setDrafts(data.questions);
      setSelected(data.questions.map((_, i) => i));
      setAdded([]);
      setNotice('');
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      let total = 0;
      for (const index of selected.filter((i) => !added.includes(i))) {
        const draft = drafts[index];
        if (!draft.title.trim() || !draft.statement.trim())
          throw new Error('Enter a title and question text for each selected draft.');
        await apiData(`/interviews/${interviewId}/questions`, 'post', {
          ...draft,
          title: draft.title.trim(),
          statement: draft.statement.trim(),
          tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
          keyDiscussionPoints: draft.keyDiscussionPoints
            .map((point) => point.trim())
            .filter(Boolean),
        });
        setAdded((old) => [...old, index]);
        setSelected((old) => old.filter((i) => i !== index));
        total++;
      }
      return total;
    },
    onSuccess: (total) => setNotice(`Added ${total} resume questions to this interview.`),
    onSettled: onAdded,
  });
  const busy = generate.isPending || add.isPending;
  return (
    <section aria-label="Resume question generation" className="space-y-4">
      <p className="text-sm text-surface-400">
        Generate questions from the candidate’s resume, review the drafts, and add your selections
        to this interview only.
      </p>
      <p className="text-sm text-surface-400">
        {resume?.trim() || hasPdf
          ? 'Uses the resume attached to this interview automatically.'
          : 'No resume is attached to this interview. Attach a resume before generating questions.'}
      </p>
      <fieldset disabled={busy} className="space-y-3">
        <div className="flex flex-wrap gap-3">
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
            Difficulty
            <select
              className="input mt-2"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>
        <label className="label block">
          Focus (optional)
          <input
            className="input mt-2 w-full"
            maxLength={1000}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. backend architecture and project decisions"
          />
        </label>
        <button
          className="btn-primary"
          disabled={
            (!resume?.trim() && !hasPdf) || !Number.isInteger(count) || count < 1 || count > 10
          }
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? 'Generating questions…' : 'Generate questions'}
        </button>
      </fieldset>
      {generate.error && <p role="alert">{apiError(generate.error)}</p>}
      {drafts.length > 0 && (
        <fieldset disabled={busy} className="space-y-3">
          {drafts.map((draft, index) => (
            <article key={index} className="border border-surface-700 rounded-lg p-4 space-y-2">
              <label className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={selected.includes(index)}
                  disabled={added.includes(index)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked ? [...old, index] : old.filter((i) => i !== index),
                    )
                  }
                />
                <span className="font-semibold">{draft.title}</span>
                <span className="text-xs text-surface-400">
                  {draft.difficulty}
                  {added.includes(index) ? ' · Added' : ''}
                </span>
              </label>
              <ReactMarkdown>{draft.statement}</ReactMarkdown>
              {!added.includes(index) && (
                <details>
                  <summary className="cursor-pointer text-sm">Edit question {index + 1}</summary>
                  <fieldset
                    aria-label={`Edit generated question ${index + 1}`}
                    className="space-y-3 mt-3"
                  >
                    <label className="label block">
                      Question title
                      <input
                        className="input mt-2 w-full"
                        maxLength={500}
                        value={draft.title}
                        onChange={(e) => updateDraft(index, { title: e.target.value })}
                      />
                    </label>
                    <label className="label block">
                      Question text
                      <textarea
                        className="input mt-2 w-full"
                        rows={5}
                        maxLength={50000}
                        value={draft.statement}
                        onChange={(e) => updateDraft(index, { statement: e.target.value })}
                      />
                    </label>
                    <label className="label block">
                      Question difficulty
                      <select
                        className="input mt-2"
                        value={draft.difficulty}
                        onChange={(e) =>
                          updateDraft(index, { difficulty: e.target.value as Draft['difficulty'] })
                        }
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </label>
                    <label className="label block">
                      Tags (comma separated)
                      <input
                        className="input mt-2 w-full"
                        value={draft.tags.join(',')}
                        onChange={(e) => updateDraft(index, { tags: e.target.value.split(',') })}
                      />
                    </label>
                    <label className="label block">
                      Expected answer
                      <textarea
                        className="input mt-2 w-full"
                        rows={4}
                        maxLength={20000}
                        value={draft.expectedSolution}
                        onChange={(e) => updateDraft(index, { expectedSolution: e.target.value })}
                      />
                    </label>
                    <label className="label block">
                      Discussion points (one per line)
                      <textarea
                        className="input mt-2 w-full"
                        rows={4}
                        value={draft.keyDiscussionPoints.join('\n')}
                        onChange={(e) =>
                          updateDraft(index, { keyDiscussionPoints: e.target.value.split('\n') })
                        }
                      />
                    </label>
                    <p className="text-xs text-surface-400">
                      Edits are kept in this draft and included when you add the question.
                    </p>
                  </fieldset>
                </details>
              )}
              <details>
                <summary className="cursor-pointer text-sm">Interviewer answer guide</summary>
                <ReactMarkdown>{draft.expectedSolution}</ReactMarkdown>
                <ul className="list-disc pl-5">
                  {draft.keyDiscussionPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
          {invalidSelection && (
            <p role="alert">Enter a title and question text for each selected draft.</p>
          )}
          <button
            className="btn-primary"
            disabled={!selected.length || invalidSelection}
            onClick={() => add.mutate()}
          >
            {add.isPending
              ? 'Adding questions…'
              : `Add selected resume questions (${selected.length})`}
          </button>
        </fieldset>
      )}
      {add.error && (
        <p role="alert">
          {apiError(add.error)} Successfully added questions remain in this interview; retry to add
          the remaining selections.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
