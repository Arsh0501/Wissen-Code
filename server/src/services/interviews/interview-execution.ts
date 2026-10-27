import { executeCode } from '../execution/judge0';

export async function runInterviewSamples(
  input: {
    code: string;
    languageId: number;
    stdin?: string;
    question?: {
      questionType: string;
      timeLimit: number;
      memoryLimit: number;
      testCases: { id: number; input: string; expectedOutput: string; isSample: boolean }[];
    } | null;
  },
  execute = executeCode,
) {
  const question = input.question;
  const samples =
    input.stdin === undefined ? (question?.testCases.filter((test) => test.isSample) ?? []) : [];
  const cases = samples.length
    ? samples
    : [{ id: 0, input: input.stdin ?? '', expectedOutput: undefined, isSample: true }];
  const results = [];
  let last;
  for (const test of cases) {
    const sql = question?.questionType === 'sql';
    const result = await execute({
      sourceCode: sql ? `${test.input}\n${input.code}` : input.code,
      languageId: sql ? 82 : input.languageId,
      stdin: sql ? '' : test.input,
      expectedOutput: test.expectedOutput,
      cpuTimeLimit: question?.timeLimit ?? 2,
      memoryLimit: question?.memoryLimit ?? 256000,
    });
    last = result;
    if (test.expectedOutput === undefined) continue;
    const passed =
      result.status.id === 3 && (result.stdout || '').trim() === test.expectedOutput.trim();
    results.push({
      testCaseId: test.id,
      isSample: true,
      input: test.input,
      expectedOutput: test.expectedOutput,
      actualOutput: result.stdout || '',
      passed,
      statusDesc: passed
        ? 'Accepted'
        : result.status.id === 3
          ? 'Wrong Answer'
          : result.status.description,
      executionTime: result.time ? Number(result.time) : null,
      stderr: result.stderr,
      compileOutput: result.compile_output,
    });
  }
  const passedCount = results.filter((test) => test.passed).length;
  return {
    mode: 'run' as const,
    result: last!,
    results,
    passedCount,
    totalCount: results.length,
    failedCount: results.length - passedCount,
  };
}
