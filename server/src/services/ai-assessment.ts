import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { executeCode, isMockMode } from './judge0';

// Tailored question generation from a candidate's resume. Questions are written
// fresh by Claude for each resume — they are not picked from the question bank.

const MODEL = 'claude-opus-5';

export const MIN_QUESTIONS = 2;
export const MAX_QUESTIONS = 5;

const TestCaseSchema = z.object({
  input: z.string(),
  expected_output: z.string(),
  is_sample: z.boolean(),
});

const GeneratedQuestionSchema = z.object({
  title: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()),
  rationale: z.string(),
  statement: z.string(),
  test_cases: z.array(TestCaseSchema),
  starter_code_python: z.string(),
  starter_code_javascript: z.string(),
  starter_code_java: z.string(),
  starter_code_cpp: z.string(),
  reference_solution_python: z.string(),
});

const CandidateProfileSchema = z.object({
  name: z.string(),
  experience_level: z.enum(['intern', 'junior', 'mid', 'senior', 'staff']),
  years_of_experience: z.number(),
  primary_languages: z.array(z.string()),
  skills: z.array(z.string()),
  summary: z.string(),
});

const GenerationSchema = z.object({
  candidate: CandidateProfileSchema,
  questions: z.array(GeneratedQuestionSchema),
  suggested_time_minutes: z.number(),
});

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export type Verification =
  | { status: 'verified'; dropped: number }
  | { status: 'unverified'; reason: string }
  | { status: 'failed'; reason: string };

export interface PreviewQuestion extends GeneratedQuestion {
  verification: Verification;
}

export interface GenerationPreview {
  candidate: CandidateProfile;
  questions: PreviewQuestion[];
  suggested_time_minutes: number;
  model: string;
}

export class AIError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM_PROMPT = `You design coding assessments for a hiring platform. Given a candidate's resume, you write NEW programming problems tailored to that candidate, which the platform will run as a timed, auto-graded test.

How the platform grades code — every problem must fit this exactly:
- The candidate writes a complete program that reads from standard input and prints to standard output.
- Each test case gives the full stdin; the program's stdout, trimmed of leading/trailing whitespace, must equal the expected output exactly. So every input must have exactly one correct output: specify ordering, formatting, separators, and tie-breaking rules precisely. Avoid floating-point output unless you fix the rounding (e.g. "print with exactly 2 decimal places").
- Supported languages: Python, JavaScript (Node.js), Java (class Main), C++.

Tailoring:
- Infer the candidate's experience level, main languages and domains from the resume, and pitch difficulty accordingly (interns/juniors mostly easy–medium, seniors medium–hard).
- Draw scenarios from the kinds of systems the candidate has worked on (e.g. log processing for a backend engineer, event scheduling for someone who built booking systems), but test general problem-solving and data-structure skill — never knowledge of a specific company, framework or API.
- Write original problems. Do not reuse well-known problems (Two Sum, Valid Parentheses, etc.) or their statements.
- In "rationale", explain in 1–2 sentences which part of the resume the problem probes and why.

Each problem:
- "statement": Markdown with a short scenario, the task, an **Input** section (exact stdin format, line by line), an **Output** section (exact stdout format), a **Constraints** section, and one worked example.
- "test_cases": 2 sample cases (is_sample: true) followed by 4–6 hidden cases (is_sample: false) that cover edge cases (minimum sizes, duplicates, boundaries, large values within constraints). Keep inputs small enough to type by hand — under 30 lines each.
- Compute every expected_output by carefully tracing your reference solution on that input. Correctness of expected outputs matters more than anything else; if a case is hard to compute by hand, replace it with a simpler one.
- "reference_solution_python": a complete, correct Python 3 program (stdin → stdout) solving the problem within the constraints.
- Starter code for each language: a runnable program skeleton that reads the input in the documented format and leaves a clearly marked TODO where the logic goes. It must not contain the solution. Java starter code must use "public class Main".
- "tags": 2–4 short lowercase topic tags (e.g. "hash-map", "sorting", "graphs").

"suggested_time_minutes": a realistic total time for all problems together (multiple of 5).
If the resume does not state a name, use "Candidate".`;

/**
 * Asks Claude to read the resume and write tailored questions, then verifies the
 * AI-written test cases against the AI's own reference solution when a real judge is available.
 */
