import { useEffect, useRef, useState } from 'react';
import { Play, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import CodeEditor from '../editor/CodeEditor';
import WizardSection from './WizardSection';
import { useTheme } from '../../context/ThemeContext';
import { apiError } from '../../services/api';
import { apiData, type QuestionContent, type QuestionExecution } from '../../services/workflows';

type TestRun = { revision: number; total: number; passed: number; results: QuestionExecution[] };
const editorLanguages: Record<number, string> = {
  71: 'python',
  63: 'javascript',
  62: 'java',
  54: 'cpp',
};
export default function DraftSolutionTester({
  draftId,
  revision,
  content,
  dirty,
  disabled,
  outputsVerified = true,
  initialSolution,
}: {
  draftId: number;
  revision: number;
  content: QuestionContent;
  dirty: boolean;
  disabled: boolean;
  outputsVerified?: boolean;
  initialSolution?: { languageId: number; code: string } | null;
}) {
  const { theme } = useTheme();
  const starters = content.starterCodes?.length
    ? content.starterCodes
    : [{ languageId: 71, languageName: 'Python', code: content.starterCodePython }];
  const [languageId, setLanguageId] = useState(
    initialSolution?.languageId ?? starters[0].languageId,
  );
  const [solutions, setSolutions] = useState<Record<number, string>>(
    initialSolution ? { [initialSolution.languageId]: initialSolution.code } : {},
  );
  const sourceCode =
    solutions[languageId] ?? starters.find((s) => s.languageId === languageId)?.code ?? '';
  const [run, setRun] = useState<TestRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setRun(null);
    setError('');
    return () => {
      generation.current++;
    };
  }, [draftId, revision, dirty, languageId, sourceCode]);
  async function runAll() {
    const requestGeneration = generation.current;
    setBusy(true);
    setError('');
    setRun(null);
    try {
      const result = await apiData<TestRun>(`/ai/drafts/${draftId}/test-solution`, 'post', {
        revision,
        languageId,
        sourceCode,
      });
      if (generation.current === requestGeneration) setRun(result);
    } catch (error) {
      if (generation.current === requestGeneration) setError(apiError(error));
    } finally {
      setBusy(false);
    }
  }
  const setCode = (code: string) => setSolutions((s) => ({ ...s, [languageId]: code }));
  return (
    <section
      aria-label="Test solution"
      className="rounded-2xl border border-surface-700 bg-surface-900 p-4 sm:p-5 space-y-4 min-w-0"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="badge">{content.testCases.length} test cases</span>
      </header>
      <fieldset disabled={disabled || busy} className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-end gap-3">
          <label className="label min-w-40">
            Solution language
            <select
              className="input mt-1"
              value={languageId}
              onChange={(e) => setLanguageId(Number(e.target.value))}
            >
              {starters
                .filter((s) => editorLanguages[s.languageId])
                .map((s) => (
                  <option key={s.languageId} value={s.languageId}>
                    {s.languageName}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-outline text-sm"
            onClick={() => setCode(starters.find((s) => s.languageId === languageId)?.code ?? '')}
          >
            Reset to starter
          </button>
        </div>
        <WizardSection title="Test code">
          <div className="overflow-hidden rounded-xl border border-surface-700">
            <CodeEditor
              height="260px"
              language={editorLanguages[languageId]}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              value={sourceCode}
              onChange={(value) => setCode(value ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                readOnly: disabled || busy,
              }}
            />
          </div>
        </WizardSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span role="status" className="text-sm text-surface-400">
            {busy
              ? 'Running all sample and hidden tests...'
              : run
                ? `${run.passed} / ${run.total} passed, ${run.total - run.passed} failed`
                : 'Not run'}
          </span>
          <button
            type="button"
            className="btn-primary"
            disabled={dirty || !sourceCode.trim() || disabled || busy}
            onClick={() => void runAll()}
          >
            <Play className="h-4 w-4" />
            {busy ? 'Running...' : 'Run all test cases'}
          </button>
        </div>
      </fieldset>
      {!outputsVerified && (
        <p className="text-sm text-amber-600">
          Verify the reference solution before comparing code with generated cases.
        </p>
      )}
      {dirty && (
        <p className="text-sm text-amber-600">
          Save question edits before testing the updated cases.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="grid lg:grid-cols-2 items-start gap-3">
        {content.testCases.map((test, index) => {
          const result = run?.results.find((r) => r.index === index);
          return (
            <details
              key={index}
              className={`group rounded-xl border p-3 ${result ? (result.passed ? 'border-emerald-500/40' : 'border-red-500/40') : 'border-surface-700'}`}
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium list-none [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  className="h-4 w-4 text-surface-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
                <span>Test {index + 1}</span>
                <span className="badge">{test.isSample ? 'Sample' : 'Hidden'}</span>
                {test.isEdgeCase && <span className="badge text-primary-600">Edge case</span>}
                <span
                  className={`ml-auto inline-flex items-center gap-1 ${result ? (result.passed ? 'text-emerald-600' : 'text-red-500') : 'text-surface-400'}`}
                >
                  {result &&
                    (result.passed ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    ))}
                  {result ? (result.passed ? 'Passed' : result.status) : 'Not run'}
                </span>
              </summary>
              <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                {[
                  ['Input', test.input],
                  [
                    'Expected output',
                    outputsVerified ? test.expectedOutput : 'Awaiting reference verification',
                  ],
                  ...(result ? [['Actual output', result.actualOutput || '(no output)']] : []),
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <h4 className="font-semibold mb-1">{label}</h4>
                    <pre className="sample-box max-h-40 overflow-auto whitespace-pre-wrap break-words">
                      {value || '(empty)'}
                    </pre>
                  </div>
                ))}
              </div>
              {result?.details && (
                <div className="mt-3">
                  <h4 className="text-sm font-semibold">Compiler / runtime details</h4>
                  <pre className="sample-box mt-1 text-xs max-h-48 overflow-auto whitespace-pre-wrap break-words">
                    {result.details}
                  </pre>
                </div>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
