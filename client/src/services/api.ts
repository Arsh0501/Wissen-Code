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
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshRequest: Promise<string> | null = null;
export function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('wissen-refresh-token');
  if (!refreshToken) return Promise.reject(new Error('Please sign in again'));
  refreshRequest ??= axios
    .post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
    .then(({ data }) => {
      localStorage.setItem('wissen-token', data.accessToken);
      localStorage.setItem('wissen-user', JSON.stringify(data.user));
      return data.accessToken as string;
    })
    .finally(() => {
      refreshRequest = null;
    });
  return refreshRequest;
}
export async function socketAccessToken(): Promise<string> {
  const token = localStorage.getItem('wissen-token');
  if (!token) throw new Error('Please sign in again');
  try {
    const claims = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    if (claims.exp * 1000 <= Date.now() + 30000) return refreshAccessToken();
  } catch {
    /* The server validates the token. */
  }
  return token;
}
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    if (
      error.response?.status !== 401 ||
      !request ||
      request._retried ||
      !localStorage.getItem('wissen-refresh-token') ||
      [
        '/auth/login',
        '/auth/register',
        '/auth/refresh',
        '/auth/logout',
      ].includes(request.url)
    )
      return Promise.reject(error);
    request._retried = true;
    const token = await refreshAccessToken();
    request.headers.Authorization = `Bearer ${token}`;
    return api(request);
  },
);

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
  questionType?: Question['questionType'];
  settings?: Question['settings'];
  tags?: string[];
  timeLimit?: number;
  memoryLimit?: number;
}

export async function createQuestion(
  question: QuestionInput & {
    starterCodes?: { languageId: number; languageName: string; code: string }[];
    testCases?: { input: string; expectedOutput: string; isSample: boolean }[];
  },
): Promise<Question> {
  const { data } = await api.post('/questions', question);
  return data;
}

export async function updateQuestion(
  id: number,
  question: QuestionInput,
): Promise<Question> {
  const { data } = await api.put(`/questions/${id}`, question);
  return data;
}

export async function deleteQuestion(id: number): Promise<void> {
  await api.delete(`/questions/${id}`);
}

export async function importQuestionFromMd(
  markdownContent: string,
): Promise<any> {
  const { data } = await api.post('/admin/questions/import-md', {
    markdownContent,
  });
  return data;
}

export function getExportMdUrl(id: number): string {
  return `/api/admin/questions/${id}/export-md`;
}

// ---- Test Cases ----

export async function addTestCases(
  questionId: number,
  testCases: { input: string; expectedOutput: string; isSample: boolean }[],
): Promise<void> {
  await api.post(`/questions/${questionId}/testcases`, { testCases });
}

export async function updateTestCase(
  tcId: number,
  data: { input?: string; expectedOutput?: string; isSample?: boolean },
): Promise<void> {
  await api.put(`/questions/testcases/${tcId}`, data);
}

export async function deleteTestCase(tcId: number): Promise<void> {
  await api.delete(`/questions/testcases/${tcId}`);
}

// ---- Starter Code ----

export async function saveStarterCode(
  questionId: number,
  starterCode: { languageId: number; languageName: string; code: string },
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

export async function createAssessment(
  assessment: AssessmentInput,
): Promise<Assessment> {
  const { data } = await api.post('/assessments', assessment);
  return data;
}

export async function updateAssessment(
  id: number,
  assessment: Partial<AssessmentInput>,
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
  if (err?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (err?.isAxiosError && !err.response)
    return 'Unable to reach the server. Check your connection and try again.';
  return err?.response?.data?.error || err?.message || fallback;
}

// ---- Judge / Run Code ----

export async function runCode(params: {
  sourceCode: string;
  languageId: number;
  stdin?: string;
}): Promise<RunCodeResponse> {
  const { data } = await api.post('/judge/run', params, { timeout: 180000 });
  return data;
}

export async function runTests(params: {
  sourceCode: string;
  languageId: number;
  questionId: number;
}): Promise<RunTestsResponse> {
  const { data } = await api.post('/judge/run-tests', params, { timeout: 180000 });
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
  const { data } = await api.post('/submissions', params, { timeout: 11 * 60 * 1000 });
  return data;
}

export async function getSubmissionResults(
  assessmentId: number,
  candidateName: string,
): Promise<SubmissionResult> {
  const { data } = await api.get(
    `/submissions/${assessmentId}/${encodeURIComponent(candidateName)}`,
  );
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
  assessmentId: number,
): Promise<({ exists: true } & SessionResponse) | { exists: false }> {
  const { data } = await api.get(`/attempts/status/${assessmentId}`);
  return data;
}

export async function startSession(
  assessmentId: number,
  retake = false,
): Promise<SessionResponse> {
  const { data } = await api.post(`/assessments/${assessmentId}/start`, {
    retake,
  });
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
  },
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
  }[],
): Promise<void> {
  await api.post(`/attempts/${sessionId}/save-all-drafts`, { drafts });
}

