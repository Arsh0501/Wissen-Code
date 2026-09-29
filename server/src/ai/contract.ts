import * as z from 'zod/v4';

/**
 * AI API contract — the request/response shapes shared by the frontend and the AI backend.
 *
 * The frontend only ever calls our own /api/ai/* endpoints (never an AI vendor directly).
 * Those endpoints validate requests with these schemas and delegate to an AIProvider
 * (see provider.ts). The provider owner implements the same interface with real model calls;
 * nothing else needs to change.
 */

export const Difficulty = z.enum(['easy', 'medium', 'hard']);
export const QuestionType = z.enum(['coding', 'mcq']);

// ── Question generation ──────────────────────────────────────────────

export const GenerateQuestionsRequest = z.object({
  topic: z.string().trim().min(2).max(120),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  questionType: z.enum(['coding', 'mcq', 'mixed']),
  count: z.number().int().min(1).max(10),
  skills: z.array(z.string().trim().min(1).max(60)).max(15),
  notes: z.string().max(1000).optional(), // extra guidance for the generator
});
export type GenerateQuestionsRequest = z.infer<typeof GenerateQuestionsRequest>;

export const TestCase = z.object({
  input: z.string().max(20_000),
  expectedOutput: z.string().max(20_000),
  isSample: z.boolean(),
});

export const McqOption = z.object({ id: z.string().min(1).max(10), text: z.string().min(1).max(2000) });

/** One generated question. Coding fields are empty for MCQ and vice versa. */
export const GeneratedQuestion = z.object({
  type: QuestionType,
  title: z.string().trim().min(1).max(200),
  difficulty: Difficulty,
  topic: z.string().max(120),
  skills: z.array(z.string().max(60)).max(15),
  tags: z.array(z.string().max(40)).max(10),
  statement: z.string().min(1).max(20_000), // Markdown
  // coding
  testCases: z.array(TestCase).max(40),
  starterCode: z.object({
    python: z.string().max(20_000),
    javascript: z.string().max(20_000),
    java: z.string().max(20_000),
    cpp: z.string().max(20_000),
  }),
  referenceSolution: z.string().max(20_000), // Python 3, stdin → stdout
  // mcq
  options: z.array(McqOption).max(8),
  correctOptionIds: z.array(z.string()).max(8),
  explanation: z.string().max(4000),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

export interface GenerateQuestionsResponse {
  questions: GeneratedQuestion[];
  provider: string;
}

// ── Question validation ──────────────────────────────────────────────

export const ValidateQuestionsRequest = z.object({
  questions: z.array(GeneratedQuestion).min(1).max(10),
});

export type CheckKey = 'duplicate' | 'correctness' | 'ambiguity' | 'difficulty' | 'test_cases' | 'solution' | 'edge_cases';
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface ValidationCheck {
  key: CheckKey;
  status: CheckStatus;
  message: string;
  details?: string[];
}

export interface ValidationReport {
  verdict: 'pass' | 'warn' | 'fail'; // worst check status
  checks: ValidationCheck[];
  assessedDifficulty: z.infer<typeof Difficulty>;
  suggestedEdgeCases: { input: string; reason: string }[];
  duplicateOf: { questionId: number; title: string; similarity: number } | null;
  checkedAt: string;
}

/** The judgement-based part of validation that the AI provider supplies. */
export interface AIQuestionReview {
  correctness: { status: CheckStatus; message: string; details?: string[] };
  ambiguity: { status: CheckStatus; message: string; details?: string[] };
  assessedDifficulty: z.infer<typeof Difficulty>;
  suggestedEdgeCases: { input: string; reason: string }[];
}

// ── Interview planning ───────────────────────────────────────────────

export const InterviewPlanRequest = z.object({
  role: z.string().trim().max(120),
  jobRequirements: z.string().max(8000),
  candidateExperience: z.string().max(8000),
  skills: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
  durationMinutes: z.number().int().min(10).max(240),
});
export type InterviewPlanRequest = z.infer<typeof InterviewPlanRequest>;

export const PlanSection = z.object({
  topic: z.string().trim().min(1).max(80),
  minutes: z.number().int().min(1).max(240),
  goals: z.string().max(1000),
  questions: z.array(z.string().max(1000)).max(10),
});
export type PlanSection = z.infer<typeof PlanSection>;

export interface InterviewPlanResponse {
  sections: PlanSection[];
  rationale: string;
  provider: string;
}

// ── Interview observations ───────────────────────────────────────────

export const ObservationsRequest = z.object({
  skills: z.array(z.string().max(60)).max(12),
  question: z.string().max(4000),
  answer: z.string().max(20_000),
  code: z.string().max(40_000),
  language: z.string().max(40),
  executionResult: z
    .object({ status: z.string(), stdout: z.string(), stderr: z.string(), timeSeconds: z.number().nullable() })
    .nullable(),
  notes: z.string().max(8000),
});
export type ObservationsRequest = z.infer<typeof ObservationsRequest>;

export interface ObservationEvidence {
  source: 'answer' | 'code' | 'execution' | 'notes';
  quote: string; // verbatim excerpt from the source
  detail?: string; // e.g. "line 4"
}

export interface Observation {
  skill: string;
  sentiment: 'positive' | 'neutral' | 'concern';
  observation: string;
  evidence: ObservationEvidence[]; // every observation must cite at least one piece of evidence
}

export interface ObservationsResponse {
  observations: Observation[];
  provider: string;
}
