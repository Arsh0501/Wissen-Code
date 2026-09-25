// In-memory + localStorage-backed mock database standing in for the real Express/Prisma backend.
// All "API" functions in services/api.ts read and write through this module.
import type {
  Question,
  Assessment,
  AssessmentQuestion,
  StarterCode,
  TestCase,
  Submission,
  TestCaseResult,
  Language,
} from '../types';

const STORAGE_KEY = 'wissen-mock-db-v1';

interface MockDb {
  questions: Question[];
  assessments: Assessment[];
  submissions: Submission[];
  nextIds: {
    question: number;
    testCase: number;
    starterCode: number;
    assessment: number;
    assessmentQuestion: number;
    submission: number;
    testCaseResult: number;
  };
}

export const LANGUAGES: Language[] = [
  { key: 'python', id: 71, name: 'Python', monacoLang: 'python' },
  { key: 'java', id: 62, name: 'Java', monacoLang: 'java' },
  { key: 'cpp', id: 54, name: 'C++', monacoLang: 'cpp' },
  { key: 'javascript', id: 63, name: 'JavaScript', monacoLang: 'javascript' },
];

function nowIso() {
  return new Date().toISOString();
}

function buildSeedDb(): MockDb {
  const timestamp = nowIso();

  const twoSum: Question = {
    id: 1,
    title: 'Two Sum',
    statement:
      'Given an array of integers `nums` and an integer `target`, return the indices of the ' +
      'two numbers such that they add up to `target`.\n\nYou may assume exactly one solution exists.',
    difficulty: 'easy',
    tags: JSON.stringify(['array', 'hash-map']),
    timeLimit: 2,
    memoryLimit: 256000,
    createdAt: timestamp,
    updatedAt: timestamp,
    starterCodes: [
      { id: 1, questionId: 1, languageId: 71, languageName: 'Python', code: 'nums = list(map(int, input().split()))\ntarget = int(input())\n\n# Your solution here\n' },
      { id: 2, questionId: 1, languageId: 63, languageName: 'JavaScript', code: '// Your solution here\n' },
    ],
    testCases: [
      { id: 1, questionId: 1, input: '2 7 11 15\n9', expectedOutput: '0 1', isSample: true },
      { id: 2, questionId: 1, input: '3 2 4\n6', expectedOutput: '1 2', isSample: false },
    ],
    _count: { testCases: 2, starterCodes: 2 },
  };

  const reverseString: Question = {
    id: 2,
    title: 'Reverse a String',
    statement: 'Given a string `s`, return it reversed.',
    difficulty: 'easy',
    tags: JSON.stringify(['string']),
    timeLimit: 2,
    memoryLimit: 256000,
    createdAt: timestamp,
    updatedAt: timestamp,
    starterCodes: [
      { id: 3, questionId: 2, languageId: 71, languageName: 'Python', code: 's = input()\n\n# Your solution here\n' },
    ],
    testCases: [
      { id: 3, questionId: 2, input: 'hello', expectedOutput: 'olleh', isSample: true },
      { id: 4, questionId: 2, input: 'wissen', expectedOutput: 'nessiw', isSample: false },
    ],
    _count: { testCases: 2, starterCodes: 1 },
  };

  const questions = [twoSum, reverseString];

  const assessmentQuestions: AssessmentQuestion[] = questions.map((q, idx) => ({
    id: idx + 1,
    assessmentId: 1,
    questionId: q.id,
    orderIndex: idx,
    marks: 10,
    question: q,
  }));

  const assessment: Assessment = {
    id: 1,
    name: 'Sample Coding Assessment',
    description: 'This is a sample assessment.',
    instructions: 'Read carefully.',
    timeLimitMinutes: 30,
    passingScore: 50,
    status: 'published',
    startAt: null,
    endAt: null,
    shuffleQuestions: false,
    allowedLanguages: '[]',
    showResults: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    questions: assessmentQuestions,
    _count: { questions: assessmentQuestions.length },
  };

  return {
    questions,
    assessments: [assessment],
    submissions: [],
    nextIds: {
      question: 3,
      testCase: 5,
      starterCode: 4,
      assessment: 2,
      assessmentQuestion: assessmentQuestions.length + 1,
      submission: 1,
      testCaseResult: 1,
    },
  };
}