export async function generateFromResume(params: {
  resumePdfBase64?: string;
  resumeText?: string;
  questionCount: number;
  focus?: string;
}): Promise<GenerationPreview> {
  if (!isAIConfigured()) {
    throw new AIError('AI is not configured. Add ANTHROPIC_API_KEY to server/.env and restart the server.', 503, 'AI_NOT_CONFIGURED');
  }

  const resumeBlock: Anthropic.Beta.BetaContentBlockParam = params.resumePdfBase64
    ? {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: params.resumePdfBase64 },
        title: 'Candidate resume',
      }
    : {
        type: 'document',
        source: { type: 'text', media_type: 'text/plain', data: params.resumeText ?? '' },
        title: 'Candidate resume',
      };

  const instructions = [
    `Write exactly ${params.questionCount} problems for this candidate.`,
    params.focus?.trim() ? `The hiring team is assessing them for this role or focus: ${params.focus.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const client = new Anthropic({ timeout: 10 * 60 * 1000 });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: betaZodOutputFormat(GenerationSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [resumeBlock, { type: 'text', text: instructions }] }],
    });
  } catch (error) {
    throw mapAnthropicError(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new AIError('The AI declined to process this resume. Try a different file or paste the resume as text.', 422, 'AI_REFUSED');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AIError('The AI response was too long. Try generating fewer questions.', 502, 'AI_TRUNCATED');
  }
  const parsed = response.parsed_output;
  if (!parsed || parsed.questions.length === 0) {
    throw new AIError('The AI returned an unexpected response. Please try again.', 502, 'AI_BAD_OUTPUT');
  }

  const questions = await Promise.all(
    parsed.questions.slice(0, params.questionCount).map(async (q) => {
      const cleaned = { ...q, test_cases: q.test_cases.filter((t) => t.input.trim() !== '' || t.expected_output.trim() !== '') };
      return verifyQuestion(cleaned);
    })
  );

  return {
    candidate: parsed.candidate,
    questions,
    suggested_time_minutes: roundTime(parsed.suggested_time_minutes),
    model: response.model,
  };
}

function roundTime(minutes: number): number {
  const m = Math.round(minutes / 5) * 5;
  return Math.min(240, Math.max(15, Number.isFinite(m) ? m : 60));
}

/**
 * Runs the AI's reference solution on every test case through the judge and drops
 * cases whose expected output disagrees. Mock mode can't execute code, so questions stay unverified.
 */
async function verifyQuestion(q: GeneratedQuestion): Promise<PreviewQuestion> {
  if (isMockMode()) {
    return { ...q, verification: { status: 'unverified', reason: 'Mock judge is on, so test cases could not be run. Review them before publishing.' } };
  }

  const results = await Promise.all(
    q.test_cases.map(async (tc) => {
      try {
        const r = await executeCode({ sourceCode: q.reference_solution_python, languageId: 71, stdin: tc.input });
        return r.status.id === 3 && (r.stdout ?? '').trim() === tc.expected_output.trim();
      } catch {
        return false;
      }
    })
  );

  const kept = q.test_cases.filter((_, i) => results[i]);
  const dropped = q.test_cases.length - kept.length;
  if (!kept.some((t) => t.is_sample) || kept.length < 3) {
    return {
      ...q,
      test_cases: kept,
      verification: { status: 'failed', reason: `Only ${kept.length} of ${q.test_cases.length} test cases matched the reference solution.` },
    };
  }
  return { ...q, test_cases: kept, verification: { status: 'verified', dropped } };
}

function mapAnthropicError(error: unknown): AIError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AIError('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in server/.env.', 503, 'AI_AUTH');
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AIError('The Anthropic API key does not have access to this model.', 503, 'AI_PERMISSION');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AIError('The AI service is busy (rate limited). Please wait a minute and try again.', 429, 'AI_RATE_LIMIT');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AIError(`The AI could not read this resume: ${error.message}`, 400, 'AI_BAD_REQUEST');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIConnectionError) {
    return new AIError('Could not reach the AI service. Check your internet connection and try again.', 502, 'AI_CONNECTION');
  }
  if (error instanceof Anthropic.APIError) {
    return new AIError(`The AI service returned an error (${error.status}). Please try again.`, 502, 'AI_API_ERROR');
  }
  console.error('Unexpected AI error:', error);
  return new AIError('Something went wrong while generating questions.', 500, 'AI_UNKNOWN');
}
