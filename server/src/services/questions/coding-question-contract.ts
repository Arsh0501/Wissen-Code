import { z } from 'zod';
import type { executeCode } from '../execution/judge0';
import { questionContentSchema } from './workflow-schemas';
import { diagnoseQuestionExecution, QuestionExecution } from './question-validation-feedback';

function coreRegion(code: string) {
  const starts = [...code.matchAll(/^([ \t]*)(?:#|\/\/) BEGIN CORE LOGIC[ \t]*\r?$/gm)];
  const ends = [...code.matchAll(/^([ \t]*)(?:#|\/\/) END CORE LOGIC[ \t]*\r?$/gm)];
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0].index! >= ends[0].index! ||
    starts[0][1] !== ends[0][1]
  )
    throw new Error(
      'Starter needs exactly one matching BEGIN CORE LOGIC / END CORE LOGIC region inside its core function. Retry generation.',
    );
  return {
    start: starts[0].index! + starts[0][0].length,
    end: ends[0].index!,
    indent: starts[0][1],
    declaration: code.slice(0, starts[0].index!).trimEnd(),
  };
}

export function validateCoreLogicStarter(code: string, languageId: number, signature: string) {
  const name = signature.match(/^def\s+([A-Za-z_]\w*)\s*\(/)?.[1];
  if (!name) throw new Error('Provide a valid Python core function signature.');
  const region = coreRegion(code);
  if (languageId === 71 && !region.indent)
    throw new Error('The editable Python core region must be indented inside the function.');
  const body = code.slice(region.start, region.end);
  const outside = code.slice(0, region.start) + code.slice(region.end);
  if (!/\bTODO\b/.test(body) || /\bTODO\b/i.test(outside))
    throw new Error(
      'Only the core logic may contain a TODO; implement all driver input/output code.',
    );
  const io: Record<number, RegExp> = {
    71: /\b(?:input|print)\s*\(|\b(?:stdin|stdout)\b/,
    63: /\b(?:readFileSync|readline|console\.log|process\.stdin|process\.stdout)\b/,
    62: /\bSystem\.(?:in|out|err)\b|\b(?:Scanner|BufferedReader)\s*\(/,
    54: /\b(?:cin|cout|scanf|printf|getline)\b/,
  };
  if (!io[languageId])
    throw new Error('Core-logic starters support Python, JavaScript, Java and C++ only.');
  if (io[languageId].test(body))
    throw new Error(
      'Move all input parsing and output printing out of the editable core function.',
    );
  const lastLine = region.declaration.split('\n').pop()!.trim();
  if (
    languageId === 71
      ? lastLine !== signature
      : !new RegExp(`\\b${name}\\s*\\([^;{}]*\\)[^{;]*\\{\\s*$`).test(lastLine)
  )
    throw new Error(
      'Place the editable region immediately inside the documented core function, not inside main or the driver.',
    );
  const driver = code.slice(region.end);
  if (!new RegExp(`\\b${name}\\s*\\(`).test(driver))
    throw new Error('The input/output driver must call the core function.');
  const drivers: Record<number, [RegExp, RegExp]> = {
    71: [/\binput\s*\(|\bstdin\b/, /\bprint\s*\(|\bstdout\b/],
    63: [/readFileSync|readline/, /console\.log|stdout/],
    62: [/System\.in/, /System\.out/],
    54: [/\bcin\b|getline|scanf/, /\bcout\b|printf/],
  };
  if (!drivers[languageId].every((pattern) => pattern.test(outside)))
    throw new Error(
      'Starter must include complete input parsing and output formatting outside the core function.',
    );
  if (
    languageId === 62 &&
    (!/public\s+class\s+Main\b/.test(outside) || !/static\s+void\s+main\s*\(/.test(driver))
  )
    throw new Error('Java starter requires public class Main and a main driver.');
  if (languageId === 54 && !/\bmain\s*\(/.test(driver))
    throw new Error('C++ starter requires a main driver.');
}

export function buildPythonStarterVerification(
  starter: string,
  reference: string,
  signature: string,
) {
  const lines = reference.replace(/\r\n/g, '\n').split('\n');
  const declaration = lines.findIndex((line) => line === signature);
  if (declaration < 0)
    throw new Error('Python reference solution must implement the documented core function.');
  const body: string[] = [];
  for (const line of lines.slice(declaration + 1)) {
    if (line.trim() && !/^[ \t]/.test(line)) break;
    body.push(line);
  }
  const nonempty = body.filter((line) => line.trim());
  if (!nonempty.length)
    throw new Error('Python reference core function must have an implementation.');
  const indent = Math.min(...nonempty.map((line) => line.match(/^[ \t]*/)![0].length));
  const region = coreRegion(starter);
  const implementation = body
    .map((line) => (line.trim() ? region.indent + line.slice(indent) : ''))
    .join('\n')
    .trimEnd();
  return starter.slice(0, region.start) + '\n' + implementation + '\n' + starter.slice(region.end);
}

export async function verifyStarterDrivers(
  question: z.infer<typeof questionContentSchema>,
  execute: typeof executeCode,
) {
  if (question.starterContractVersion !== 2) return { verified: true, executions: [] };
  const executions: QuestionExecution[] = [];
  const signature = question.functionSignature ?? '';
  const starters = question.starterCodes;
  if (
    !starters.some(
      (starter) => starter.languageId === 71 && starter.code === question.starterCodePython,
    )
  )
    throw new Error('Python starter fields must match.');
  for (const starter of starters)
    validateCoreLogicStarter(starter.code, starter.languageId, signature);
  const python = buildPythonStarterVerification(
    question.starterCodePython,
    question.expectedSolutionPython,
    signature,
  );
  // Exercise the actual Python starter driver with a known implementation on every test.
  for (const [index, test] of question.testCases.entries()) {
    executions.push(
      await diagnoseQuestionExecution(
        execute,
        {
          sourceCode: python,
          languageId: 71,
          stdin: test.input,
          expectedOutput: test.expectedOutput,
          cpuTimeLimit: 5,
          memoryLimit: 256000,
        },
        'starter',
        index,
      ),
    );
  }
  // Other language placeholders must compile, parse the sample, call the function and print without errors.
  for (const starter of starters.filter((item) => item.languageId !== 71)) {
    const index = Math.max(
      0,
      question.testCases.findIndex((test) => test.isSample),
    );
    executions.push(
      await diagnoseQuestionExecution(
        execute,
        {
          sourceCode: starter.code,
          languageId: starter.languageId,
          stdin: question.testCases[index].input,
          cpuTimeLimit: 5,
          memoryLimit: 256000,
        },
        'starter',
        index,
      ),
    );
  }
  return { verified: executions.length > 0 && executions.every((run) => run.passed), executions };
}