export async function recordTabSwitch(
  sessionId: number,
  event: { leftAt: string; durationMs: number },
): Promise<{ count: number; limit: number; autoSubmitted: boolean }> {
  const { data } = await api.post(`/attempts/${sessionId}/tab-switch`, event);
  return data;
}

export async function recordPaste(
  sessionId: number,
  event: { questionId: number; charCount: number; lineCount: number },
): Promise<void> {
  await api.post(`/attempts/${sessionId}/paste`, event);
}

export async function uploadSnapshot(
  sessionId: number,
  image: string,
  reason: 'interval' | 'tab-return' | 'camera-lost' | 'start',
): Promise<{ count: number }> {
  const { data } = await api.post(`/attempts/${sessionId}/snapshot`, { image, reason });
  return data;
}

export async function finishSession(sessionId: number): Promise<any> {
  const { data } = await api.post(`/attempts/${sessionId}/submit`, {}, { timeout: 11 * 60 * 1000 });
  return data;
}

// ---- Admin Reports ----

export interface CandidateSubmissionSummary extends CandidateSummary {
  session: { finishedAt: string | null; startedAt: string } | null;
}

export interface AssessmentSubmissionsResponse {
  assessment: {
    id: number;
    name: string;
    timeLimitMinutes: number;
    passingScore: number;
  };
  candidates: CandidateSubmissionSummary[];
  stats: AssessmentStats;
}

export async function getAssessmentSubmissions(
  assessmentId: number,
): Promise<AssessmentSubmissionsResponse> {
  const { data } = await api.get(`/assessments/${assessmentId}/candidates`);
  return data;
}

export async function getReportData(
  candidateName: string,
  assessmentId: number,
): Promise<any> {
  const { data } = await api.get(
    `/candidates/${encodeURIComponent(candidateName)}/report`,
    { params: { assessmentId } },
  );
  return data;
}

// Fetches the PDF through the shared client so the admin's auth token is attached
export async function downloadReportPdf(
  candidateName: string,
  assessmentId: number,
): Promise<Blob> {
  const { data } = await api.get(
    `/admin/reports/${encodeURIComponent(candidateName)}/${assessmentId}/download`,
    {
      responseType: 'blob',
    },
  );
  return data;
}

// Every candidate's result for an assessment as a CSV (opens in Excel)
export async function downloadAssessmentCsv(
  assessmentId: number,
): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get(`/admin/reports/export/${assessmentId}`, {
    responseType: 'blob',
  });
  const match = /filename="([^"]+)"/.exec(
    res.headers['content-disposition'] || '',
  );
  return {
    blob: res.data,
    filename: match?.[1] || `results-assessment-${assessmentId}.csv`,
  };
}

// ---- AI assessment generation ----

export interface ResumeAssessmentResult {
  assessmentId: number;
  name: string;
  timeLimitMinutes: number;
  profile: {
    candidateName: string;
    experienceLevel: 'intern' | 'junior' | 'mid' | 'senior' | 'staff';
    yearsOfExperience: number;
    primaryLanguages: string[];
    skills: string[];
    summary: string;
  };
  plan: { topic: string; difficulty: 'easy' | 'medium' | 'hard'; rationale: string }[];
  questions: {
    id: number;
    title: string;
    difficulty: string;
    source: 'bank' | 'generated';
    topic: string;
  }[];
  resumeChars: number;
}

/** Reads a resume, picks or writes matching questions and creates a draft assessment. */
export async function createAssessmentFromResume(input: {
  resumeText?: string;
  resumePdfBase64?: string;
  fileName?: string;
  role?: string;
  questionCount: number;
  difficulty: 'mixed' | 'easy' | 'medium' | 'hard';
  timeLimitMinutes?: number;
  candidateEmail?: string;
}): Promise<ResumeAssessmentResult> {
  const { data } = await api.post('/ai/auto-assessment', input, {
    timeout: 5 * 60 * 1000,
  });
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

export async function createInvite(input: {
  assessmentId: number;
  label?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
}): Promise<InviteLink> {
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

export async function joinInvite(
  token: string,
  input: { name: string; email: string },
): Promise<{
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
    role: 'candidate';
    guest: true;
  };
  assessmentId: number;
}> {
  const { data } = await api.post(
    `/public/invite/${encodeURIComponent(token)}/join`,
    input,
  );
  return data;
}

export function getReportDownloadUrl(
  candidateName: string,
  assessmentId: number,
): string {
  return `/api/admin/reports/${encodeURIComponent(candidateName)}/${assessmentId}/download`;
}

export default api;
