import { useState } from 'react';
import Editor from '../editor/CodeEditor';
import type { Question } from '../../types';
export function parseSelection(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : [];
  } catch {
    return [];
  }
}
export function ProjectAnswer({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  const initial = question.settings?.files ?? [];
  let files: { path: string; content: string }[] = initial;
  try {
    const parsed = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every((f) => typeof f.path === 'string' && typeof f.content === 'string')
    )
      files = parsed;
  } catch {}
  const [active, setActive] = useState(initial[0]?.path ?? '');
  const current = files.find((f) => f.path === active) ?? files[0];
  return (
    <div className="h-full flex flex-col">
      <p className="p-3 text-sm text-surface-400">
        Project submission · reviewed against the rubric. Edit the provided files below.
      </p>
      <div className="flex flex-wrap gap-2 p-3">
        {files.map((f) => (
          <button
            key={f.path}
            className={current?.path === f.path ? 'btn-primary' : 'btn-outline'}
            onClick={() => setActive(f.path)}
          >
            {f.path}
          </button>
        ))}
      </div>
      <Editor
        height="450px"
        path={current?.path}
        language={
          current?.path.endsWith('.py')
            ? 'python'
            : current?.path.endsWith('.css')
              ? 'css'
              : current?.path.endsWith('.html')
                ? 'html'
                : 'typescript'
        }
        value={current?.content ?? ''}
        onChange={(next) =>
          onChange(
            JSON.stringify(
              files.map((f) => (f.path === current?.path ? { ...f, content: next ?? '' } : f)),
            ),
          )
        }
        options={{ minimap: { enabled: false }, automaticLayout: true }}
      />
    </div>
  );
}
export default function AnswerInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.questionType === 'project')
    return <ProjectAnswer question={question} value={value} onChange={onChange} />;
  if (question.questionType === 'written')
    return (
      <label className="block p-5 h-full">
        Written answer
        <textarea
          aria-label="Written answer"
          className="input mt-4 min-h-[300px]"
          maxLength={100000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-sm text-surface-500 mt-3">
          An interviewer will evaluate this answer using the question rubric.
        </p>
      </label>
    );
  const selected = parseSelection(value);
  return (
    <fieldset className="p-5 space-y-4">
      <legend className="font-semibold">
        {question.settings?.multiple ? 'Select all correct answers' : 'Select one answer'}
      </legend>
      {question.settings?.options?.map((option) => (
        <label key={option.id} className="card flex gap-3 items-start cursor-pointer">
          <input
            type={question.settings?.multiple ? 'checkbox' : 'radio'}
            name={`question-${question.id}`}
            checked={selected.includes(option.id)}
            onChange={(e) =>
              onChange(
                JSON.stringify(
                  question.settings?.multiple
                    ? e.target.checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id)
                    : [option.id],
                ),
              )
            }
          />
          <span>{option.text}</span>
        </label>
      ))}
    </fieldset>
  );
}
