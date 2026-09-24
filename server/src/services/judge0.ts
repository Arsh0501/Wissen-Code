import axios from 'axios';

const JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'https://ce.judge0.com';

// Language ID mapping for Judge0 CE
export const LANGUAGE_MAP: Record<string, { id: number; name: string; monacoLang: string }> = {
  python: { id: 71, name: 'Python (3.8.1)', monacoLang: 'python' },
  java: { id: 62, name: 'Java (OpenJDK 13.0.1)', monacoLang: 'java' },
  cpp: { id: 54, name: 'C++ (GCC 9.2.0)', monacoLang: 'cpp' },
  javascript: { id: 63, name: 'JavaScript (Node.js 12.14.0)', monacoLang: 'javascript' },
};

export function getLanguageById(langId: number) {
  return Object.values(LANGUAGE_MAP).find((l) => l.id === langId);
}

interface Judge0Submission {
  source_code: string;
  language_id: number;
  stdin?: string;
  cpu_time_limit?: number;
  memory_limit?: number;
}

export interface Judge0Result {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  status: {
    id: number;
    description: string;
  };
  time: string | null;
  memory: number | null;
}

export function isMockMode() {
  return (process.env.JUDGE_MODE || 'live').toLowerCase() === 'mock';
}

// Markers left in starter code that mean the candidate hasn't solved the problem yet
const UNSOLVED_PATTERNS = [
  /^\s*pass\s*$/m,
  /\bTODO\b/,
  /return new int\[\]\{0, 0\};/,
  /return \[0, 0\];/,
];

// Checks (), [] and {} balance, ignoring string literals and line comments
function hasUnbalancedBrackets(code: string): boolean {
  const stripped = code
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/#(?!include).*$/gm, '');
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: string[] = [];
  for (const ch of stripped) {
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch in pairs && stack.pop() !== pairs[ch]) return true;
  }
  return stack.length > 0;
}

function pseudoRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

/**
 * Simulated Judge0 response for demos (JUDGE_MODE=mock). Code is never executed:
 * unbalanced brackets → compile/runtime error, untouched starter code → wrong answer,
 * anything else → accepted with the expected output.
 */
function mockExecute(params: {
  sourceCode: string;
  languageId: number;
  stdin?: string;
  expectedOutput?: string;
}): Judge0Result {
  const r = pseudoRandom(params.sourceCode + (params.stdin || ''));
  const base = { time: (0.01 + r * 0.15).toFixed(3), memory: 3000 + Math.floor(r * 9000), message: null };
  const isCompiled = params.languageId === 62 || params.languageId === 54;

  if (!params.sourceCode.trim()) {
    return { ...base, stdout: null, stderr: 'No code submitted', compile_output: null, status: { id: 11, description: 'Runtime Error (NZEC)' } };
  }
  if (hasUnbalancedBrackets(params.sourceCode)) {
    return isCompiled
      ? { ...base, stdout: null, stderr: null, compile_output: 'error: expected closing bracket (mock judge)', status: { id: 6, description: 'Compilation Error' } }
      : { ...base, stdout: null, stderr: 'SyntaxError: unexpected EOF while parsing (mock judge)', compile_output: null, status: { id: 11, description: 'Runtime Error (NZEC)' } };
  }
  if (params.expectedOutput === undefined) {
    return {
      ...base,
      stdout: '[mock judge] Program ran successfully.\nSet JUDGE_MODE=live in server/.env to see real program output.\n',
      stderr: null, compile_output: null, status: { id: 3, description: 'Accepted' },
    };
  }
  if (UNSOLVED_PATTERNS.some((p) => p.test(params.sourceCode))) {
    return { ...base, stdout: '', stderr: null, compile_output: null, status: { id: 4, description: 'Wrong Answer' } };
  }
  return { ...base, stdout: params.expectedOutput, stderr: null, compile_output: null, status: { id: 3, description: 'Accepted' } };
}

/**
 * Submit code to Judge0 CE and wait for the result.
 * Uses ?wait=true for synchronous execution (simpler for demo).
 * `expectedOutput` is only used by the mock judge.
 */
export async function executeCode(params: {
  sourceCode: string;
  languageId: number;
  stdin?: string;
  cpuTimeLimit?: number;
  memoryLimit?: number;
  expectedOutput?: string;
}): Promise<Judge0Result> {
  if (isMockMode()) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return mockExecute(params);
  }

  const submission: Judge0Submission = {
    source_code: Buffer.from(params.sourceCode).toString('base64'),
    language_id: params.languageId,
    stdin: params.stdin ? Buffer.from(params.stdin).toString('base64') : undefined,
    cpu_time_limit: params.cpuTimeLimit || 5,
    memory_limit: params.memoryLimit || 256000,
  };

  try {
    const response = await axios.post(
      `${JUDGE0_API_URL}/submissions?base64_encoded=true&wait=true`,
      submission,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30s timeout
      }
    );

    const data = response.data;

    // Decode base64 outputs
    return {
      stdout: data.stdout ? Buffer.from(data.stdout, 'base64').toString() : null,
      stderr: data.stderr ? Buffer.from(data.stderr, 'base64').toString() : null,
      compile_output: data.compile_output
        ? Buffer.from(data.compile_output, 'base64').toString()
        : null,
      message: data.message ? Buffer.from(data.message, 'base64').toString() : null,
      status: data.status,
      time: data.time,
      memory: data.memory,
    };
  } catch (error: any) {
    // If Judge0 returns a 4xx/5xx, try to extract the error
    if (error.response) {
      throw new Error(
        `Judge0 API error (${error.response.status}): ${JSON.stringify(error.response.data)}`
      );
    }
    throw new Error(`Judge0 API unreachable: ${error.message}`);
  }
}
