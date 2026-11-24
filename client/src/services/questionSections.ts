export function questionSections(statement: string) {
  const sections: { title: string; body: string }[] = [];
  let title = 'Question';
  let lines: string[] = [];
  let fence: { character: string; length: number } | null = null;
  const flush = () => {
    if (lines.join('\n').trim()) sections.push({ title, body: lines.join('\n') });
    lines = [];
  };
  for (const line of statement.split('\n')) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length) fence = null;
      lines.push(line);
      continue;
    }
    if (!fence) {
      const clean = line.trim().replace(/\\$/, '').trim();
      const heading =
        clean.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/) ??
        clean.match(/^\*\*(.+?)\*\*\s*:?$/) ??
        clean.match(
          /^(Function signature(?:\s*\([^)]*\))?|Function contract|Input format|Output format|Constraints|Examples?(?:\s+\d+)?|Explanation|Notes|Requirements|Return value)\s*:?$/i,
        );
      if (heading) {
        flush();
        title = heading[1].replace(/[:\\]+$/, '').trim();
        continue;
      }
    }
    lines.push(line);
  }
  flush();
  return sections;
}
