import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseQuestionExecution, questionValidationFixes } from '../services/question-validation-feedback';

test('output mismatches identify the exact test and explain which fields need review', async () => {
  const result = await diagnoseQuestionExecution((async () => ({ status: { id: 3, description: 'Accepted' }, stdout: '3\n' })) as any,
    { sourceCode: 'fixture', languageId: 71, stdin: '5\n1 100 1 1 1', expectedOutput: '4' }, 'reference', 0);
  assert.equal(result.passed, false);
  assert.equal(result.status, 'Output mismatch');
  assert.equal(result.expectedOutput, '4');
  assert.equal(result.actualOutput, '3\n');
  assert.match(result.fix, /Recalculate this test/);
  assert.match(result.fix, /Do not copy the actual output/);
});

test('compiler problems and unavailable judges have different repair guidance', async () => {
  const compiler = await diagnoseQuestionExecution((async () => ({ status: { id: 6, description: 'Compilation Error' }, stdout: '', compile_output: 'Main.java:7: missing return statement' })) as any,
    { sourceCode: 'fixture', languageId: 62, stdin: '1' }, 'starter', 0);
  assert.match(compiler.details, /Main.java:7/);
  assert.match(compiler.fix, /compiler error/);
  const service = await diagnoseQuestionExecution((async () => { throw new Error('Connection timed out'); }) as any,
    { sourceCode: 'fixture', languageId: 71 }, 'starter', 0);
  assert.equal(service.status, 'Execution service unavailable');
  assert.match(service.fix, /not evidence/);
  const fixes = questionValidationFixes([{ key: 'ambiguity', passed: false, evidence: 'Indexing is unspecified.' }], { starterError: 'Missing core region.' });
  assert.match(fixes[0].action, /indexing/);
  assert.match(fixes[1].action, /BEGIN CORE LOGIC/);
});
