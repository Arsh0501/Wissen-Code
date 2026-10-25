import api from './api';
export interface StarterCodeItem {
  languageId: number;
  languageName: string;
  code: string;
}

export interface QuestionContent {
  title: string;
  statement: string;
  inputFormat?: string;
  outputFormat?: string;
  functionSignature?: string;
  starterContractVersion?: 2;
  constraints?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionType: 'coding' | 'debugging';
  topics: string[];
  requiredSkills: string[];
  testCases: { input: string; expectedOutput: string; isSample: boolean }[];
  starterCodePython: string;
  starterCodes?: StarterCodeItem[];
  expectedSolutionPython: string;
  solutionExplanation: string;
}
export interface MCQContent {
  title: string;
  statement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionType: 'mcq';
  topics: string[];
  requiredSkills: string[];
  options: { id: string; text: string }[];
  correctOptionId: string;
  solutionExplanation: string;
}
export interface QuestionDraft {
  id: number;
  content: QuestionContent | MCQContent;
  revision: number;
  status: string;
  questionId: number | null;
  validatedRevision: number | null;
  approvedAt: string | null;
  approvedBy: number | null;
  validation: null | {
    passed: boolean;
    revision: number;
    feedback: string;
    executionVerified: boolean;
    starterVerified?: boolean;
    starterExecutions?: QuestionExecution[];
    fixes?: { field: string; problem: string; action: string }[];
    reviewMode?: 'direct';
    checks: { key: string; passed: boolean; evidence: string }[];
    executions: QuestionExecution[];
  };
}
export interface QuestionExecution {
  index: number;
  passed: boolean;
  status: string;
  languageId?: number;
  stage?: 'reference' | 'starter';
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  details?: string;
  fix?: string;
}
export interface SkillRating {
  skill: string;
  rating: number | null;
  rationale: string;
}
export interface Observation {
  skill: string;
  observation: string;
  evidence: {
    source: 'answer' | 'code' | 'execution' | 'notes';
    quote: string;
  }[];
}
export interface Evaluation {
  id: number;
  questionId: number;
  candidateAnswer: string;
  candidateCode: string;
  notes: string;
  skills: SkillRating[];
  observations: Observation[];
  executionResults: unknown;
  status: 'draft' | 'final';
  revision: number;
}
export async function apiData<T>(
  url: string,
  method: 'get' | 'post' | 'put' | 'delete' = 'get',
  body?: unknown,
): Promise<T> {
  const { data } = await api.request<T>({
    url,
    method,
    data: body,
    timeout: 240000,
  });
  return data;
}
export function retryWorkflowRequest(failureCount: number, error: Error) {
  const value = error as { response?: { status?: number }; code?: string };
  return failureCount < 2 && ([408, 503, 504].includes(value.response?.status ?? 0) || ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(value.code ?? ''));
}
export const workflowKeys = {
  drafts: ['ai-drafts'],
  interviews: ['interviews'],
  evaluations: (id: number) => ['interview-evaluations', id],
};
