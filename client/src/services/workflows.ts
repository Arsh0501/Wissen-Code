import api from './api';
export interface QuestionContent {
  title: string;
  statement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionType: 'coding' | 'debugging';
  topics: string[];
  requiredSkills: string[];
  testCases: { input: string; expectedOutput: string; isSample: boolean }[];
  starterCodePython: string;
  expectedSolutionPython: string;
  solutionExplanation: string;
}
export interface QuestionDraft {
  id: number;
  content: QuestionContent;
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
    checks: { key: string; passed: boolean; evidence: string }[];
    executions: { index: number; passed: boolean; status: string }[];
  };
}
export interface PlanSection {
  skill: string;
  minutes: number;
  objective: string;
  questions: string[];
  followUps: string[];
}
export interface PlanInput {
  jobRequirements: string;
  candidateExperience: string;
  requiredSkills: string[];
  durationMinutes: number;
}
export interface InterviewPlan extends PlanInput {
  id: number;
  sections: PlanSection[];
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
  method: 'get' | 'post' | 'put' = 'get',
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
export const workflowKeys = {
  drafts: ['ai-drafts'],
  interviews: ['interviews'],
  plan: (id: number) => ['interview-plan', id],
  evaluations: (id: number) => ['interview-evaluations', id],
};
