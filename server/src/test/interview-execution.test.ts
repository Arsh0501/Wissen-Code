import test from 'node:test';
import assert from 'node:assert/strict';
import { runInterviewSamples } from '../services/interview-execution';

const question = { questionType: 'coding', timeLimit: 2, memoryLimit: 256000, testCases: [
  { id: 1, input: '1 2', expectedOutput: '3', isSample: true },
  { id: 2, input: '2 2', expectedOutput: '4', isSample: true },
  { id: 3, input: 'HIDDEN INPUT', expectedOutput: 'HIDDEN OUTPUT', isSample: false },
] };
test('Run evaluates all sample cases, compares stdout, and excludes hidden tests', async () => {
  const calls: string[] = [];
  const summary = await runInterviewSamples({ code: 'candidate code', languageId: 71, question }, async (input) => {
    calls.push(input.stdin || '');
    return { stdout: '3\n', stderr: null, compile_output: null, message: null, status: { id: 3, description: 'Accepted' }, time: '0.01', memory: 1000 };
  });
  assert.deepEqual(calls, ['1 2', '2 2']);
  assert.equal(summary.passedCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.results[1].statusDesc, 'Wrong Answer');
  assert.equal(JSON.stringify(summary).includes('HIDDEN'), false);
});
test('Custom input produces output without a fabricated test verdict', async () => {
  const summary = await runInterviewSamples({ code: 'code', languageId: 71, question, stdin: 'custom' }, async (input) => {
    assert.equal(input.stdin, 'custom');
    assert.equal(input.expectedOutput, undefined);
    return { stdout: 'result', stderr: null, compile_output: null, message: null, status: { id: 3, description: 'Accepted' }, time: '0.01', memory: 1000 };
  });
  assert.equal(summary.totalCount, 0);
  assert.equal(summary.result.stdout, 'result');
});
