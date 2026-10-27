import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  prepareGeneratedQuestion,
  validateCoreLogicStarter,
  verifyStarterDrivers,
} from '../services/questions/coding-question-contract';

const question = {
  starterContractVersion: 2,
  title: 'Identity function',
  statement: 'Return the given integer unchanged by implementing the core function.',
  difficulty: 'easy',
  questionType: 'coding',
  topics: ['integers'],
  requiredSkills: ['Python'],
  inputFormat: 'A single integer n.',
  outputFormat: 'Print the returned integer.',
  constraints: '-100 <= n <= 100',
  functionSignature: 'def solve(n: int) -> int:',
  starterCodePython:
    'def solve(n: int) -> int:\n    # BEGIN CORE LOGIC\n    # TODO: core logic\n    return 0\n    # END CORE LOGIC\n\nif __name__ == "__main__":\n    n = int(input())\n    print(solve(n))',
  expectedSolutionPython: 'def solve(n: int) -> int:\n    return n\n\nprint(solve(int(input())))',
  solutionExplanation: 'Return the value without modifying it.',
  testCases: [
    { input: '1', expectedOutput: '1', isSample: true },
    { input: '-1', expectedOutput: '-1', isSample: false },
  ],
};
test('Generated questions include input/output sections and a complete core-function starter', () => {
  const result = prepareGeneratedQuestion(question);
  assert.match(result.statement, /## Input format/);
  assert.match(result.statement, /## Output format/);
  assert.match(result.statement, /## Function contract/);
  assert.equal(result.starterCodes[0].code, question.starterCodePython);
  assert.throws(
    () =>
      prepareGeneratedQuestion({
        ...question,
        starterCodePython: 'def solve(n: int) -> int:\n    # TODO\n    pass',
      }),
    /CORE LOGIC|input parsing/,
  );
  assert.throws(
    () => prepareGeneratedQuestion(question, [{ id: 62, name: 'Java' }]),
    /Java starter/,
  );
});

const javascript = `const fs = require('fs');
function solve(n) {
    // BEGIN CORE LOGIC
    // TODO: implement core logic
    return 0;
    // END CORE LOGIC
}
const n = Number(fs.readFileSync(0, 'utf8').trim());
console.log(solve(n));`;
const java = `import java.util.*;
public class Main {
    static int solve(int n) {
        // BEGIN CORE LOGIC
        // TODO: implement core logic
        return 0;
        // END CORE LOGIC
    }
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        int n = scanner.nextInt();
        System.out.println(solve(n));
    }
}`;
const cpp = `#include <iostream>
using namespace std;
int solve(int n) {
    // BEGIN CORE LOGIC
    // TODO: implement core logic
    return 0;
    // END CORE LOGIC
}
int main() {
    int n; cin >> n;
    cout << solve(n) << endl;
    return 0;
}`;

test('every supported language separates core logic from a complete runnable driver', () => {
  for (const [id, code] of [
    [63, javascript],
    [62, java],
    [54, cpp],
  ] as const) {
    validateCoreLogicStarter(code, id, question.functionSignature);
    const callIndex = code.lastIndexOf('solve(n)');
    const missingCall =
      code.slice(0, callIndex) + code.slice(callIndex).replace('solve(n)', 'other(n)');
    assert.throws(
      () => validateCoreLogicStarter(missingCall, id, question.functionSignature),
      /must call/,
    );
    assert.throws(
      () =>
        validateCoreLogicStarter(code + '\n// TODO parse input', id, question.functionSignature),
      /Only the core logic/,
    );
  }
  assert.throws(
    () =>
      validateCoreLogicStarter(
        question.starterCodePython.replace('return 0', 'return int(input())'),
        71,
        question.functionSignature,
      ),
    /Move all input/,
  );
  assert.throws(
    () => prepareGeneratedQuestion({ ...question, expectedSolutionPython: 'print(input())' }),
    /reference solution must implement/,
  );
});

test('real Python starter execution verifies parsing and formatting against all expected outputs', async () => {
  const prepared = prepareGeneratedQuestion(
    {
      ...question,
      starterCodes: [{ languageId: 63, languageName: 'JavaScript', code: javascript }],
    },
    [{ id: 63, name: 'JavaScript' }],
  );
  let pythonRuns = 0,
    jsRuns = 0;
  const execute = (async (input: any) => {
    if (input.languageId === 71) pythonRuns++;
    else jsRuns++;
    const run = spawnSync(
      input.languageId === 71 ? 'python' : process.execPath,
      [input.languageId === 71 ? '-c' : '-e', input.sourceCode],
      { input: input.stdin, encoding: 'utf8', timeout: 10000, windowsHide: true },
    );
    if (run.error) throw run.error;
    return {
      stdout: run.stdout,
      status: { id: run.status === 0 ? 3 : 11, description: run.stderr || 'Completed' },
    };
  }) as any;
  assert.equal((await verifyStarterDrivers(prepared, execute)).verified, true);
  assert.equal(pythonRuns, question.testCases.length);
  assert.equal(jsRuns, 1);
  const broken = {
    ...prepared,
    starterCodePython: prepared.starterCodePython.replace(
      'print(solve(n))',
      'print(str(solve(n)) + " extra")',
    ),
  };
  broken.starterCodes = prepared.starterCodes.map((item) =>
    item.languageId === 71 ? { ...item, code: broken.starterCodePython } : item,
  );
  assert.equal((await verifyStarterDrivers(broken, execute)).verified, false);
});
