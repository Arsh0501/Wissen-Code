import test from 'node:test';
import assert from 'node:assert/strict';
import { validationComparisons } from '../services/questions/validation-context';

test('validation context stays bounded as the bank grows and prioritizes relevant comparisons', () => {
  const question = {
    title: 'Count negative integers',
    statement: 'Count the negative integers in an array.',
  };
  const rows = Array.from({ length: 500 }, (_, i) => ({
    title: `Graph traversal ${i}`,
    statement: 'Find the shortest path. '.repeat(1000),
  }));
  rows.push({ ...question });
  const selected = validationComparisons(question, rows);
  assert.deepEqual(selected[0], question);
  assert.ok(selected.length <= 8);
  assert.ok(JSON.stringify(selected).length < 4100);
  assert.equal(validationComparisons(question, []).length, 0);
});
