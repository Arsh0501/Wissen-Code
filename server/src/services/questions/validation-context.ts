type Comparison = { title: string; statement: string };

/** Retrieve nearby comparisons without sending the entire bank to the AI provider. */
export function validationComparisons(question: Comparison, rows: Comparison[], budget = 4000) {
  const terms = new Set(
    `${question.title} ${question.statement}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [],
  );
  const ranked = rows
    .map((row) => ({
      row,
      score: [
        ...new Set(`${row.title} ${row.statement}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []),
      ].filter((term) => terms.has(term)).length,
    }))
    .sort((a, b) => b.score - a.score);
  const selected: Comparison[] = [];
  for (const { row } of ranked.slice(0, 8)) {
    const item = { title: row.title.slice(0, 200), statement: row.statement.slice(0, 1000) };
    const size = JSON.stringify(item).length;
    if (size > budget) continue;
    selected.push(item);
    budget -= size;
  }
  return selected;
}
