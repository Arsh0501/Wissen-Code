export function parseTestCaseText(text: string) {
  if (Buffer.byteLength(text, 'utf8') > 256000)
    throw new Error('Use a text file smaller than 250 KB.');
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const cases: { input: string; expectedOutput: string; isSample: boolean }[] = [];
  let mode: string | null = null;
  let content: string[] = [];
  let start = 0;
  const flush = () => {
    if (mode === null) return;
    while (content.length && content[content.length - 1] === '') content.pop();
    if (content.length < 2)
      throw new Error(`Case at line ${start} needs input and a one-line expected output.`);
    const expectedOutput = content.pop()!;
    const input = content.join('\n');
    if (input.length > 100000 || expectedOutput.length > 100000)
      throw new Error(`Case at line ${start} is too large.`);
    cases.push({ input, expectedOutput, isSample: mode === 'sample' });
    if (cases.length > 100) throw new Error('Import up to 100 test cases at a time.');
    content = [];
  };
  lines.forEach((line, index) => {
    if (/^(sample|hidden)$/i.test(line.trim())) {
      flush();
      mode = line.trim().toLowerCase();
      start = index + 1;
    } else if (mode !== null) content.push(line);
    else if (line.trim())
      throw new Error(`Line ${index + 1}: start each case with sample or hidden.`);
  });
  flush();
  if (!cases.length) throw new Error('No test cases found. Start each case with sample or hidden.');
  return cases;
}
