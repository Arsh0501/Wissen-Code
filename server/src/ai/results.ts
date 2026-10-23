export function uiResults(id: string, kind: string, output: any, metadata: { createdAt?: string; trigger?: unknown } = {}) {
  if (kind === 'interview-assistant')
    return {
      followUps: output.followUps.map((f: any, i: number) => ({
        id: `${id}-${i}`,
        jobId: id,
        questionId: output._question?.id,
        questionTitle: output._question?.title,
        ...metadata,
        status:
          output._reviews?.[`${id}-${i}`]?.decision === 'ask'
            ? 'asked'
            : output._reviews?.[`${id}-${i}`]?.decision === 'dismiss'
              ? 'dismissed'
              : 'pending',
        context: f.context,
        question: f.question,
        evidence: f.evidence
          .map((e: any) => `${e.sourceId}: ${e.quote}`)
          .join('\n'),
      })),
      evaluation: {
        ...metadata,
        skills: output.observations.map((o: any) => ({
          skill: o.skill,
          observation: o.observation,
          evidence: o.evidence.map((e: any) => `${e.sourceId}: ${e.quote}`),
        })),
        codingObservations: [],
        areasToProbe: output.areasToProbe,
        summary: '',
      },
    };
  if (kind === 'note-writer')
    return {
      timeline: output.timeline ?? [],
      notes: [
        'technicalNotes',
        'codingNotes',
        'problemSolvingNotes',
        'communicationNotes',
        'keyObservations',
      ].flatMap((category) =>
        output[category].map((n: any, i: number) => ({
          id: `${id}-${category}-${i}`,
          jobId: id,
          ...metadata,
          body: output._reviews?.[`${id}-${category}-${i}`]?.content ?? n.content,
          category,
          evidence: n.evidence.map((e: any) => `${e.sourceId}: ${e.quote}`).join('\n'),
          status:
            output._reviews?.[`${id}-${category}-${i}`]?.decision === 'accept'
              ? 'accepted'
              : output._reviews?.[`${id}-${category}-${i}`]?.decision ===
                  'reject'
                ? 'rejected'
                : 'pending',
          content: output._reviews?.[`${id}-${category}-${i}`]?.content ?? `${category}: ${n.content}\n${n.evidence.map((e: any) => `${e.sourceId}: ${e.quote}`).join('\n')}`,
        })),
      ),
    };
  if (kind === 'evaluation')
    return {
      evaluation: {
        ...metadata,
        basis: output._basis,
        skills: output.skills.map((s: any) => ({
          skill: s.skill,
          observation: `${s.assessment} (${s.confidence} confidence)`,
          evidence: s.evidence.map((e: any) => `${e.sourceId}: ${e.quote}`),
        })),
        codingObservations: output.codingObservations.map(
          (n: any) =>
            `${n.content} (${n.evidence.map((e: any) => `${e.sourceId}: ${e.quote}`).join('; ')})`,
        ),
        areasToProbe: output.areasToProbe,
        summary: output.summary,
        summaryEvidence: output.summaryEvidence.map((e: any) => `${e.sourceId}: ${e.quote}`),
      },
    };
  return {};
}
export async function latestUIResults(interviewId: number, authorId: number) {
  const { default: prisma } = await import('../prisma');
  const jobs = await prisma.aIJob.findMany({ where: { interviewId, authorId, kind: { in: ['interview-assistant', 'note-writer', 'evaluation'] }, status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 20 });
  return buildUIHistory(jobs);
}

// Jobs arrive newest first; render completed generations in chronological order.
export function buildUIHistory(jobs: { id: string; kind: string; output: unknown; input: unknown; createdAt: Date }[]) {
  const result: Record<string, unknown> = {};
  for (const job of [...jobs].reverse()) {
    if (!job.output) continue;
    const mapped: any = uiResults(job.id, job.kind, job.output, { createdAt: job.createdAt.toISOString(), trigger: (job.input as any)?._trigger });
    for (const key of ['followUps', 'notes', 'timeline']) if (mapped[key]) result[key] = [...((result[key] as unknown[]) ?? []), ...mapped[key]];
    if (mapped.evaluation) result.evaluation = mapped.evaluation;
  }
  if (result.timeline) result.timeline = [...new Map((result.timeline as { eventId: number }[]).map((event) => [event.eventId, event])).values()];
  return result;
}
