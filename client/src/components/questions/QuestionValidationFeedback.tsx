import { QuestionDraft } from '../../services/workflows';

export default function QuestionValidationFeedback({
  validation,
}: {
  validation: NonNullable<QuestionDraft['validation']>;
}) {
  const failures = [
    ...validation.executions.map((item) => ({ ...item, stage: item.stage ?? 'reference' })),
    ...(validation.starterExecutions ?? []).map((item) => ({
      ...item,
      stage: item.stage ?? 'starter',
    })),
  ].filter((item) => !item.passed);
  return (
    <section className="space-y-4 min-w-0" aria-label="Question validation results">
      <h3 className="font-semibold">Validation results</h3>
      <p className="text-sm">{validation.feedback}</p>
      {validation.starterVerified !== undefined && (
        <p className="text-sm">
          Starter input/output drivers: {validation.starterVerified ? 'Passed' : 'Needs changes'}
        </p>
      )}
      {!validation.passed && (
        <p className="text-sm text-amber-600">
          You can save edits as a draft. Resolve the issues below, save your changes and validate
          again before approval.
        </p>
      )}
      {failures.map((item, index) => (
        <article
          key={`${item.stage}:${item.languageId}:${item.index}:${index}`}
          className="rounded-lg border border-red-500/30 p-3 space-y-3 min-w-0 [overflow-wrap:anywhere]"
        >
          <h4 className="text-sm font-semibold">
            {item.stage === 'starter' ? 'Starter driver' : 'Reference solution'} ·{' '}
            {{ 71: 'Python', 63: 'JavaScript', 62: 'Java', 54: 'C++' }[item.languageId ?? 71] ??
              `Language ${item.languageId}`}{' '}
            · Test {item.index + 1}: {item.status === 'Accepted' ? 'Output mismatch' : item.status}
          </h4>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            {item.input !== undefined && (
              <div>
                <strong>Input</strong>
                <pre className="sample-box mt-1 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                  {item.input || '(empty input)'}
                </pre>
              </div>
            )}
            {item.expectedOutput !== undefined && (
              <div>
                <strong>Expected output</strong>
                <pre className="sample-box mt-1 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                  {item.expectedOutput || '(empty output)'}
                </pre>
              </div>
            )}
            {item.actualOutput !== undefined && (
              <div>
                <strong>Actual output</strong>
                <pre className="sample-box mt-1 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                  {item.actualOutput || '(no output)'}
                </pre>
              </div>
            )}
          </div>
          {item.details && (
            <details>
              <summary className="cursor-pointer text-xs">Compiler / execution details</summary>
              <pre className="sample-box mt-2 whitespace-pre-wrap text-xs max-h-48 overflow-auto">
                {item.details}
              </pre>
            </details>
          )}
          <div className="text-sm">
            <strong>How to fix</strong>
            <p className="mt-1 text-surface-400">
              {item.fix ||
                'Run validation again to capture the actual output and compiler details for this older result. Compare the expected answer with the statement, reference solution and starter formatting before making corrections.'}
            </p>
          </div>
        </article>
      ))}
      {!!validation.fixes?.length && (
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Required changes</h4>
          {validation.fixes.map((fix, index) => (
            <article
              key={index}
              className="border-l-2 border-amber-500 pl-3 text-sm space-y-1 [overflow-wrap:anywhere]"
            >
              <strong>{fix.field}</strong>
              <p className="text-surface-400 whitespace-pre-wrap">{fix.problem}</p>
              <p>
                <span className="font-medium">How to fix: </span>
                {fix.action}
              </p>
            </article>
          ))}
        </div>
      )}
      <details open={!failures.length && !validation.fixes?.length}>
        <summary className="cursor-pointer text-sm">
          AI review checks
          {validation.reviewMode === 'direct' ? ' (not rerun during Direct Approve)' : ''}
        </summary>
        <div className="mt-3 space-y-2">
          {validation.checks.map((check) => (
            <div
              key={check.key}
              className={`p-3 rounded-lg border ${check.passed ? 'border-emerald-500/30' : 'border-red-500/30'}`}
            >
              <strong className="text-sm">
                {check.passed ? 'Passed' : 'Needs changes'} · {check.key}
              </strong>
              <p className="text-xs text-surface-500 mt-1 whitespace-pre-wrap">{check.evidence}</p>
            </div>
          ))}
          {!validation.checks.length && (
            <p className="text-xs text-surface-500">AI review was skipped.</p>
          )}
        </div>
      </details>
    </section>
  );
}
