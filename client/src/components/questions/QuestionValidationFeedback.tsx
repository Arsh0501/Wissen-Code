import type { QuestionDraft } from '../../services/workflows';
export default function QuestionValidationFeedback({
  validation,
}: {
  validation: NonNullable<QuestionDraft['validation']>;
}) {
  return (
    <section aria-label="MCQ validation results" className="space-y-3">
      <h3 className="font-semibold">Validation results</h3>
      <p className="text-sm text-surface-400">{validation.feedback}</p>
      {validation.checks.map((check) => (
        <article
          key={check.key}
          className={`rounded-xl border p-3 ${check.passed ? 'border-emerald-500/30' : 'border-red-500/30'}`}
        >
          <h4 className="text-sm font-semibold">
            {check.key}: {check.passed ? 'Passed' : 'Needs changes'}
          </h4>
          <p className="mt-1 text-sm text-surface-400">{check.evidence}</p>
        </article>
      ))}
    </section>
  );
}
