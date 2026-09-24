// No backend is wired up yet — every function below reads/writes the mock
// in-memory + localStorage store in ./mockData instead of making HTTP calls.
import type {
  Question,
  Assessment,
  RunCodeResponse,
  SubmissionResult,
  Language,
} from '../types';
import * as mock from './mockData';

// ---- Questions ----

export async function getQuestions(): Promise<Question[]> {
  return mock.delay(mock.listQuestions());
}

export async function getQuestion(id: number): Promise<Question> {
  const question = mock.getQuestionById(id);
  if (!question) throw new Error('Question not found');
  return mock.delay(question);
}

export async function createQuestion(question: Partial<Question> & {
  starterCodes?: { languageId: number; languageName: string; code: string }[];
  testCases?: { input: string; expectedOutput: string; isSample: boolean }[];
}): Promise<Question> {
  const created = mock.createQuestionRecord({
    title: question.title ?? '',
    statement: question.statement ?? '',
    difficulty: question.difficulty,
    tags: question.tags ? JSON.parse(question.tags) : undefined,
    timeLimit: question.timeLimit,
    memoryLimit: question.memoryLimit,
    starterCodes: question.starterCodes,
    testCases: question.testCases,
  });
  return mock.delay(created);
}

export async function updateQuestion(id: number, question: Partial<Question>): Promise<Question> {
  const updated = mock.updateQuestionRecord(id, {
    title: question.title,
    statement: question.statement,
    difficulty: question.difficulty,
    tags: question.tags ? JSON.parse(question.tags) : undefined,
    timeLimit: question.timeLimit,
    memoryLimit: question.memoryLimit,
  });
  if (!updated) throw new Error('Question not found');
  return mock.delay(updated);
}

export async function deleteQuestion(id: number): Promise<void> {
  mock.deleteQuestionRecord(id);
  return mock.delay(undefined);
}

// ---- Test Cases ----

export async function addTestCases(
  questionId: number,
  testCases: { input: string; expectedOutput: string; isSample: boolean }[]
): Promise<void> {
  mock.addTestCasesToQuestion(questionId, testCases);
  return mock.delay(undefined);
}

export async function updateTestCase(
  tcId: number,
  data: { input?: string; expectedOutput?: string; isSample?: boolean }
): Promise<void> {
  mock.updateTestCaseRecord(tcId, data);
  return mock.delay(undefined);
}

export async function deleteTestCase(tcId: number): Promise<void> {
  mock.deleteTestCaseRecord(tcId);
  return mock.delay(undefined);
}

// ---- Starter Code ----

export async function saveStarterCode(
  questionId: number,
  starterCode: { languageId: number; languageName: string; code: string }
): Promise<void> {
  mock.upsertStarterCodeRecord(questionId, starterCode);
  return mock.delay(undefined);
}

// ---- Assessments ----

export async function getAssessments(): Promise<Assessment[]> {
  return mock.delay(mock.listAssessments());
}

export async function getAssessment(id: number): Promise<Assessment> {
  const assessment = mock.getAssessmentById(id);
  if (!assessment) throw new Error('Assessment not found');
  return mock.delay(assessment);
}

export async function createAssessment(assessment: {
  name: string;
  timeLimitMinutes: number;
  questionIds: number[];
}): Promise<Assessment> {
  return mock.delay(mock.createAssessmentRecord(assessment));
}

export async function updateAssessment(
  id: number,
  assessment: { name?: string; timeLimitMinutes?: number; questionIds?: number[] }
): Promise<Assessment> {
  const updated = mock.updateAssessmentRecord(id, assessment);
  if (!updated) throw new Error('Assessment not found');
  return mock.delay(updated);
}

export async function deleteAssessment(id: number): Promise<void> {
  mock.deleteAssessmentRecord(id);
  return mock.delay(undefined);
}

// ---- Judge / Run Code ----

export async function runCode(params: {
  sourceCode: string;
  languageId: number;
  stdin?: string;
}): Promise<RunCodeResponse> {
  return mock.delay(mock.runMockCode(params.sourceCode, params.stdin ?? ''), 400);
}

export async function getLanguages(): Promise<Language[]> {
  return mock.delay(mock.LANGUAGES);
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
  return mock.delay(mock.submitAssessmentRecord(params), 500);
}

export async function getSubmissionResults(
  assessmentId: number,
  candidateName: string
): Promise<SubmissionResult> {
  const result = mock.getSubmissionResultsRecord(assessmentId, candidateName);
  if (!result) throw new Error('No submissions found');
  return mock.delay(result);
}

