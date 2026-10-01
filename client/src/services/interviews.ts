import api from './api';
import type { Observation, Interview, InterviewInput, InterviewQuestion, ExecutionResult } from '../types';

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
