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
  tabSwitchCount: number;
  tabSwitchLimit: number;
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
  const { data } = await api.get(`/attempts/status/${assessmentId}`);
  return data;
}

export async function startSession(assessmentId: number): Promise<SessionResponse> {
  const { data } = await api.post(`/assessments/${assessmentId}/start`);
  return data;
}

export async function getSession(sessionId: number): Promise<SessionResponse> {
  const { data } = await api.get(`/attempts/${sessionId}`);
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
  await api.put(`/attempts/${sessionId}/answer`, draft);
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
  await api.post(`/attempts/${sessionId}/save-all-drafts`, { drafts });
}

export async function recordTabSwitch(
  sessionId: number,
  event: { leftAt: string; durationMs: number }
): Promise<{ count: number; limit: number; autoSubmitted: boolean }> {
  const { data } = await api.post(`/attempts/${sessionId}/tab-switch`, event);
  return data;
}

export async function recordPaste(
  sessionId: number,
  event: { questionId: number; charCount: number; lineCount: number }
): Promise<void> {
  await api.post(`/attempts/${sessionId}/paste`, event);
}

export async function finishSession(sessionId: number): Promise<any> {
  const { data } = await api.post(`/attempts/${sessionId}/submit`);
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
  const { data } = await api.get(`/assessments/${assessmentId}/candidates`);
  return data;
}

export async function getReportData(
  candidateName: string,
  assessmentId: number
): Promise<any> {
  const { data } = await api.get(
    `/candidates/${encodeURIComponent(candidateName)}/report`, { params: { assessmentId } }
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

// ---- AI assessment generation ----

export interface AIStatus {
  configured: boolean;
  canVerify: boolean;
  minQuestions: number;
  maxQuestions: number;
}

export interface AIGeneratedQuestion {
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  rationale: string;
  statement: string;
  test_cases: { input: string; expected_output: string; is_sample: boolean }[];
  starter_code_python: string;
  starter_code_javascript: string;
  starter_code_java: string;
  starter_code_cpp: string;
  reference_solution_python: string;
  verification:
    | { status: 'verified'; dropped: number }
    | { status: 'unverified'; reason: string }
    | { status: 'failed'; reason: string };
}

export interface AIGenerationPreview {
  candidate: {
    name: string;
    experience_level: 'intern' | 'junior' | 'mid' | 'senior' | 'staff';
    years_of_experience: number;
    primary_languages: string[];
    skills: string[];
    summary: string;
  };
  questions: AIGeneratedQuestion[];
  suggested_time_minutes: number;
  model: string;
}

export async function getAIStatus(): Promise<AIStatus> {
  const { data } = await api.get('/ai/status');
  return data;
}

export async function generateAssessmentFromResume(input: {
  resumePdfBase64?: string;
  resumeText?: string;
  questionCount: number;
  focus?: string;
}): Promise<AIGenerationPreview> {
  // Generation reads the resume and writes several problems — it can take a few minutes
  const { data } = await api.post('/ai/generate', input, { timeout: 11 * 60 * 1000 });
  return data;
}

export async function createAIAssessment(input: {
  name: string;
  description?: string;
  timeLimitMinutes: number;
  passingScore: number;
  questions: Omit<AIGeneratedQuestion, 'verification' | 'rationale' | 'reference_solution_python'>[];
}): Promise<{ id: number; name: string }> {
  const { data } = await api.post('/ai/create-assessment', input);
  return data;
}

// ---- Invite links ----

export interface InviteLink {
  id: number;
  token: string;
  assessmentId: number;
  label: string;
  maxUses: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  uses: number;
  state: 'active' | 'revoked' | 'expired' | 'full';
  participants: { name: string; email: string; joinedAt: string }[];
}

export interface PublicInvite {
  assessment: {
    name: string;
    description: string;
    timeLimitMinutes: number;
    passingScore: number;
    questionCount: number;
    startAt: string | null;
    endAt: string | null;
  };
  label: string;
  canJoin: boolean;
  problem: string | null;
}

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

export function getReportDownloadUrl(candidateName: string, assessmentId: number): string {
  return `/api/admin/reports/${encodeURIComponent(candidateName)}/${assessmentId}/pdf`;
}

export default api;
