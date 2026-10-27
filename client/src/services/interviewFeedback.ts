export interface FeedbackCriterion {
  key: string;
  label: string;
  rating: number | null;
  feedback: string;
}

export const REQUIRED_FEEDBACK = [
  { key: 'communication_confidence', label: 'Communication / confidence' },
  { key: 'fundamentals', label: 'Fundamentals' },
  { key: 'role_alignment', label: 'Role alignment' },
] as const;

export function initialFeedbackCriteria(saved: FeedbackCriterion[] = []): FeedbackCriterion[] {
  return [
    ...REQUIRED_FEEDBACK.map((required) => ({
      ...required,
      rating: saved.find((criterion) => criterion.key === required.key)?.rating ?? null,
      feedback: saved.find((criterion) => criterion.key === required.key)?.feedback ?? '',
    })),
    ...saved.filter((criterion) => criterion.key.startsWith('custom_')),
  ];
}

export function validFeedbackCriteria(criteria: FeedbackCriterion[]) {
  const labels = criteria.map((criterion) => criterion.label.trim().toLowerCase());
  return (
    REQUIRED_FEEDBACK.every((required) =>
      criteria.some((criterion) => criterion.key === required.key),
    ) &&
    new Set(labels).size === labels.length &&
    criteria.every(
      (criterion) =>
        criterion.label.trim() &&
        criterion.rating &&
        criterion.rating >= 1 &&
        criterion.rating <= 5,
    )
  );
}
