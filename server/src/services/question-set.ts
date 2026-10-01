// Per-candidate question sets: deterministic shuffles and random subsets, keyed by a seed
// (candidate + assessment + attempt) so reloads always show the same questions and order.

function seedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = seedHash(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Picks `count` of the given question ids (keeping their original order), or all when count is unset/too big. */
export function pickSubset(ids: number[], count: number | null | undefined, seed: string): number[] {
  if (!count || count >= ids.length) return ids;
  const chosen = new Set(seededShuffle(ids, seed).slice(0, count));
  return ids.filter((id) => chosen.has(id));
}

/** Parses a session's stored question ids; null means "all of the assessment's questions". */
export function parseQuestionIds(json: string | null | undefined): number[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(Number) : null;
  } catch {
    return null;
  }
}

/** For MCQ: the candidate's selected option ids, stored as JSON in the answer's code field. */
export function parseSelected(code: string): string[] {
  try {
    const v = JSON.parse(code || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
