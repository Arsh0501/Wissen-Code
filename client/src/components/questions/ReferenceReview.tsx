import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import {
  apiData,
  workflowKeys,
  type QuestionContent,
  type QuestionDraft,
  type QuestionExecution,
} from '../../services/workflows';
import { apiError } from '../../services/api';

type TestCase = QuestionContent['testCases'][number];
export default function ReferenceReview({
  draft,
  dirty,
  disabled,
  onDirtyChange,
  onBusyChange,
  onEditStarter,
  onEditSolution,
}: {
  draft: QuestionDraft;
  dirty: boolean;
  disabled: boolean;
  onDirtyChange?: (value: boolean) => void;
  onBusyChange?: (value: boolean) => void;
  onEditStarter?: () => void;
  onEditSolution?: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const savedCases = draft.content && 'testCases' in draft.content ? draft.content.testCases : [];
  const [cases, setCases] = useState<TestCase[]>(savedCases);
  const [results, setResults] = useState<QuestionExecution[] | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const casesDirty = JSON.stringify(cases) !== JSON.stringify(savedCases);
  const ready = cases.length >= 10 && cases.every((test) => test.expectedOutput.trim());
  const currentResults =
    results ?? (draft.referenceVerified ? (draft.referenceVerification?.executions ?? []) : []);
  const verified =
    draft.referenceVerified &&
    !dirty &&
    !casesDirty &&
    !currentResults.some((result) => !result.passed);
  useEffect(() => {
    onDirtyChange?.(casesDirty);
  }, [casesDirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(
    () => () => {
      onDirtyChange?.(false);
      onBusyChange?.(false);
    },
    [onDirtyChange, onBusyChange],
  );
  function edit(index: number, fields: Partial<TestCase>) {
    setCases((old) => old.map((test, i) => (i === index ? { ...test, ...fields } : test)));
    setResults([]);
    setError('');
  }
  async function saveCases() {
    if (new Set(cases.map((test) => test.input)).size !== cases.length) {
      setError('Use distinct test inputs.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiData(`/ai/coding/${draft.id}`, 'put', {
        revision: draft.revision,
        stage: 'tests',
        data: cases,
      });
      await queryClient.invalidateQueries({ queryKey: workflowKeys.drafts });
    } catch (error) {
      setError(apiError(error));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError('');
    setResults([]);
    try {
      const updated = await apiData<QuestionDraft>(
        `/ai/drafts/${draft.id}/verify-reference`,
        'post',
        {
          revision: draft.revision,
          mode: 'generated',
        },
      );
      setResults(updated.referenceVerification?.executions ?? []);
      await queryClient.invalidateQueries({ queryKey: workflowKeys.drafts });
    } catch (error) {
      const report = (
        error as { response?: { data?: { revision?: number; executions?: QuestionExecution[] } } }
      ).response?.data;
      if (report?.revision === draft.revision && Array.isArray(report.executions)) {
        setResults(report.executions);
        setExpandedIndex(report.executions.find((result) => !result.passed)?.index ?? null);
      }
      setError(apiError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Reference verification" className="space-y-3 min-w-0">
      <fieldset disabled={busy || disabled} className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-700 p-3">
          <span
            role="status"
            className={`text-sm font-medium ${verified ? 'text-emerald-600' : 'text-surface-300'}`}
          >
            {currentResults.length
              ? `${currentResults.filter((result) => result.passed).length} / ${currentResults.length} passed`
              : verified
                ? `${cases.length} test cases passed`
                : `${cases.length} test cases`}
          </span>
          <div className="flex flex-wrap gap-2">
            {onEditStarter && (
              <button
                type="button"
                className="btn-outline text-sm"
                disabled={casesDirty}
                onClick={onEditStarter}
              >
                Edit starter code
              </button>
            )}
            {onEditSolution && (
              <button
                type="button"
                className="btn-outline text-sm"
                disabled={casesDirty}
                onClick={onEditSolution}
              >
                Edit solution
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={dirty || casesDirty || !ready}
              onClick={() => void verify()}
            >
              {busy
                ? 'Working...'
                : verified
                  ? 'Verify again'
                  : 'Verify solution against test cases'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-outline text-sm"
            disabled={cases.length >= 30}
            onClick={() => {
              setCases((old) => [
                ...old,
                {
                  input: '',
                  expectedOutput: '',
                  isSample: false,
                  isEdgeCase: false,
                  description: 'Manually added test case',
                },
              ]);
              setResults([]);
              setError('');
              setExpandedIndex(cases.length);
            }}
          >
            <Plus className="h-4 w-4" />
            Add test case
          </button>
          {casesDirty && (
            <>
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={
                  !ready ||
                  !cases.some((test) => test.isSample) ||
                  !cases.some((test) => !test.isSample)
                }
                onClick={() => void saveCases()}
              >
                Save test cases
              </button>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => {
                  setCases(savedCases);
                  setResults(null);
                  setError('');
                  setExpandedIndex(null);
                }}
              >
                Discard case edits
              </button>
              <span className="text-xs text-amber-600">Save and verify again after editing.</span>
            </>
          )}
        </div>
        {!ready && (
          <p className="text-sm text-amber-600">
            Generate inputs and expected outputs in Test cases before verification. Keep 10–30
            cases.
          </p>
        )}
        {dirty && (
          <p className="text-sm text-amber-600">Save edits before verifying the solution.</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 items-start gap-3">
          {cases.map((test, index) => {
            const result = currentResults.find((result) => result.index === index);
            return (
              <details
                key={index}
                open={expandedIndex === index}
                onToggle={(event) => {
                  if (event.currentTarget.open) setExpandedIndex(index);
                  else setExpandedIndex((current) => (current === index ? null : current));
                }}
                className={`group min-w-0 rounded-xl border bg-surface-900 ${expandedIndex === index ? 'sm:col-span-2 xl:col-span-3' : ''} ${result ? (result.passed ? 'border-emerald-500/40' : 'border-red-500/40') : 'border-surface-700'}`}
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3 text-sm font-medium list-none [&::-webkit-details-marker]:hidden">
                  <span>Test {index + 1}</span>
                  <span className="badge text-xs">{test.isSample ? 'Sample' : 'Hidden'}</span>
                  {result && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs ${result.passed ? 'text-emerald-600' : 'text-red-500'}`}
                    >
                      {result.passed ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {result.passed ? 'Passed' : result.status}
                    </span>
                  )}
                  <ChevronDown
                    aria-hidden="true"
                    className="ml-auto h-4 w-4 shrink-0 text-primary-400 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="space-y-3 border-t border-surface-700 p-3">
                  <div
                    className={`grid grid-cols-1 gap-3 ${result ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
                  >
                    {(['input', 'expectedOutput'] as const).map((field) => (
                      <label key={field} className="label min-w-0">
                        {field === 'input' ? 'Input' : 'Expected output'} {index + 1}
                        <textarea
                          className="input mt-1 font-mono text-xs"
                          rows={3}
                          value={test[field]}
                          onChange={(event) => edit(index, { [field]: event.target.value })}
                        />
                      </label>
                    ))}
                    {result && (
                      <div className="min-w-0">
                        <h4 className="mb-2 text-xs font-semibold">Actual output</h4>
                        <pre className="sample-box min-h-20 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">
                          {result.actualOutput || '(no output)'}
                        </pre>
                        {result.details && (
                          <>
                            <h4 className="mt-3 mb-2 text-xs font-semibold">
                              Compiler / runtime details
                            </h4>
                            <pre className="sample-box max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">
                              {result.details}
                            </pre>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="label w-40">
                      Visibility {index + 1}
                      <select
                        className="input mt-1"
                        value={test.isSample ? 'sample' : 'hidden'}
                        onChange={(event) =>
                          edit(index, { isSample: event.target.value === 'sample' })
                        }
                      >
                        <option value="sample">Sample</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn-ghost text-red-500 mt-4"
                      aria-label={`Remove test case ${index + 1}`}
                      disabled={cases.length <= 10}
                      onClick={() => {
                        setCases((old) => old.filter((_, i) => i !== index));
                        setResults([]);
                        setError('');
                        setExpandedIndex(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
