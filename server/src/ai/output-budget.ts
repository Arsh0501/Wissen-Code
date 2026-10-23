export const MAX_OUTPUT_BUDGET = 16384;

export function questionOutputBudget(input: unknown) {
  const value = input as { requestedLanguages?: unknown[]; starterLanguages?: unknown[] } | null;
  const languages = value?.requestedLanguages ?? value?.starterLanguages;
  return Math.min(MAX_OUTPUT_BUDGET, 8192 + Math.max(0, (languages?.length ?? 1) - 1) * 1536);
}

export function isOutputTruncationError(error: unknown) {
  const value = error as { code?: string; message?: string };
  return value?.code === 'AI_OUTPUT_TRUNCATED' || /max[_ ](?:completion|output)[_ ]tokens.*(?:reached|exceeded)|output was truncated|truncated to fit max[_ ]completion[_ ]tokens/i.test(value?.message ?? '');
}
