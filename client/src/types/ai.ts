// AI endpoint shapes. They mirror server/src/ai/contract.ts.

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

export type StudioItem = { q: GeneratedQuestion; report?: ValidationReport; include: boolean; editing: boolean };
