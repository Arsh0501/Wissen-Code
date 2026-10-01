import axios from 'axios';
import type { Question, Assessment, RunCodeResponse, RunTestsResponse, SubmissionResult, Language, AssessmentInput, DashboardData, QuestionInput, AssessmentSubmissionsResponse, PublicInvite, SessionResponse, InviteLink } from '../types';
import { STORAGE_KEYS } from '../constants';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inject JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.token);
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
  type?: 'coding' | 'mcq';
  status?: 'active' | 'pending_review' | 'rejected' | 'all';
}): Promise<Question[]> {
  const { data } = await api.get('/questions', { params: filters });
  return data;
}

export async function getQuestion(id: number): Promise<Question> {
  const { data } = await api.get(`/questions/${id}`);
  return data;
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

export async function recordTabSwitch(
  sessionId: number,
  event: { leftAt: string; durationMs: number }
): Promise<{ count: number; limit: number; autoSubmitted: boolean }> {
  const { data } = await api.post(`/sessions/${sessionId}/tab-switch`, event);
  return data;
}

export async function recordPaste(
  sessionId: number,
  event: { questionId: number; charCount: number; lineCount: number }
): Promise<void> {
  await api.post(`/sessions/${sessionId}/paste`, event);
}

export async function finishSession(sessionId: number): Promise<any> {
  const { data } = await api.post(`/sessions/${sessionId}/finish`);
  return data;
}

// ---- Admin Reports ----

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

// Fetches the PDF through the shared client so the admin's auth token is attached
export async function downloadReportPdf(candidateName: string, assessmentId: number): Promise<Blob> {
  const { data } = await api.get(`/admin/reports/${encodeURIComponent(candidateName)}/${assessmentId}/download`, {
    responseType: 'blob',
  });
  return data;
}

// Every candidate's result for an assessment as a CSV (opens in Excel)
export async function downloadAssessmentCsv(assessmentId: number): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get(`/admin/reports/export/${assessmentId}`, { responseType: 'blob' });
  const match = /filename="([^"]+)"/.exec(res.headers['content-disposition'] || '');
  return { blob: res.data, filename: match?.[1] || `results-assessment-${assessmentId}.csv` };
}

// ---- Invite links ----

export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

export async function listInvites(assessmentId: number): Promise<InviteLink[]> {
  const { data } = await api.get('/invites', { params: { assessmentId } });
  return data;
}

export async function createInvite(input: { assessmentId: number; label?: string; maxUses?: number | null; expiresAt?: string | null }): Promise<InviteLink> {
  const { data } = await api.post('/invites', input);
  return data;
}

export async function revokeInvite(id: number): Promise<void> {
  await api.post(`/invites/${id}/revoke`);
}

export async function getPublicInvite(token: string): Promise<PublicInvite> {
  const { data } = await api.get(`/public/invite/${encodeURIComponent(token)}`);
  return data;
}

export async function joinInvite(token: string, input: { name: string; email: string }): Promise<{
  token: string;
  user: { id: number; email: string; name: string; role: 'candidate'; guest: true };
  assessmentId: number;
}> {
  const { data } = await api.post(`/public/invite/${encodeURIComponent(token)}/join`, input);
  return data;
}

// ---- Retakes ----

export async function retakeAssessment(assessmentId: number): Promise<SessionResponse> {
  const { data } = await api.post('/sessions/retake', { assessmentId });
  return data;
}

export function getReportDownloadUrl(candidateName: string, assessmentId: number): string {
  return `/api/admin/reports/${encodeURIComponent(candidateName)}/${assessmentId}/pdf`;
}

export default api;
