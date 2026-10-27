import { z } from 'zod';
import type { executeCode } from '../execution/judge0';
import { generatedQuestionSchema, questionContentSchema } from './workflow-schemas';
import { diagnoseQuestionExecution, QuestionExecution } from './question-validation-feedback';

export const CORE_LOGIC_INSTRUCTIONS = `For every coding question, return starterContractVersion: 2, inputFormat, outputFormat, constraints, and functionSignature (the exact Python def line, including its colon). The candidate must implement ONLY the core algorithm inside that function. For Python and every requested language, starter code must be a complete runnable program: a named core function containing a TODO placeholder, all input parsing, a call to the core function, and exact output formatting. Do not leave input/output handling as a TODO and do not include the algorithm or reference solution in starter code. Keep all driver code outside the core function. Explain function parameters and return value, input format, output format, constraints, and sample input/output in the statement. Every sample and hidden test must use the documented format. The Python reference solution must be a full runnable program with the same function signature and driver. Use the same core function name in every language. Inside its body, surround the editable implementation with full-line BEGIN CORE LOGIC and END CORE LOGIC comments (# for Python, // for JavaScript, Java and C++), with a TODO and a type-correct placeholder return between them. Put the BEGIN marker immediately after the function declaration. No TODO or unfinished placeholder is allowed outside that region. All input parsing and output formatting must be fully implemented in the driver outside the core function, including arrays, matrices, booleans and empty values. Java must use public class Main with a main method; C++ must have main; JavaScript must run in Node.js. The Python reference solution must define the exact same core function with a self-contained implementation (no custom helpers outside that function), and contain the imports needed by that implementation. Include those imports in the starter too. Do not use input(), print(), stdin, stdout or their equivalents inside the editable core. For debugging questions, put the intended bug inside the core function and mark its repair with TODO; keep the driver correct.`;

export function prepareGeneratedQuestion(
  raw: unknown,
  requestedLanguages: { id: number; name: string }[] = [{ id: 71, name: 'Python' }],
) {
  const question = generatedQuestionSchema.parse(raw);
  const requestedIds = new Set([...requestedLanguages.map((language) => language.id), 71]);
  const starters = question.starterCodes.filter(
    (starter) => starter.languageId !== 71 && requestedIds.has(starter.languageId),
  );
  if (new Set(starters.map((starter) => starter.languageId)).size !== starters.length)
    throw new Error('Provide exactly one starter per requested language.');
  starters.push({ languageId: 71, languageName: 'Python', code: question.starterCodePython });
  for (const language of requestedLanguages) {
    const starter = starters.find((item) => item.languageId === language.id);
    if (!starter?.code.trim() || !/\bTODO\b/.test(starter.code))
      throw new Error(
        `Generated ${language.name} starter must contain a core-logic TODO and a complete input/output driver. Retry generation.`,
      );
    const drivers: Record<number, [RegExp, RegExp]> = {
      63: [/readFileSync|readline/, /console\.log|stdout/],
      62: [/System\.in/, /System\.out/],
      54: [/\bcin\b|getline|scanf/, /\bcout\b|printf/],
    };
    const driver = drivers[language.id];
    if (driver && !driver.every((pattern) => pattern.test(starter.code)))
      throw new Error(
        `Generated ${language.name} starter is missing its input/output driver. Retry generation.`,
      );
  }
  const languages = [
    ...new Map(
      [...requestedLanguages, { id: 71, name: 'Python' }].map((language) => [
        language.id,
        language,
      ]),
    ).values(),
  ];
  for (const language of languages) {
    const starter = starters.find((item) => item.languageId === language.id)!;
    validateCoreLogicStarter(starter.code, language.id, question.functionSignature);
  }
  buildPythonStarterVerification(
    question.starterCodePython,
    question.expectedSolutionPython,
    question.functionSignature,
  );
  if (
    !question.testCases.some((test) => test.isSample) ||
    !question.testCases.some((test) => !test.isSample)
  )
    throw new Error('Generated questions need sample and hidden tests. Retry generation.');
  let statement = question.statement;
  const sections = [
    [
      'Function contract',
      `Implement \`${question.functionSignature}\`. Only implement the function body between BEGIN CORE LOGIC and END CORE LOGIC. Parameters are already parsed; return the result. The supplied driver reads input, calls your function, and formats output. Do not add input/output code to the function.`,
    ],
    ['Input format', question.inputFormat],
    ['Output format', question.outputFormat],
    ['Constraints', question.constraints],
  ];
  for (const [title, body] of sections) {
    if (!new RegExp(`^#{1,6}\\s+${title}\\b`, 'im').test(statement))
      statement += `\n\n## ${title}\n${body}`;
  }
  return { ...question, starterContractVersion: 2 as const, statement, starterCodes: starters };
}

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
