type Result = Record<string, any>;
const record = (value: unknown): Result =>
  value && typeof value === 'object' ? (value as Result) : {};

export default function ExecutionResults({ value }: { value: unknown }) {
  const data = record(value);
  const execution = record(data.result ?? data);
  const cases: Result[] = Array.isArray(data.results) ? data.results.map(record) : [];
  const total = Number.isInteger(data.totalCount) ? data.totalCount : cases.length;
  const passed = Number.isInteger(data.passedCount)
    ? data.passedCount
    : cases.filter((item) => item.passed === true).length;
  const hasTests = total > 0;
  const status =
    data.error ||
    execution.status?.description ||
    (hasTests
      ? passed === total
        ? 'All tests passed'
        : 'Some tests failed'
      : 'Execution finished');
  return (
    <section
      aria-label="Execution results"
      className="border border-surface-700 rounded-lg p-4 space-y-4"
    >
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <h3 className="font-semibold">
          {data.mode === 'run' ? 'Sample test results' : 'Execution results'}
        </h3>
        {hasTests ? (
          <span className={passed === total ? 'text-emerald-400' : 'text-amber-400'}>
            {passed} / {total} passed
          </span>
        ) : (
          <span className="text-sm">{String(status)}</span>
        )}
      </div>
      {hasTests && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-emerald-400">Passed: {passed}</span>
          <span className="text-red-400">Failed: {total - passed}</span>
          {typeof data.score === 'number' && <span>Score: {Math.round(data.score)}%</span>}
        </div>
      )}
      {!hasTests && !data.error && (
        <p className="text-sm text-surface-400">Program executed. No test cases were evaluated.</p>
      )}
      {data.error && (
        <p role="alert" className="text-red-400">
          {String(data.error)}
        </p>
      )}
      {cases.map((item, index) => (
        <details
          key={item.testCaseId ?? index}
          className="border border-surface-800 rounded-lg p-3"
          open={item.isSample === true && !item.passed}
        >
          <summary className="cursor-pointer text-sm flex flex-wrap justify-between gap-2">
            <span>
              Test case {index + 1} · {item.isSample ? 'Sample' : 'Hidden'}
            </span>
            <span className={item.passed ? 'text-emerald-400' : 'text-red-400'}>
              {item.passed ? 'Passed' : 'Failed'}
              {item.statusDesc ? ` · ${item.statusDesc}` : ''}
            </span>
          </summary>
          {item.executionTime != null && (
            <p className="text-xs text-surface-400 mt-2">Time: {item.executionTime}s</p>
          )}
          {item.isSample === true ? (
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              {[
                ['Input', item.input],
                ['Expected output', item.expectedOutput],
                ['Your output', item.actualOutput],
              ].map(([label, text]) => (
                <div key={label}>
                  <h4 className="text-xs font-semibold mb-1">{label}</h4>
                  <pre className="sample-box whitespace-pre-wrap break-words text-xs">
                    {text === '' || text == null ? '(empty)' : String(text)}
                  </pre>
                </div>
              ))}
              {(item.stderr || item.compileOutput) && (
                <pre className="sm:col-span-3 text-xs text-red-400 whitespace-pre-wrap">
                  {String(item.compileOutput || item.stderr)}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-xs text-surface-400 mt-2">
              Hidden test input and expected output are private.
            </p>
          )}
        </details>
      ))}
      {!cases.length && (
        <>
          {execution.stdout != null && (
            <div>
              <h4 className="text-sm font-medium">Program output</h4>
              <pre className="sample-box whitespace-pre-wrap text-xs mt-2">
                {String(execution.stdout) || '(empty)'}
              </pre>
            </div>
          )}
          {(execution.compile_output || execution.stderr || execution.message) && (
            <div>
              <h4 className="text-sm font-medium">Execution details</h4>
              <pre className="sample-box whitespace-pre-wrap text-xs text-red-400 mt-2">
                {String(execution.compile_output || execution.stderr || execution.message)}
              </pre>
            </div>
          )}
          {execution.time != null && (
            <p className="text-xs text-surface-400">
              Time: {execution.time}s
              {execution.memory != null ? ` · Memory: ${execution.memory} KB` : ''}
            </p>
          )}
        </>
      )}
    </section>
  );
}
