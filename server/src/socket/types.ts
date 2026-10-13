export const INTERVIEW_EVENTS = {
  // Client to Server
  JOIN_INTERVIEW: 'JOIN_INTERVIEW',
  START_INTERVIEW: 'START_INTERVIEW',
  CHANGE_QUESTION: 'CHANGE_QUESTION',
  UPDATE_CODE: 'UPDATE_CODE',
  EXECUTE_CODE: 'EXECUTE_CODE',
  SUBMIT_CODE: 'SUBMIT_CODE',
  ADD_NOTE: 'ADD_NOTE',
  END_INTERVIEW: 'END_INTERVIEW',

  // Broadcast / Server to Client
  CANDIDATE_JOINED: 'CANDIDATE_JOINED',
  INTERVIEWER_JOINED: 'INTERVIEWER_JOINED',
  INTERVIEW_STARTED: 'INTERVIEW_STARTED',
  QUESTION_CHANGED: 'QUESTION_CHANGED',
  CODE_CHANGED: 'CODE_CHANGED',
  CODE_EXECUTED: 'CODE_EXECUTED',
  CODE_SUBMITTED: 'CODE_SUBMITTED',
  NOTE_ADDED: 'NOTE_ADDED',
  INTERVIEW_ENDED: 'INTERVIEW_ENDED',
  SYNC_STATE: 'SYNC_STATE',
  ERROR: 'ERROR',
} as const;

export type InterviewEventName = typeof INTERVIEW_EVENTS[keyof typeof INTERVIEW_EVENTS];

export interface SocketUser {
  role: 'interviewer' | 'candidate';
  name: string;
  userId?: number;
  email?: string;
  roomToken?: string;
  interviewId: number;
}

export interface JoinInterviewPayload {
  interviewId?: number;
  roomToken?: string;
  candidateName?: string;
}

export interface UpdateCodePayload {
  code: string;
  languageId?: number;
  cursorPosition?: { lineNumber: number; column: number };
}

export interface ExecuteCodePayload {
  code?: string;
  languageId?: number;
  stdin?: string;
}

export interface SubmitCodePayload {
  questionId?: number;
  code?: string;
  languageId?: number;
}

export interface AddNotePayload {
  category?: 'technical' | 'communication' | 'problem_solving' | 'general';
  rating?: number;
  content: string;
  isPrivate?: boolean;
}

export interface ChangeQuestionPayload {
  questionId: number;
}

export interface InterviewSyncState {
  interviewId: number;
  title: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  currentQuestionId: number | null;
  currentQuestion: any | null;
  currentCode: string;
  currentLanguageId: number;
  timeLimitMinutes: number;
  participants: {
    interviewers: string[];
    candidates: string[];
  };
}
