// Runs each mock question's Python reference solution against its test cases.
// Usage: npm run db:verify-mock  (requires python3 on PATH)
import { spawnSync } from 'child_process';
import { MOCK_QUESTIONS } from './mock-data';

let failures = 0;
for (const q of MOCK_QUESTIONS) {
  q.testCases.forEach((tc, i) => {
    const run = spawnSync('python3', ['-c', q.solution], { input: tc.input, encoding: 'utf8', timeout: 10000 });
    const actual = (run.stdout || '').trim();
    if (run.status !== 0 || actual !== tc.expectedOutput.trim()) {
      failures++;
      console.log(`✗ ${q.title} — test ${i + 1}: expected ${JSON.stringify(tc.expectedOutput)}, got ${JSON.stringify(actual)} ${run.stderr || ''}`);
    }
  });
}
const total = MOCK_QUESTIONS.reduce((a, q) => a + q.testCases.length, 0);
console.log(failures ? `\n${failures}/${total} test cases FAILED` : `✓ All ${total} test cases match their reference solutions`);
process.exit(failures ? 1 : 0);
