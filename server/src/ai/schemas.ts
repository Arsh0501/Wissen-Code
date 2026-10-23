import { z } from 'zod';
export const evidenceSchema = z.object({
  sourceId: z.string(),
  quote: z.string().min(1),
});
export const assistantSchema = z.object({
  followUps: z
    .array(
      z.object({
        context: z.string(),
        question: z.string(),
        evidence: z.array(evidenceSchema).min(1),
      }),
    )
    .max(5),
  observations: z
    .array(
      z.object({
        skill: z.string(),
        observation: z.string(),
        evidence: z.array(evidenceSchema).min(1),
      }),
    )
    .max(20),
  areasToProbe: z.array(z.string()).max(20),
});
const note = z.object({
  content: z.string(),
  evidence: z.array(evidenceSchema).min(1),
});
export const notesSchema = z.object({
  technicalNotes: z.array(note),
  codingNotes: z.array(note),
  problemSolvingNotes: z.array(note),
  communicationNotes: z.array(note),
  keyObservations: z.array(note),
  timeline: z.array(
    z.object({ eventId: z.number().int(), description: z.string() }),
  ),
});
export const reportSchema = z.object({
  skills: z
    .array(
      z.object({
        skill: z.string(),
        assessment: z.enum(['Strong', 'Developing', 'Needs improvement', 'Insufficient evidence']),
        confidence: z.enum(['low', 'medium', 'high']),
        evidence: z.array(evidenceSchema).min(1),
      }),
    )
    .max(30),
  codingObservations: z.array(note),
  areasToProbe: z.array(z.string()),
  summary: z.string(),
  summaryEvidence: z.array(evidenceSchema).min(1),
});
export function validateEvidence(
  output: unknown,
  sources: Record<string, string>,
  eventIds: number[] = [],
) {
  function visit(value: any): void {
    if (!value || typeof value !== 'object') return;
    if (
      'sourceId' in value &&
      'quote' in value &&
      (!sources[value.sourceId] ||
        !sources[value.sourceId].includes(value.quote))
    )
      throw new Error('AI returned unsupported evidence');
    if ('eventId' in value && !eventIds.includes(value.eventId))
      throw new Error('AI referenced an unknown event');
    Object.values(value).forEach(visit);
  }
  visit(output);
}
