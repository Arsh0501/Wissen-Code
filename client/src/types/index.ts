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

export interface Assessment {
  id: number;
  name: string;
  timeLimitMinutes: number;
  createdAt: string;
  updatedAt: string;
  questions: AssessmentQuestion[];
  _count?: {
    questions: number;
  };
}

export interface AssessmentQuestion {
  id: number;
  assessmentId: number;
  questionId: number;
  orderIndex: number;
  question: Question;
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

export interface SubmissionResult {
  assessmentId: number;
  candidateName: string;
  submissions: (Submission & {
    totalTestCases: number;
    passedTestCases: number;
  })[];
  overallScore: number;
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
}
