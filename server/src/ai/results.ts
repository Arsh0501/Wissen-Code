export function uiResults(id: string, kind: string, output: any) {
  if (kind === 'interview-assistant')
    return {
      followUps: output.followUps.map((f: any, i: number) => ({
        id: `${id}-${i}`,
        jobId: id,
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
          status:
            output._reviews?.[`${id}-${category}-${i}`]?.decision === 'accept'
              ? 'accepted'
              : output._reviews?.[`${id}-${category}-${i}`]?.decision ===
                  'reject'
                ? 'rejected'
                : 'pending',
          content: `${category}: ${n.content}\n${n.evidence.map((e: any) => `${e.sourceId}: ${e.quote}`).join('\n')}`,
        })),
      ),
    };
  if (kind === 'evaluation')
    return {
      evaluation: {
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
        summary: `${output.summary}\n${output.summaryEvidence.map((e: any) => `${e.sourceId}: ${e.quote}`).join('\n')}`,
      },
    };
  return {};
}
export async function latestUIResults(interviewId: number, authorId: number) {
  const { default: prisma } = await import('../prisma');
  const result: Record<string, unknown> = {};
  for (const kind of ['interview-assistant', 'note-writer', 'evaluation']) {
    const job = await prisma.aIJob.findFirst({
      where: { interviewId, authorId, kind, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    if (job?.output)
      Object.assign(result, uiResults(job.id, job.kind, job.output));
  }
  return result;
}
