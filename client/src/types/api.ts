import type { Question, CandidateSummary, AssessmentStats } from './';
// Request and response shapes used by services/api.ts

// Tags are sent as an array; the server stores them as a JSON string
export interface QuestionInput {
  title?: string;
  statement?: string;
  difficulty?: Question['difficulty'];
  tags?: string[];
  timeLimit?: number;
  memoryLimit?: number;
  type?: 'coding' | 'mcq';
  options?: { id: string; text: string }[];
  correctOptions?: string[];
  explanation?: string;
  topic?: string;
  skills?: string[];
}

export interface SessionResponse {
  sessionId: number;
  startedAt: string;
  finishedAt: string | null;
  timeLimitMinutes: number;
  remainingSeconds: number;
  isFinished: boolean;
  tabSwitchCount: number;
  tabSwitchLimit: number;
  attempt?: number;
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

export interface CandidateSubmissionSummary extends CandidateSummary {
  session: { finishedAt: string | null; startedAt: string } | null;
}

export interface AssessmentSubmissionsResponse {
  assessment: { id: number; name: string; timeLimitMinutes: number; passingScore: number };
  candidates: CandidateSubmissionSummary[];
  stats: AssessmentStats;
}
