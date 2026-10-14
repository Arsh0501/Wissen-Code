import { z } from 'zod';

export const questionTypes = [
  'coding',
  'debugging',
  'mcq',
  'sql',
  'written',
  'project',
] as const;
export const questionSettingsSchema = z
  .object({
    options: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          text: z.string().min(1).max(2000),
        }),
      )
      .max(12)
      .optional(),
    correctOptionIds: z.array(z.string()).min(1).max(12).optional(),
    multiple: z.boolean().optional(),
    explanation: z.string().max(10000).optional(),
    rubric: z.string().max(10000).optional(),
    sqlSchema: z.string().max(20000).optional(),
    files: z
      .array(
        z.object({
          path: z.string().regex(/^(?!\/)(?!.*\.\.)(?!.*\\)[\w./-]+$/),
          content: z.string().max(50000),
        }),
      )
      .max(30)
      .optional(),
  })
  .strict();
export function validateQuestionSettings(type: string, raw: unknown) {
  const settings = questionSettingsSchema.parse(raw ?? {});
  if (type === 'mcq') {
    const ids = settings.options?.map((o) => o.id) ?? [];
    if (
      ids.length < 2 ||
      new Set(ids).size !== ids.length ||
      !settings.correctOptionIds?.length ||
      settings.correctOptionIds.some((id) => !ids.includes(id)) ||
      new Set(settings.correctOptionIds).size !==
        settings.correctOptionIds.length ||
      (!settings.multiple && settings.correctOptionIds.length !== 1)
    )
      throw new Error('Provide unique choices and a valid answer key');
  }
  if (['written', 'project'].includes(type) && !settings.rubric?.trim())
    throw new Error('A scoring rubric is required');
  if (
    settings.files &&
    new Set(settings.files.map((f) => f.path)).size !== settings.files.length
  )
    throw new Error('Project file paths must be unique');
  if (type === 'project' && !settings.files?.length)
    throw new Error('Add at least one project file');
  return settings;
}
export function publicSettings(raw: unknown) {
  const s =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(s).filter(
      ([key]) => !['correctOptionIds', 'explanation'].includes(key),
    ),
  );
}
// Applied at the response boundary so answer keys never leak through nested question objects.
export function candidatePayload(value: any): any {
  if (Array.isArray(value)) return value.map(candidatePayload);
  if (!value || typeof value !== 'object' || value instanceof Date)
    return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === 'settings' ? publicSettings(child) : candidatePayload(child),
    ]),
  );
}
export function scoreChoices(answer: string, raw: unknown): number {
  const settings = validateQuestionSettings('mcq', raw);
  let selected: unknown;
  try {
    selected = JSON.parse(answer);
  } catch {
    return 0;
  }
  if (
    !Array.isArray(selected) ||
    selected.some((id) => typeof id !== 'string') ||
    new Set(selected).size !== selected.length
  )
    return 0;
  const correct = settings.correctOptionIds!;
  return selected.length === correct.length &&
    selected.every((id) => correct.includes(id))
    ? 100
    : 0;
}
