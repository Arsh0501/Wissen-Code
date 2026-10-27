import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { normalizeCodingStarter } from '../services/questions/normalize-coding-starters';
import { validateCoreLogicStarter } from '../services/questions/coding-question-contract';

const signature = 'def solve(n: int) -> int:';
const wrappedJava = `import java.util.*;
public class Main {
    // BEGIN CORE LOGIC
    // TODO: implement
    public static int solve(int n) {
        return 0;
    }
    // END CORE LOGIC
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println(solve(scanner.nextInt()));
    }
}`;

test('repairs Java markers wrapped around the core method while keeping its driver intact', () => {
  assert.throws(
    () => validateCoreLogicStarter(wrappedJava, 62, signature),
    /editable region immediately/,
  );
  const normalized = normalizeCodingStarter(wrappedJava, 62, signature);
  validateCoreLogicStarter(normalized, 62, signature);
  assert.match(normalized, /public static int solve\(int n\) \{\n        \/\/ BEGIN CORE LOGIC/);
  assert.ok(
    normalized.endsWith(wrappedJava.slice(wrappedJava.indexOf('    public static void main'))),
  );
  assert.equal(normalizeCodingStarter(normalized, 62, signature), normalized);
  const allman = wrappedJava.replace('solve(int n) {', 'solve(int n)\n    {');
  validateCoreLogicStarter(normalizeCodingStarter(allman, 62, signature), 62, signature);
});

test('normalization preserves JavaScript behavior and ignores braces inside strings and comments', () => {
  const wrapped = `const fs = require('fs');
// BEGIN CORE LOGIC
// TODO: implement
function solve(n) {
    const label = "}"; // a comment containing {
    if (n > 0) { return label.length; }
    return 0;
}
// END CORE LOGIC
console.log(solve(Number(fs.readFileSync(0, 'utf8'))));`;
  const normalized = normalizeCodingStarter(wrapped, 63, signature);
  validateCoreLogicStarter(normalized, 63, signature);
  const run = (code: string, input: string) => {
    const output: unknown[] = [];
    vm.runInNewContext(code, {
      require: () => ({ readFileSync: () => input }),
      console: { log: (value: unknown) => output.push(value) },
    });
    return output;
  };
  assert.deepEqual(run(normalized, '3'), run(wrapped, '3'));
  assert.deepEqual(run(normalized, '0'), run(wrapped, '0'));
});

test('does not repair driver regions, multiple regions or executable code around the method', () => {
  for (const malformed of [
    wrappedJava.replace('int solve(int n)', 'int main(int n)'),
    wrappedJava.replace('public static int solve(int n) {', 'if (solve(n)) {'),
    wrappedJava.replace('// TODO: implement', 'static int outside = 1;\n    // TODO: implement'),
    wrappedJava.replace(
      '    // END CORE LOGIC',
      '    System.out.println("driver");\n    // END CORE LOGIC',
    ),
    wrappedJava + '\n// BEGIN CORE LOGIC\n// END CORE LOGIC',
  ]) {
    assert.equal(normalizeCodingStarter(malformed, 62, signature), malformed);
    assert.throws(() => validateCoreLogicStarter(malformed, 62, signature));
  }
});

test('repairs a method-wrapped C++ region without moving its input/output driver', () => {
  const wrapped = `#include <iostream>
// BEGIN CORE LOGIC
// TODO: implement
int solve(int n) {
    return 0;
}
// END CORE LOGIC
int main() {
    int n; std::cin >> n;
    std::cout << solve(n);
}`;
  const normalized = normalizeCodingStarter(wrapped, 54, signature);
  validateCoreLogicStarter(normalized, 54, signature);
  assert.ok(normalized.endsWith(wrapped.slice(wrapped.indexOf('int main()'))));
});

test('leaves Python starters unchanged', () => {
  const python =
    'def solve(n: int) -> int:\n    # BEGIN CORE LOGIC\n    # TODO: implement\n    return 0\n    # END CORE LOGIC\nprint(solve(int(input())))';
  assert.equal(normalizeCodingStarter(python, 71, signature), python);
});
