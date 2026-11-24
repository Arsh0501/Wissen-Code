import { expect, it } from 'vitest';
import { questionSections } from './questionSections';

it('groups introductory text, bold labels and markdown headings without splitting fenced code', () => {
  const sections = questionSections(
    'Find the best result.\n\n**Function Signature**\\\n```python\n# Keep this code comment\ndef solve():\n    pass\n```\n\n## Function contract\nReturn an integer.\n\nInput format\nOne integer.',
  );
  expect(sections.map((section) => section.title)).toEqual([
    'Question',
    'Function Signature',
    'Function contract',
    'Input format',
  ]);
  expect(sections[1].body).toContain('# Keep this code comment');
  expect(sections[1].body).toContain('def solve():');
  expect(sections[2].body).toContain('Return an integer.');
});
