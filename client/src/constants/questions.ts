import type { CheckKey, CheckStatus } from '../types';

// Multiple-choice option ids, in the order new options are added
export const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
export const MAX_OPTIONS = 6;

export const AI_STUDIO_STEPS = ['Define', 'Generate', 'Preview & edit', 'Validate', 'Approve'] as const;

export const CHECK_LABELS: Record<CheckKey, string> = {
  duplicate: 'Duplicate question',
  correctness: 'Correctness',
  ambiguity: 'Clear wording',
  difficulty: 'Difficulty',
  test_cases: 'Test cases / options',
  solution: 'Expected solution',
  edge_cases: 'Edge cases',
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  pass: 'Passed',
  warn: 'Warning',
  fail: 'Failed',
  skipped: 'Skipped',
};