function loadDb(): MockDb {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as MockDb;
    } catch {
      // fall through to reseed on corrupt data
    }
  }
  const seeded = buildSeedDb();
  persist(seeded);
  return seeded;
}

function persist(next: MockDb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

let db = loadDb();

function save() {
  persist(db);
}

export function resetMockDb() {
  db = buildSeedDb();
  save();
}

// Simulates network latency so loading states behave like a real API.
export function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

function questionSummary(q: Question): Question {
  return {
    ...q,
    _count: {
      testCases: q.testCases?.length ?? 0,
      starterCodes: q.starterCodes?.length ?? 0,
    },
  };
}

// ---- Questions ----

export function listQuestions(): Question[] {
  return db.questions.map(questionSummary);
}

export function getQuestionById(id: number): Question | undefined {
  return db.questions.find((q) => q.id === id);
}

export function createQuestionRecord(input: {
  title: string;
  statement: string;
  difficulty?: string;
  tags?: string[];
  timeLimit?: number;
  memoryLimit?: number;
  starterCodes?: { languageId: number; languageName: string; code: string }[];
  testCases?: { input: string; expectedOutput: string; isSample: boolean }[];
}): Question {
  const id = db.nextIds.question++;
  const timestamp = nowIso();

  const starterCodes: StarterCode[] = (input.starterCodes ?? []).map((sc) => ({
    id: db.nextIds.starterCode++,
    questionId: id,
    languageId: sc.languageId,
    languageName: sc.languageName,
    code: sc.code,
  }));

  const testCases: TestCase[] = (input.testCases ?? []).map((tc) => ({
    id: db.nextIds.testCase++,
    questionId: id,
    input: tc.input,
    expectedOutput: tc.expectedOutput,
    isSample: tc.isSample,
  }));

  const question: Question = {
    id,
    title: input.title,
    statement: input.statement,
    difficulty: (input.difficulty as Question['difficulty']) || 'medium',
    tags: JSON.stringify(input.tags ?? []),
    timeLimit: input.timeLimit ?? 2,
    memoryLimit: input.memoryLimit ?? 256000,
    createdAt: timestamp,
    updatedAt: timestamp,
    starterCodes,
    testCases,
  };

  db.questions.unshift(question);
  save();
  return question;
}

export function updateQuestionRecord(
  id: number,
  updates: Partial<Pick<Question, 'title' | 'statement' | 'difficulty' | 'timeLimit' | 'memoryLimit'>> & {
    tags?: string[];
  }
): Question | undefined {
  const question = db.questions.find((q) => q.id === id);
  if (!question) return undefined;

  if (updates.title !== undefined) question.title = updates.title;
  if (updates.statement !== undefined) question.statement = updates.statement;
  if (updates.difficulty !== undefined) question.difficulty = updates.difficulty;
  if (updates.tags !== undefined) question.tags = JSON.stringify(updates.tags);
  if (updates.timeLimit !== undefined) question.timeLimit = updates.timeLimit;
  if (updates.memoryLimit !== undefined) question.memoryLimit = updates.memoryLimit;
  question.updatedAt = nowIso();

  save();
  return question;
}

export function deleteQuestionRecord(id: number) {
  db.questions = db.questions.filter((q) => q.id !== id);
  for (const assessment of db.assessments) {
    assessment.questions = assessment.questions.filter((aq) => aq.questionId !== id);
  }
  save();
}

export function addTestCasesToQuestion(
  questionId: number,
  testCases: { input: string; expectedOutput: string; isSample: boolean }[]
): TestCase[] {
  const question = db.questions.find((q) => q.id === questionId);
  if (!question) return [];

  const created = testCases.map((tc) => ({
    id: db.nextIds.testCase++,
    questionId,
    input: tc.input,
    expectedOutput: tc.expectedOutput,
    isSample: tc.isSample,
  }));

  question.testCases = [...(question.testCases ?? []), ...created];
  save();
  return created;
}

export function updateTestCaseRecord(
  tcId: number,
  updates: { input?: string; expectedOutput?: string; isSample?: boolean }
): TestCase | undefined {
  for (const question of db.questions) {
    const tc = question.testCases?.find((t) => t.id === tcId);
    if (tc) {
      if (updates.input !== undefined) tc.input = updates.input;
      if (updates.expectedOutput !== undefined) tc.expectedOutput = updates.expectedOutput;
      if (updates.isSample !== undefined) tc.isSample = updates.isSample;
      save();
      return tc;
    }
  }
  return undefined;
}

export function deleteTestCaseRecord(tcId: number) {
  for (const question of db.questions) {
    if (question.testCases?.some((t) => t.id === tcId)) {
      question.testCases = question.testCases.filter((t) => t.id !== tcId);
      save();
      return;
    }
  }
}

export function upsertStarterCodeRecord(
  questionId: number,
  starterCode: { languageId: number; languageName: string; code: string }
): StarterCode | undefined {
  const question = db.questions.find((q) => q.id === questionId);
  if (!question) return undefined;

  question.starterCodes = question.starterCodes ?? [];
  const existing = question.starterCodes.find((sc) => sc.languageId === starterCode.languageId);
  if (existing) {
    existing.code = starterCode.code;
    existing.languageName = starterCode.languageName;
    save();
    return existing;
  }

  const created: StarterCode = {
    id: db.nextIds.starterCode++,
    questionId,
    languageId: starterCode.languageId,
    languageName: starterCode.languageName,
    code: starterCode.code,
  };
  question.starterCodes.push(created);
  save();
  return created;
}

// ---- Assessments ----

export function listAssessments(): Assessment[] {
  return db.assessments.map((a) => ({ ...a, _count: { questions: a.questions.length } }));
}

export function getAssessmentById(id: number): Assessment | undefined {
  const assessment = db.assessments.find((a) => a.id === id);
  if (!assessment) return undefined;

  // Candidates only ever see sample test cases, mirroring the real API's behaviour.
  return {
    ...assessment,
    questions: assessment.questions.map((aq) => ({
      ...aq,
      question: {
        ...aq.question,
        testCases: aq.question.testCases?.filter((tc) => tc.isSample),
      },
    })),
  };
}

export function createAssessmentRecord(input: {
  name: string;
  timeLimitMinutes: number;
  questionIds: number[];
}): Assessment {
  const id = db.nextIds.assessment++;
  const timestamp = nowIso();

  const questions: AssessmentQuestion[] = input.questionIds
    .map((qId, idx) => {
      const question = db.questions.find((q) => q.id === qId);
      if (!question) return undefined;
      return {
        id: db.nextIds.assessmentQuestion++,
        assessmentId: id,
        questionId: qId,
        orderIndex: idx,
        marks: 10,
        question,
      };
    })
    .filter((aq): aq is AssessmentQuestion => !!aq);

  const assessment: Assessment = {
    id,
    name: input.name,
    timeLimitMinutes: input.timeLimitMinutes,
    description: '',
    instructions: '',
    passingScore: 50,
    status: 'draft',
    startAt: null,
    endAt: null,
    shuffleQuestions: false,
    allowedLanguages: '[]',
    showResults: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    questions,
    _count: { questions: questions.length },
  };

  db.assessments.unshift(assessment);
  save();
  return assessment;
}

export function updateAssessmentRecord(
  id: number,
  updates: { name?: string; timeLimitMinutes?: number; questionIds?: number[] }
): Assessment | undefined {
  const assessment = db.assessments.find((a) => a.id === id);
  if (!assessment) return undefined;

  if (updates.name !== undefined) assessment.name = updates.name;
  if (updates.timeLimitMinutes !== undefined) assessment.timeLimitMinutes = updates.timeLimitMinutes;
  if (updates.questionIds !== undefined) {
    assessment.questions = updates.questionIds
      .map((qId, idx) => {
        const question = db.questions.find((q) => q.id === qId);
        if (!question) return undefined;
        return {
          id: db.nextIds.assessmentQuestion++,
          assessmentId: id,
          questionId: qId,
          orderIndex: idx,
          question,
        };
      })
      .filter((aq): aq is AssessmentQuestion => !!aq);
  }
  assessment.updatedAt = nowIso();

  save();
  return assessment;
}

export function deleteAssessmentRecord(id: number) {
  db.assessments = db.assessments.filter((a) => a.id !== id);
  save();
}

// ---- Judge / grading (mock) ----

// Deterministic pseudo-score so the same code always yields the same result —
// there is no real Judge0 backend wired up, so this only drives the demo UI.
function pseudoScoreFromCode(code: string): number {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) % 1000;
  }
  return hash % 101;
}

