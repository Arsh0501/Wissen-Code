// Token shingles provide a transparent similarity signal. Boilerplate shared with
// starter code is excluded; this is evidence for review, never a cheating verdict.
export function fingerprints(source: string, starter = '') {
  const tokenize = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*|#[^\n]*/g, '')
      .match(
        /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|==|!=|=>|&&|\|\||[^\s]/g,
      ) ?? [];
  const shingles = (s: string) => {
    const t = tokenize(s.slice(0, 20000));
    const set = new Set<string>();
    for (let i = 0; i + 7 <= t.length; i++)
      set.add(t.slice(i, i + 7).join(' '));
    return set;
  };
  const set = shingles(source);
  for (const token of shingles(starter)) set.delete(token);
  return set;
}
export function similarity(a: Set<string>, b: Set<string>) {
  if (a.size < 12 || b.size < 12) return null;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return {
    percent: Math.round((100 * shared) / (a.size + b.size - shared)),
    shared,
    left: a.size,
    right: b.size,
  };
}
