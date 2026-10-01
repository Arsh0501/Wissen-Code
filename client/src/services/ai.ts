import api from './api';
import type { GenerateRequest, GeneratedQuestion, ValidationReport, InterviewPlanRequest, PlanSection } from '../types';

// Typed client for the AI endpoints. Shapes live in types/ai.ts and mirror server/src/ai/contract.ts.
// The browser only talks to our backend — never to an AI vendor directly.

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
