import axios from 'axios';
import type {
  Question,
  Assessment,
  RunCodeResponse,
  RunTestsResponse,
  SubmissionResult,
  Language,
  AssessmentInput,
  DashboardData,
  CandidateSummary,
  AssessmentStats,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inject JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wissen-token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ---- Questions ----

export async function getQuestions(filters?: {
  search?: string;
  difficulty?: string;
  tag?: string;
}): Promise<Question[]> {
  const { data } = await api.get('/questions', { params: filters });
  return data;
}

export async function getQuestion(id: number): Promise<Question> {
  const { data } = await api.get(`/questions/${id}`);
  return data;
}

// Tags are sent as an array; the server stores them as a JSON string
export interface QuestionInput {
  title?: string;
  statement?: string;
  difficulty?: Question['difficulty'];
  tags?: string[];
  timeLimit?: number;
  memoryLimit?: number;
}

export async function createQuestion(question: QuestionInput & {
  starterCodes?: { languageId: number; languageName: string; code: string }[];
  testCases?: { input: string; expectedOutput: string; isSample: boolean }[];
}): Promise<Question> {
  const { data } = await api.post('/questions', question);
  return data;
}

export async function updateQuestion(id: number, question: QuestionInput): Promise<Question> {
  const { data } = await api.put(`/questions/${id}`, question);
  return data;
}

export async function deleteQuestion(id: number): Promise<void> {
  await api.delete(`/questions/${id}`);
}

export async function importQuestionFromMd(markdownContent: string): Promise<any> {
  const { data } = await api.post('/admin/questions/import-md', { markdownContent });
  return data;
}

export function getExportMdUrl(id: number): string {
  return `/api/admin/questions/${id}/export-md`;
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

export async function createAssessment(assessment: AssessmentInput): Promise<Assessment> {
  const { data } = await api.post('/assessments', assessment);
  return data;
}

export async function updateAssessment(
  id: number,
  assessment: Partial<AssessmentInput>
): Promise<Assessment> {
  const { data } = await api.put(`/assessments/${id}`, assessment);
  return data;
}

export async function deleteAssessment(id: number): Promise<void> {
  await api.delete(`/assessments/${id}`);
}

export async function duplicateAssessment(id: number): Promise<Assessment> {
  const { data } = await api.post(`/assessments/${id}/duplicate`);
  return data;
}

export async function getDashboard(): Promise<DashboardData> {
  const { data } = await api.get('/assessments/dashboard');
  return data;
}

// Extracts the server's error message from an axios error
export function apiError(err: any, fallback = 'Something went wrong'): string {
  return err?.response?.data?.error || err?.message || fallback;
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

export async function runTests(params: {
  sourceCode: string;
  languageId: number;
  questionId: number;
}): Promise<RunTestsResponse> {
  const { data } = await api.post('/judge/run-tests', params);
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
  const { data } = await api.get(`/submissions/${assessmentId}/${encodeURIComponent(candidateName)}`);
  return data;
}

// ---- Sessions (Timer + Autosave) ----

export interface SessionResponse {
  sessionId: number;
  startedAt: string;
  finishedAt: string | null;
  timeLimitMinutes: number;
  remainingSeconds: number;
  isFinished: boolean;
  drafts: {
    id: number;
    sessionId: number;
    questionId: number;
    languageId: number;
    languageName: string;
    code: string;
    isFlagged: boolean;
    isAnswered: boolean;
  }[];
}

// Existing session for the current candidate; never creates one (so the timer doesn't start)
export async function getSessionStatus(
  assessmentId: number
): Promise<({ exists: true } & SessionResponse) | { exists: false }> {
  const { data } = await api.get(`/sessions/status/${assessmentId}`);
  return data;
}

export async function startSession(assessmentId: number): Promise<SessionResponse> {
  const { data } = await api.post('/sessions/start', { assessmentId });
  return data;
}

export async function getSession(sessionId: number): Promise<SessionResponse> {
  const { data } = await api.get(`/sessions/${sessionId}`);
  return data;
}

export async function saveDraft(
  sessionId: number,
  draft: {
    questionId: number;
    languageId: number;
    languageName: string;
    code: string;
    isFlagged?: boolean;
    isAnswered?: boolean;
  }
): Promise<void> {
  await api.post(`/sessions/${sessionId}/save-draft`, draft);
}

export async function saveAllDrafts(
  sessionId: number,
  drafts: {
    questionId: number;
    languageId: number;
    languageName: string;
    code: string;
    isFlagged?: boolean;
    isAnswered?: boolean;
  }[]
): Promise<void> {
  await api.post(`/sessions/${sessionId}/save-all-drafts`, { drafts });
}

export async function finishSession(sessionId: number): Promise<any> {
  const { data } = await api.post(`/sessions/${sessionId}/finish`);
  return data;
}

// ---- Admin Reports ----

export interface CandidateSubmissionSummary extends CandidateSummary {
  session: { finishedAt: string | null; startedAt: string } | null;
}

export interface AssessmentSubmissionsResponse {
  assessment: { id: number; name: string; timeLimitMinutes: number; passingScore: number };
  candidates: CandidateSubmissionSummary[];
  stats: AssessmentStats;
}

export async function getAssessmentSubmissions(
  assessmentId: number
): Promise<AssessmentSubmissionsResponse> {
  const { data } = await api.get(`/admin/reports/submissions/${assessmentId}`);
  return data;
}

export async function getReportData(
  candidateName: string,
  assessmentId: number
): Promise<any> {
  const { data } = await api.get(
    `/admin/reports/${encodeURIComponent(candidateName)}/${assessmentId}/data`
  );
  return data;
}

export function getReportDownloadUrl(
  candidateName: string,
  assessmentId: number
): string {
  return `/api/admin/reports/${encodeURIComponent(candidateName)}/${assessmentId}/download`;
}

export default api;

