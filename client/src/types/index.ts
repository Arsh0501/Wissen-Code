// TypeScript interfaces matching the Prisma schema

export interface Question {
  id: number;
  title: string;
  statement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string; // JSON string
  timeLimit: number;
  memoryLimit: number;
  createdAt: string;
  updatedAt: string;
  starterCodes?: StarterCode[];
  testCases?: TestCase[];
  _count?: {
    testCases: number;
    starterCodes: number;
    assessments?: number;
  };
}

export interface StarterCode {
  id: number;
  questionId: number;
  languageId: number;
  languageName: string;
  code: string;
}

export interface TestCase {
  id: number;
  questionId: number;
  input: string;
  expectedOutput: string;
  isSample: boolean;
}

export type AssessmentStatus = 'draft' | 'published' | 'archived';
// 'open' | 'upcoming' | 'closed' apply to published assessments
export type Availability = 'open' | 'upcoming' | 'closed' | 'draft' | 'archived';

export interface AssessmentStats {
  candidatesStarted: number;
  candidatesCompleted: number;
  inProgress: number;
  averageScore: number | null;
  passRate: number | null;
  highestScore: number | null;
}

export interface CandidateSummary {
  name: string;
  status: 'in-progress' | 'completed';
  startedAt: string | null;
  submittedAt: string | null;
  totalQuestions: number;
  attemptedQuestions: number;
  marksObtained: number;
  totalMarks: number;
  overallScore: number;
  passed: boolean;
}

export interface Assessment {
  id: number;
  name: string;
  description: string;
  instructions: string;
  timeLimitMinutes: number;
  passingScore: number;
  status: AssessmentStatus;
  startAt: string | null;
  endAt: string | null;
  shuffleQuestions: boolean;
  allowedLanguages: string; // JSON array of language IDs; empty = all
  showResults: boolean;
  createdAt: string;
  updatedAt: string;
  questions: AssessmentQuestion[];
  availability?: Availability;
  stats?: AssessmentStats;
  candidates?: CandidateSummary[];
  // Candidate listing only
  candidateStatus?: 'not-started' | 'in-progress' | 'completed';
  _count?: {
    questions: number;
  };
}

export interface AssessmentQuestion {
  id: number;
  assessmentId: number;
  questionId: number;
  orderIndex: number;
  marks: number;
  question: Question;
}

// Payload for creating/updating an assessment
export interface AssessmentInput {
  name: string;
  description: string;
  instructions: string;
  timeLimitMinutes: number;
  passingScore: number;
  status: AssessmentStatus;
  startAt: string | null;
  endAt: string | null;
  shuffleQuestions: boolean;
  allowedLanguages: number[];
  showResults: boolean;
  questions: { questionId: number; marks: number }[];
}

export interface DashboardData {
  totals: AssessmentStats & {
    assessments: number;
    published: number;
    drafts: number;
    questions: number;
  };
  assessments: Assessment[];
  scoreDistribution: { range: string; count: number }[];
  recentActivity: {
    candidateName: string;
    assessmentId: number;
    assessmentName: string;
    startedAt: string;
    finishedAt: string | null;
    status: 'in-progress' | 'completed';
    overallScore: number | null;
    passed: boolean | null;
  }[];
}

export interface Submission {
  id: number;
  assessmentId: number;
  questionId: number;
  candidateName: string;
  languageId: number;
  languageName: string;
  code: string;
  status: 'submitted' | 'grading' | 'graded';
  score: number;
  createdAt: string;
  question?: { id: number; title: string };
  testCaseResults?: TestCaseResult[];
}

export interface TestCaseResult {
  id: number;
  submissionId: number;
  testCaseId: number;
  passed: boolean;
  actualOutput: string;
  statusDesc: string;
  executionTime: number | null;
  memoryUsed: number | null;
  testCase?: { id: number; isSample: boolean };
}

export interface RunCodeResponse {
  stdout: string;
  stderr: string;
  compileOutput: string;
  message: string;
  statusId: number;
  statusDescription: string;
  executionTime: string | null;
  memoryUsed: number | null;
  isError: boolean;
}

export interface TestCaseVerdict {
  testCaseIndex: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  statusId: number;
  statusDescription: string;
  stderr: string;
  compileOutput: string;
  message: string;
  executionTime: string | null;
  memoryUsed: number | null;
}

export interface RunTestsResponse {
  verdicts: TestCaseVerdict[];
  totalTestCases: number;
  passedCount: number;
  allPassed: boolean;
  message?: string;
}

export interface QuestionEvaluation {
  questionId: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  marksObtained: number;
  score: number;
  attempted: boolean;
  passedTestCases: number;
  totalTestCases: number;
  submission: Submission | null;
}

export interface Evaluation {
  assessment: {
    id: number;
    name: string;
    timeLimitMinutes: number;
    passingScore: number;
    showResults: boolean;
  };
  candidateName: string;
  startedAt?: string | null;
  finishedAt: string | null;
  timeTakenSeconds: number | null;
  totalMarks?: number;
  marksObtained?: number;
  percentage?: number;
  passed?: boolean;
  questions?: QuestionEvaluation[];
}

export interface SubmissionResult {
  assessmentId: number;
  candidateName: string;
  resultsHidden?: boolean;
  submissions?: Submission[];
  overallScore?: number;
  evaluation: Evaluation;
}

export interface Language {
  key: string;
  id: number;
  name: string;
  monacoLang: string;
}

// Per-question state during exam
export interface QuestionState {
  questionId: number;
  code: string;
  languageId: number;
  languageName: string;
  monacoLang: string;
  isAnswered: boolean;
  isFlagged: boolean;
  output: string;
  isError: boolean;
  customInput: string;
  runMode: 'none' | 'custom' | 'testcases';
  testVerdicts: TestCaseVerdict[];
}
