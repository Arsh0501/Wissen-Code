// Interviewer workflow: interviews, their questions and the evaluation
import type { Observation, PlanSection } from './ai';

export type InterviewStatus = 'planned' | 'in_progress' | 'completed';

export type Recommendation = 'strong_hire' | 'hire' | 'no_hire' | 'strong_no_hire' | '';

export interface ExecutionResult {
  status: string;
  stdout: string;
  stderr: string;
  timeSeconds: number | null;
  ranAt?: string;
}

export interface InterviewQuestion {
  id: number;
  interviewId: number;
  orderIndex: number;
  section: string;
  prompt: string;
  answer: string;
  code: string;
  languageId: number;
  executionResult: ExecutionResult | null;
  notes: string;
  aiObservations: Observation[];
}

export interface SkillRating {
  skill: string;
  rating: number; // 1–5, 0 = not assessed
  comment: string;
}

export interface Interview {
  id: number;
  candidateName: string;
  candidateEmail: string;
  role: string;
  jobRequirements: string;
  candidateExperience: string;
  skills: string[];
  durationMinutes: number;
  scheduledAt: string | null;
  status: InterviewStatus;
  plan: PlanSection[];
  skillRatings: SkillRating[];
  recommendation: Recommendation;
  summary: string;
  createdAt: string;
  updatedAt: string;
  questions?: InterviewQuestion[];
  _count?: { questions: number };
}

export type InterviewInput = Partial<Omit<Interview, 'id' | 'createdAt' | 'updatedAt' | 'questions' | '_count'>> & { candidateName?: string };
