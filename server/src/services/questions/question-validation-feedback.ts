import type { executeCode } from '../execution/judge0';

export type QuestionExecution = {
  index: number;
  languageId: number;
  stage: 'reference' | 'starter';
  passed: boolean;
  status: string;
  input: string;
  expectedOutput?: string;
  actualOutput: string;
  details: string;
  fix: string;
};
export type QuestionFix = { field: string; problem: string; action: string };
const excerpt = (text: string | null | undefined, limit = 2000) =>
  (text ?? '').length > limit ? `${text!.slice(0, limit)}\n… (truncated)` : (text ?? '');

export async function diagnoseQuestionExecution(
  execute: typeof executeCode,
  input: Parameters<typeof executeCode>[0],
  stage: QuestionExecution['stage'],
  index: number,
): Promise<QuestionExecution> {
  const context = {
    index,
    languageId: input.languageId,
    stage,
    input: excerpt(input.stdin),
    ...(input.expectedOutput !== undefined
      ? { expectedOutput: excerpt(input.expectedOutput) }
      : {}),
  };
  try {
    const run = await execute(input);
    const mismatch =
      run.status.id === 3 &&
      input.expectedOutput !== undefined &&
      (run.stdout ?? '').trim() !== input.expectedOutput.trim();
    const passed = run.status.id === 3 && !mismatch;
    const status = mismatch ? 'Output mismatch' : run.status.description;
    let fix = '';
    if (mismatch)
      fix =
        stage === 'reference'
          ? 'Recalculate this test from the problem statement. If the expected output is correct, fix the reference algorithm; otherwise correct the test output and its explanation. Do not copy the actual output without checking it.'
          : 'Check the starter driver: parse all arguments in the documented order, call the core function, and format its return value exactly as expected. Remove extra labels or debug prints. If the reference test also fails, check its expected answer and algorithm first.';
    else if (!passed && run.status.id === 6)
      fix = `Fix the compiler error below in the ${stage === 'starter' ? 'starter code' : 'reference solution'}. Check imports, types, function signature and entry point${input.languageId === 62 ? ' (Java must use public class Main)' : ''}.`;
    else if (!passed && run.status.id === 5)
      fix =
        'Check the reference algorithm and driver for infinite loops or excessive work. Confirm the documented input is parsed correctly and the algorithm meets the constraints.';
    else if (!passed && run.status.id === 13)
      fix =
        'The judge reported an internal error. Check the execution service and retry; this result does not establish that the question is incorrect.';
    else if (!passed)
      fix = `Use the error details below to fix the ${stage === 'starter' ? 'starter driver and type-correct placeholder return' : 'reference solution'}. Check empty inputs, missing values, array bounds and conversions against the documented format.`;
    return {
      ...context,
      passed,
      status,
      actualOutput: excerpt(run.stdout),
      details: excerpt([run.compile_output, run.stderr, run.message].filter(Boolean).join('\n')),
      fix,
    };
  } catch (error) {
    return {
      ...context,
      passed: false,
      status: 'Execution service unavailable',
      actualOutput: '',
      details: excerpt((error as Error).message),
      fix: 'Check the judge service connection and credentials, then retry validation. A service failure is not evidence that the question or starter is incorrect.',
    };
  }
}

const actions: Record<string, [string, string]> = {
  duplicate: [
    'Title and statement',
    'Compare the reported matching questions. Remove this duplicate or write a distinct problem; changing only the title does not resolve a duplicated statement.',
  ],
  correctness: [
    'Problem statement and solution',
    'Resolve the contradiction identified in the evidence. Recalculate examples, update the reference algorithm and make the statement and expected outputs agree.',
  ],
  ambiguity: [
    'Statement, input/output format and constraints',
    'Specify the missing rules identified in the evidence: parameter types, indexing, allowed values, edge behavior and the required return value.',
  ],
  difficulty: [
    'Difficulty and constraints',
    'Adjust the difficulty or problem constraints to match the required algorithm described in the evidence.',
  ],
  testCases: [
    'Test cases',
    'Correct the reported test inputs or expected outputs. Include at least one sample and one hidden test, both using the documented format.',
  ],
  expectedSolution: [
    'Expected Python solution',
    'Correct the reference implementation for the failed cases and keep its signature and input/output contract consistent with the starter.',
  ],
  edgeCases: [
    'Test cases and reference solution',
    'Add and verify the boundary cases identified in the evidence, including minimum size, repeated values and empty inputs where permitted.',
  ],
};
export function questionValidationFixes(
  checks: { key: string; passed: boolean; evidence: string }[],
  options: { starterError?: string; mock?: boolean } = {},
): QuestionFix[] {
  const fixes = checks
    .filter((check) => !check.passed)
    .map((check) => ({
      field: actions[check.key]?.[0] ?? check.key,
      problem: check.evidence,
      action:
        actions[check.key]?.[1] ?? 'Resolve the reported issue, save edits and validate again.',
    }));
  if (options.starterError)
    fixes.push({
      field: 'Starter code and function signature',
      problem: options.starterError,
      action:
        'Use the same documented function signature, keep BEGIN CORE LOGIC / END CORE LOGIC around only the algorithm, and fully implement parsing, the function call and output formatting outside that region. Keep both Python starter fields identical.',
    });
  if (options.mock)
    fixes.push({
      field: 'Execution service',
      problem: 'Real execution checks are unavailable in mock judge mode.',
      action:
        'Configure a live judge on the backend, then run validation again. Mock results cannot verify a solution or starter.',
    });
  return fixes;
}
