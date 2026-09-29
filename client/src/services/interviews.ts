import api from './api';
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

export async function listInterviews(): Promise<Interview[]> {
  const { data } = await api.get('/interviews');
  return data;
}

export async function getInterview(id: number): Promise<Interview> {
  const { data } = await api.get(`/interviews/${id}`);
  return data;
}

export async function createInterview(input: InterviewInput & { candidateName: string }): Promise<Interview> {
  const { data } = await api.post('/interviews', input);
  return data;
}

export async function updateInterview(id: number, input: InterviewInput): Promise<Interview> {
  const { data } = await api.put(`/interviews/${id}`, input);
  return data;
}

export async function deleteInterview(id: number): Promise<void> {
  await api.delete(`/interviews/${id}`);
}

export async function addInterviewQuestion(interviewId: number, input: { prompt: string; section?: string }): Promise<InterviewQuestion> {
  const { data } = await api.post(`/interviews/${interviewId}/questions`, input);
  return data;
}

export async function saveInterviewQuestion(qid: number, input: Partial<Pick<InterviewQuestion, 'prompt' | 'section' | 'answer' | 'code' | 'languageId' | 'notes'>>): Promise<InterviewQuestion> {
  const { data } = await api.put(`/interviews/questions/${qid}`, input);
  return data;
}

export async function deleteInterviewQuestion(qid: number): Promise<void> {
  await api.delete(`/interviews/questions/${qid}`);
}

export async function runInterviewCode(qid: number, input: { code: string; languageId: number; stdin?: string }): Promise<ExecutionResult> {
  const { data } = await api.post(`/interviews/questions/${qid}/run`, input, { timeout: 60_000 });
  return data;
}

export async function observeInterviewAnswer(qid: number): Promise<Observation[]> {
  const { data } = await api.post(`/interviews/questions/${qid}/observe`, undefined, { timeout: 5 * 60 * 1000 });
  return data.observations;
}
