import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTestCaseText } from '../services/questions/test-case-import';
test('parses simple sample/hidden blocks preserving multiline input and whitespace', () => {
  assert.deepEqual(
    parseTestCaseText('\uFEFFsample\r\n3\r\n1 2 3\r\n6\r\nhidden\r\n2\r\n10 20\r\n30\r\n'),
    [
      { input: '3\n1 2 3', expectedOutput: '6', isSample: true },
      { input: '2\n10 20', expectedOutput: '30', isSample: false },
    ],
  );
  assert.deepEqual(parseTestCaseText('hidden\n  x  \n\n  y  \nresult'), [
    { input: '  x  \n\n  y  ', expectedOutput: 'result', isSample: false },
  ]);
});
test('rejects missing markers, incomplete cases, oversized files and too many cases', () => {
  for (const value of ['', '3\n1 2 3\n6', 'sample\n6', 'hidden\n', 'sample\n1\n2\nhidden\n3'])
    assert.throws(() => parseTestCaseText(value));
  assert.throws(() => parseTestCaseText('sample\n' + 'x'.repeat(256001)));
  assert.throws(() => parseTestCaseText('sample\n1\n2\n'.repeat(101)));
});
