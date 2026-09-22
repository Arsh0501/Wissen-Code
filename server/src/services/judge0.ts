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

/**
 * Submit code to Judge0 CE and wait for the result.
 * Uses ?wait=true for synchronous execution (simpler for demo).
 */
export async function executeCode(params: {
  sourceCode: string;
  languageId: number;
  stdin?: string;
  cpuTimeLimit?: number;
  memoryLimit?: number;
}): Promise<Judge0Result> {
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
