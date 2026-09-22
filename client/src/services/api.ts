import axios from 'axios';
import type {
  Question,
  Assessment,
  RunCodeResponse,
  SubmissionResult,
  Language,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inject role headers from localStorage
api.interceptors.request.use((config) => {
  const role = localStorage.getItem('wissen-role') || 'examinee';
  const name = localStorage.getItem('wissen-name') || 'Anonymous';
  config.headers['x-role'] = role;
  config.headers['x-candidate-name'] = name;
  return config;
});

// ---- Questions ----

export async function getQuestions(): Promise<Question[]> {
  const { data } = await api.get('/questions');
  return data;
}

export async function getQuestion(id: number): Promise<Question> {
  const { data } = await api.get(`/questions/${id}`);
  return data;
}

export async function createQuestion(question: Partial<Question> & {
  starterCodes?: { languageId: number; languageName: string; code: string }[];
  testCases?: { input: string; expectedOutput: string; isSample: boolean }[];
}): Promise<Question> {
  const { data } = await api.post('/questions', question);
  return data;
}

export async function updateQuestion(id: number, question: Partial<Question>): Promise<Question> {
  const { data } = await api.put(`/questions/${id}`, question);
  return data;
}

export async function deleteQuestion(id: number): Promise<void> {
  await api.delete(`/questions/${id}`);
}

// ---- Test Cases ----

export async function addTestCases(
  questionId: number,
  testCases: { input: string; expectedOutput: string; isSample: boolean }[]
): Promise<void> {
  await api.post(`/questions/${questionId}/testcases`, { testCases });
}

export async function updateTestCase(
  tcId: number,
  data: { input?: string; expectedOutput?: string; isSample?: boolean }
): Promise<void> {
  await api.put(`/questions/testcases/${tcId}`, data);
}

export async function deleteTestCase(tcId: number): Promise<void> {
  await api.delete(`/questions/testcases/${tcId}`);
}

// ---- Starter Code ----

export async function saveStarterCode(
  questionId: number,
  starterCode: { languageId: number; languageName: string; code: string }
): Promise<void> {
  await api.post(`/questions/${questionId}/starter-code`, starterCode);
}

// ---- Assessments ----

export async function getAssessments(): Promise<Assessment[]> {
  const { data } = await api.get('/assessments');
  return data;
}

export async function getAssessment(id: number): Promise<Assessment> {
  const { data } = await api.get(`/assessments/${id}`);
  return data;
}

export async function createAssessment(assessment: {
  name: string;
  timeLimitMinutes: number;
  questionIds: number[];
}): Promise<Assessment> {
  const { data } = await api.post('/assessments', assessment);
  return data;
}

export async function updateAssessment(
  id: number,
  assessment: { name?: string; timeLimitMinutes?: number; questionIds?: number[] }
): Promise<Assessment> {
  const { data } = await api.put(`/assessments/${id}`, assessment);
  return data;
}

export async function deleteAssessment(id: number): Promise<void> {
  await api.delete(`/assessments/${id}`);
}

// ---- Judge / Run Code ----

export async function runCode(params: {
  sourceCode: string;
  languageId: number;
  stdin?: string;
}): Promise<RunCodeResponse> {
  const { data } = await api.post('/judge/run', params);
  return data;
}

export async function getLanguages(): Promise<Language[]> {
  const { data } = await api.get('/judge/languages');
  return data;
}

// ---- Submissions ----

export async function submitAssessment(params: {
  assessmentId: number;
  candidateName: string;
  answers: {
    questionId: number;
    languageId: number;
    languageName: string;
    code: string;
  }[];
}): Promise<SubmissionResult> {
  const { data } = await api.post('/submissions', params);
  return data;
}

export async function getSubmissionResults(
  assessmentId: number,
  candidateName: string
): Promise<SubmissionResult> {
  const { data } = await api.get(`/submissions/${assessmentId}/${candidateName}`);
  return data;
}

export default api;