export function runMockCode(sourceCode: string, stdin: string) {
  const trimmed = sourceCode.trim();
  if (!trimmed) {
    return {
      stdout: '',
      stderr: 'No code submitted.',
      compileOutput: '',
      message: '',
      statusId: 6,
      statusDescription: 'Compilation Error',
      executionTime: null,
      memoryUsed: null,
      isError: true,
    };
  }

  return {
    stdout: `[Mock Mode] No backend connected — showing simulated output.\nstdin received:\n${stdin || '(none)'}`,
    stderr: '',
    compileOutput: '',
    message: '',
    statusId: 3,
    statusDescription: 'Mock Mode',
    executionTime: '0.00',
    memoryUsed: 0,
    isError: false,
  };
}

export function submitAssessmentRecord(input: {
  assessmentId: number;
  candidateName: string;
  answers: { questionId: number; languageId: number; languageName: string; code: string }[];
}) {
  const timestamp = nowIso();
  const results: (Submission & { totalTestCases: number; passedTestCases: number })[] = [];

  for (const answer of input.answers) {
    const question = db.questions.find((q) => q.id === answer.questionId);
    const testCases = question?.testCases ?? [];
    const score = pseudoScoreFromCode(answer.code);
    const passedCount = Math.round((score / 100) * testCases.length);

    const testCaseResults: (TestCaseResult & { isSample: boolean })[] = testCases.map((tc, idx) => ({
      id: db.nextIds.testCaseResult++,
      submissionId: db.nextIds.submission,
      testCaseId: tc.id,
      passed: idx < passedCount,
      actualOutput: '',
      statusDesc: idx < passedCount ? 'Accepted (mock)' : 'Mock Grading — not executed',
      executionTime: null,
      memoryUsed: null,
      testCase: { id: tc.id, isSample: tc.isSample },
      isSample: tc.isSample,
    }));

    const submission: Submission & { totalTestCases: number; passedTestCases: number } = {
      id: db.nextIds.submission++,
      assessmentId: input.assessmentId,
      questionId: answer.questionId,
      candidateName: input.candidateName,
      languageId: answer.languageId,
      languageName: answer.languageName,
      code: answer.code,
      status: 'graded',
      score: testCases.length > 0 ? score : 0,
      createdAt: timestamp,
      question: question ? { id: question.id, title: question.title } : undefined,
      testCaseResults,
      totalTestCases: testCases.length,
      passedTestCases: passedCount,
    };

    db.submissions.push(submission);
    results.push(submission);
  }

  save();

  return {
    assessmentId: input.assessmentId,
    candidateName: input.candidateName,
    submissions: results,
    overallScore: results.length > 0 ? results.reduce((acc, r) => acc + r.score, 0) / results.length : 0,
  };
}

export function getSubmissionResultsRecord(assessmentId: number, candidateName: string) {
  const submissions = db.submissions.filter(
    (s) => s.assessmentId === assessmentId && s.candidateName === candidateName
  ) as (Submission & { totalTestCases: number; passedTestCases: number })[];

  if (submissions.length === 0) return undefined;

  return {
    assessmentId,
    candidateName,
    submissions,
    overallScore: submissions.reduce((acc, s) => acc + s.score, 0) / submissions.length,
  };
}

export { parseTags };
