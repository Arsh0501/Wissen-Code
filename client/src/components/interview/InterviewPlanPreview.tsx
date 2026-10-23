import type { InterviewPlan } from '../../services/workflows';

export default function InterviewPlanPreview({ plan, onOpenPlan }: {
  plan: InterviewPlan | null;
  onOpenPlan?: () => void;
}) {
  return <section aria-label="Saved interview plan" className="card space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold">Interview plan</h3>
      {onOpenPlan && <button className="btn-outline text-xs" onClick={onOpenPlan}>{plan ? 'Open plan editor' : 'Prepare interview plan'}</button>}
    </div>
    {!plan ? <p className="text-sm text-surface-400">No plan has been saved for this interview. You can prepare one before starting.</p> : <>
      <div className="flex flex-wrap gap-2 text-sm"><span className="badge">{plan.durationMinutes} minutes</span>{plan.requiredSkills.map(skill => <span key={skill} className="badge">{skill}</span>)}</div>
      <details><summary className="cursor-pointer text-sm">Job requirements and candidate experience</summary><dl className="mt-3 space-y-3 text-sm"><div><dt className="font-medium">Job requirements</dt><dd className="whitespace-pre-wrap text-surface-400">{plan.jobRequirements}</dd></div><div><dt className="font-medium">Candidate experience</dt><dd className="whitespace-pre-wrap text-surface-400">{plan.candidateExperience}</dd></div></dl></details>
      {!plan.sections.length && <p>No sections have been added yet.</p>}
      {plan.sections.map((section, index) => <article key={`${index}:${section.skill}`} className="rounded-lg border border-surface-700 p-4 space-y-3">
        <div className="flex justify-between gap-3"><h4 className="font-medium">{index + 1}. {section.skill}</h4><span className="text-sm text-surface-400 shrink-0">{section.minutes} min</span></div>
        <p className="text-sm whitespace-pre-wrap">{section.objective}</p>
        <details><summary className="cursor-pointer text-sm">Planned questions ({section.questions.length})</summary><ol className="mt-2 list-decimal pl-5 space-y-2 text-sm">{section.questions.map((question, i) => <li key={i}>{question}</li>)}</ol></details>
        {!!section.followUps.length && <details><summary className="cursor-pointer text-sm">Follow-ups ({section.followUps.length})</summary><ul className="mt-2 list-disc pl-5 space-y-2 text-sm">{section.followUps.map((question, i) => <li key={i}>{question}</li>)}</ul></details>}
      </article>)}
    </>}
  </section>;
}
