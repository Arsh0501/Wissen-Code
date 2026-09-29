import api from './api';

// Typed client for the AI endpoints. Shapes mirror server/src/ai/contract.ts.
// The browser only talks to our backend — never to an AI vendor directly.

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GeneratedQuestion {
  type: 'coding' | 'mcq';
  title: string;
  difficulty: Difficulty;
  topic: string;
  skills: string[];
  tags: string[];
  statement: string;
  testCases: { input: string; expectedOutput: string; isSample: boolean }[];
  starterCode: { python: string; javascript: string; java: string; cpp: string };
  referenceSolution: string;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
  explanation: string;
}

export interface GenerateRequest {
  topic: string;
  difficulty: Difficulty | 'mixed';
  questionType: 'coding' | 'mcq' | 'mixed';
  count: number;
  skills: string[];
  notes?: string;
}

export type CheckKey = 'duplicate' | 'correctness' | 'ambiguity' | 'difficulty' | 'test_cases' | 'solution' | 'edge_cases';
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface ValidationReport {
  verdict: 'pass' | 'warn' | 'fail';
  checks: { key: CheckKey; status: CheckStatus; message: string; details?: string[] }[];
  assessedDifficulty: Difficulty;
  suggestedEdgeCases: { input: string; reason: string }[];
  duplicateOf: { questionId: number; title: string; similarity: number } | null;
  checkedAt: string;
}

export interface PlanSection {
  topic: string;
  minutes: number;
  goals: string;
  questions: string[];
}

export interface InterviewPlanRequest {
  role: string;
  jobRequirements: string;
  candidateExperience: string;
  skills: string[];
  durationMinutes: number;
}

export interface Observation {
  skill: string;
  sentiment: 'positive' | 'neutral' | 'concern';
  observation: string;
  evidence: { source: 'answer' | 'code' | 'execution' | 'notes'; quote: string; detail?: string }[];
}

export async function getAIStatus(): Promise<{ provider: string; canRunCode: boolean }> {
  const { data } = await api.get('/ai/status');
  return data;
}

export async function generateQuestions(req: GenerateRequest): Promise<{ questions: GeneratedQuestion[]; provider: string }> {
  const { data } = await api.post('/ai/questions/generate', req, { timeout: 5 * 60 * 1000 });
  return data;
}

export async function validateQuestions(questions: GeneratedQuestion[]): Promise<ValidationReport[]> {
  const { data } = await api.post('/ai/questions/validate', { questions }, { timeout: 5 * 60 * 1000 });
  return data.reports;
}

export async function planInterview(req: InterviewPlanRequest): Promise<{ sections: PlanSection[]; rationale: string; provider: string }> {
  const { data } = await api.post('/ai/interviews/plan', req, { timeout: 5 * 60 * 1000 });
  return data;
}

// ---- Review queue: AI questions must be approved by a person before use ----

export async function saveDraftsForReview(questions: GeneratedQuestion[], reports?: (ValidationReport | undefined)[]): Promise<{ id: number; title: string; status: string }[]> {
  const { data } = await api.post('/question-review/drafts', { questions, reports });
  return data.questions;
}

export async function revalidateQuestion(id: number): Promise<ValidationReport> {
  const { data } = await api.post(`/question-review/${id}/validate`);
  return data.report;
}

export async function approveQuestion(id: number): Promise<{ status: string; report?: ValidationReport }> {
  const { data } = await api.post(`/question-review/${id}/approve`);
  return data;
}

export async function rejectQuestion(id: number): Promise<void> {
  await api.post(`/question-review/${id}/reject`);
}

export function parseReport(json: string | null | undefined): ValidationReport | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ValidationReport;
  } catch {
    return null;
  }
}
