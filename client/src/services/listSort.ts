export type DateSortOrder = 'newest' | 'oldest';

// Copy before sorting so React Query data and the original list remain unchanged.
export function sortByCreatedAt<T extends { id: number; createdAt?: string | null }>(
  items: T[],
  order: DateSortOrder,
): T[] {
  const direction = order === 'newest' ? -1 : 1;
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : NaN;
    if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
    const difference = Number.isFinite(aTime) && Number.isFinite(bTime) ? aTime - bTime : 0;
    return direction * (difference || a.id - b.id);
  });
}
