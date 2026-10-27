import { useMemo, useState } from 'react';
import { Question } from '../../types';
import { parseJsonArray } from '../ui';

export function filterQuestions(
  questions: Question[],
  filters: { search: string; difficulty: string; topic: string; type: string },
) {
  const term = filters.search.trim().toLowerCase();
  return questions.filter(
    (question) =>
      (!term ||
        [question.title, question.statement, ...parseJsonArray<string>(question.tags)]
          .join(' ')
          .toLowerCase()
          .includes(term)) &&
      (!filters.difficulty || question.difficulty === filters.difficulty) &&
      (!filters.topic || parseJsonArray(question.tags).includes(filters.topic)) &&
      (!filters.type || (question.questionType || 'coding') === filters.type),
  );
}
export default function QuestionPicker({
  questions,
  selectedIds,
  onChange,
  onPreview,
  scrollable = true,
}: {
  questions: Question[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  onPreview?: (question: Question) => void;
  scrollable?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('');
  const topics = useMemo(
    () => [...new Set(questions.flatMap((q) => parseJsonArray<string>(q.tags)))].sort(),
    [questions],
  );
  const visible = filterQuestions(questions, {
    search,
    difficulty,
    topic,
    type,
  });
  const all = visible.length > 0 && visible.every((q) => selectedIds.includes(q.id));
  return (
    <section className="space-y-4" aria-label="Question picker">
      <div className="grid md:grid-cols-4 gap-3">
        <input
          className="input"
          aria-label="Search questions"
          placeholder="Search title, statement or tags"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          aria-label="Difficulty filter"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">All difficulties</option>
          {['easy', 'medium', 'hard'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Topic filter"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="">All topics</option>
          {topics.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Question type filter"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All types</option>
          <option value="coding">Coding</option>
          <option value="debugging">Debugging</option>
          {['mcq', 'sql', 'written', 'project'].map((type) => (
            <option key={type} value={type}>
              {type.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={all}
            disabled={!visible.length}
            ref={(node) => {
              if (node)
                node.indeterminate = !all && visible.some((q) => selectedIds.includes(q.id));
            }}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...new Set([...selectedIds, ...visible.map((q) => q.id)])]
                  : selectedIds.filter((id) => !visible.some((q) => q.id === id)),
              )
            }
          />
          Select all visible
        </label>
        <span>
          {selectedIds.length} selected · {visible.length} shown
        </span>
        <button
          className="btn-ghost text-xs"
          disabled={!selectedIds.length}
          onClick={() => onChange([])}
        >
          Clear selection
        </button>
      </div>
      {!questions.length ? (
        <p className="card text-surface-500">No questions are available in the bank.</p>
      ) : !visible.length ? (
        <div className="card">
          <p>No questions match these filters.</p>
          <button
            className="btn-outline mt-3"
            onClick={() => {
              setSearch('');
              setDifficulty('');
              setTopic('');
              setType('');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul
          className={`${scrollable ? 'max-h-96 overflow-auto ' : ''}divide-y divide-surface-800 border border-surface-800 rounded-lg`}
        >
          {visible.map((q) => (
            <li key={q.id} className="flex gap-3 p-3 items-start">
              <input
                type="checkbox"
                className="mt-1"
                aria-label={`Select ${q.title}`}
                checked={selectedIds.includes(q.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selectedIds, q.id]
                      : selectedIds.filter((id) => id !== q.id),
                  )
                }
              />
              <div className="flex-1">
                <button
                  className="font-medium text-left"
                  onClick={() => onPreview?.(q)}
                  type="button"
                >
                  {q.title}
                </button>
                <div className="flex flex-wrap gap-2 mt-1 text-xs">
                  <span className={`badge-${q.difficulty}`}>{q.difficulty}</span>
                  <span className="badge">{q.questionType || 'coding'}</span>
                  {parseJsonArray<string>(q.tags).map((tag) => (
                    <span key={tag} className="text-surface-500">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              {onPreview && (
                <button type="button" className="btn-ghost text-xs" onClick={() => onPreview(q)}>
                  Preview
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {selectedIds.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Selected question order</h3>
          <ol className="space-y-2">
            {selectedIds.map((id, index) => (
              <li key={id} className="flex items-center gap-3 p-2 rounded bg-surface-800/40">
                <span className="text-xs text-surface-500">{index + 1}</span>
                <span className="flex-1 text-sm">
                  {questions.find((q) => q.id === id)?.title || `Question ${id}`}
                </span>
                <button
                  aria-label={`Move question ${index + 1} up`}
                  className="btn-ghost text-xs"
                  disabled={!index}
                  onClick={() => {
                    const next = [...selectedIds];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    onChange(next);
                  }}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move question ${index + 1} down`}
                  className="btn-ghost text-xs"
                  disabled={index === selectedIds.length - 1}
                  onClick={() => {
                    const next = [...selectedIds];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    onChange(next);
                  }}
                >
                  ↓
                </button>
                <button
                  className="btn-ghost text-xs"
                  aria-label={`Remove ${questions.find((q) => q.id === id)?.title || id}`}
                  onClick={() => onChange(selectedIds.filter((q) => q !== id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
