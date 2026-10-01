import { PrismaClient } from '@prisma/client';
import { MOCK_QUESTIONS, GENERIC_STARTERS, LANGUAGE_NAMES } from './mock-data';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

// Deterministic pseudo-random numbers so every seed run produces the same data
let rngState = 42;
function rand() {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}

const CANDIDATES = [
  'Aarav Sharma', 'Priya Patel', 'Rohan Gupta', 'Ananya Iyer', 'Vikram Singh',
  'Sneha Reddy', 'Karan Mehta', 'Isha Verma', 'Arjun Nair', 'Meera Joshi',
  'Rahul Das', 'Kavya Menon',
];

interface AssessmentSpec {
  name: string;
  description: string;
  instructions?: string;
  timeLimitMinutes: number;
  passingScore: number;
  status: 'draft' | 'published' | 'archived';
  startAt?: Date;
  endAt?: Date;
  shuffleQuestions?: boolean;
  allowedLanguages?: number[];
  showResults?: boolean;
  questions: [string, number][]; // [question title, marks]
  // Mock candidates: [name, skill 0–1, days ago started]; skill drives how many tests pass
  candidates?: [string, number, number][];
  inProgress?: string[]; // candidates currently taking the test
}

const DEFAULT_INSTRUCTIONS = `- Read every question carefully before you start coding.
- Use **Run code** to test against sample cases; hidden test cases are used for final grading.
- Click **Confirm** on a question once you're happy with your answer.
- Your work is auto-saved every few seconds. If you get disconnected, reopen the test to continue.
- The test is submitted automatically when the timer reaches zero.`;

const ASSESSMENTS: AssessmentSpec[] = [
  {
    name: 'Campus Hiring 2026 — Round 1',
    description: 'First coding round for the 2026 campus hiring drive. Covers arrays, strings and basic DP.',
    timeLimitMinutes: 90,
    passingScore: 60,
    status: 'published',
    endAt: new Date(now + 10 * DAY),
    questions: [['Two Sum', 10], ['Valid Parentheses', 10], ['Maximum Subarray', 20], ['Longest Substring Without Repeating Characters', 20]],
    candidates: [
      ['Aarav Sharma', 0.95, 6], ['Priya Patel', 0.8, 5], ['Rohan Gupta', 0.45, 5], ['Ananya Iyer', 0.9, 4],
      ['Vikram Singh', 0.3, 3], ['Sneha Reddy', 0.7, 2], ['Karan Mehta', 0.55, 1], ['Isha Verma', 0.15, 1],
    ],
    inProgress: ['Arjun Nair'],
  },
  {
    name: 'Backend Engineer — DSA Screen',
    description: 'Screening test for experienced backend engineers. Python or Java only; results are reviewed by the hiring panel.',
    timeLimitMinutes: 60,
    passingScore: 50,
    status: 'published',
    endAt: new Date(now + 14 * DAY),
    shuffleQuestions: true,
    allowedLanguages: [71, 62],
    showResults: false,
    questions: [['Merge Intervals', 20], ['Number of Islands', 30], ['Coin Change', 30], ['Kth Largest Element', 20]],
    candidates: [['Meera Joshi', 0.85, 3], ['Rahul Das', 0.5, 2], ['Kavya Menon', 0.65, 1], ['Aarav Sharma', 0.9, 1], ['Rohan Gupta', 0.35, 0]],
  },
  {
    name: 'Graduate Trainee Warm-up',
    description: 'A short practice test to get familiar with the platform. Scores are not used for hiring decisions.',
    timeLimitMinutes: 30,
    passingScore: 40,
    status: 'published',
    questions: [['Fizz Buzz', 5], ['Reverse a String', 5], ['Climbing Stairs', 10], ['Valid Palindrome', 10]],
    candidates: [['Isha Verma', 0.6, 8], ['Karan Mehta', 0.9, 7], ['Vikram Singh', 0.75, 7]],
  },
  {
    name: 'Summer Internship Test 2026',
    description: 'Closed internship test — kept for reporting.',
    timeLimitMinutes: 45,
    passingScore: 50,
    status: 'published',
    startAt: new Date(now - 30 * DAY),
    endAt: new Date(now - 16 * DAY),
    questions: [['Two Sum', 10], ['Fizz Buzz', 10], ['Climbing Stairs', 10]],
    candidates: [
      ['Sneha Reddy', 0.9, 25], ['Meera Joshi', 0.7, 24], ['Rahul Das', 0.4, 22],
      ['Kavya Menon', 0.85, 20], ['Arjun Nair', 0.2, 19], ['Ananya Iyer', 0.6, 18],
    ],
  },
  {
    name: 'Senior Engineer — Advanced Algorithms',
    description: 'Hard problems for senior candidates. Still being reviewed by the interview panel.',
    timeLimitMinutes: 120,
    passingScore: 70,
    status: 'draft',
    startAt: new Date(now + 7 * DAY),
    questions: [['Trapping Rain Water', 40], ['Coin Change', 30], ['Number of Islands', 30]],
  },
];

async function main() {
  console.log('🌱 Seeding database with mock data...\n');

  // Clear existing data (children first)
  await prisma.testCaseResult.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.draftAnswer.deleteMany();
  await prisma.assessmentSession.deleteMany();
  await prisma.assessmentQuestion.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.starterCode.deleteMany();
  await prisma.question.deleteMany();
  // Restart SQLite autoincrement counters so IDs (and URLs like /exam/1) are stable across re-seeds
  await prisma.$executeRawUnsafe('DELETE FROM sqlite_sequence').catch(() => {});

  // ── Questions ──
  const questions = new Map<string, { id: number; testCases: { id: number; expectedOutput: string }[] }>();
  for (const [idx, q] of MOCK_QUESTIONS.entries()) {
    const starters = { ...GENERIC_STARTERS, ...(q.starterCodes || {}) };
    const created = await prisma.question.create({
      data: {
        title: q.title,
        statement: q.statement,
        difficulty: q.difficulty,
        tags: JSON.stringify(q.tags),
        timeLimit: q.timeLimit,
        memoryLimit: 256000,
        createdAt: new Date(now - (40 - idx) * DAY),
        starterCodes: {
          create: Object.entries(starters).map(([langId, code]) => ({
            languageId: Number(langId),
            languageName: LANGUAGE_NAMES[Number(langId)],
            code,
          })),
        },
        testCases: { create: q.testCases },
      },
      include: { testCases: { orderBy: { id: 'asc' } } },
    });
    questions.set(q.title, created);
  }
  console.log(`✅ Created ${questions.size} questions`);

  // ── Assessments + mock candidate activity ──
  let sessionCount = 0;
  for (const [idx, spec] of ASSESSMENTS.entries()) {
    const assessment = await prisma.assessment.create({
      data: {
        name: spec.name,
        description: spec.description,
        instructions: spec.instructions ?? DEFAULT_INSTRUCTIONS,
        timeLimitMinutes: spec.timeLimitMinutes,
        passingScore: spec.passingScore,
        status: spec.status,
        startAt: spec.startAt ?? null,
        endAt: spec.endAt ?? null,
        shuffleQuestions: spec.shuffleQuestions ?? false,
        allowedLanguages: JSON.stringify(spec.allowedLanguages ?? []),
        showResults: spec.showResults ?? true,
        createdAt: new Date(now - (35 - idx * 3) * DAY),
        questions: {
          create: spec.questions.map(([title, marks], orderIndex) => ({
            questionId: questions.get(title)!.id,
            orderIndex,
            marks,
          })),
        },
      },
    });

    const langs = spec.allowedLanguages?.length ? spec.allowedLanguages : [71, 71, 62, 54, 63];

    for (const [name, skill, daysAgo] of spec.candidates ?? []) {
      const startedAt = new Date(now - daysAgo * DAY - (2 + rand() * 6) * 60 * 60 * 1000);
      const minutesUsed = Math.round(spec.timeLimitMinutes * (0.45 + rand() * 0.55));
      const finishedAt = new Date(startedAt.getTime() + minutesUsed * 60 * 1000);
      const session = await prisma.assessmentSession.create({
        data: { assessmentId: assessment.id, candidateName: name, startedAt, finishedAt },
      });
      sessionCount++;

      for (const [qIdx, [title]] of spec.questions.entries()) {
        const q = questions.get(title)!;
        const mock = MOCK_QUESTIONS.find((m) => m.title === title)!;
        // Weaker candidates sometimes skip later questions entirely
        if (rand() > skill + 0.35 && qIdx > 0) continue;

        // Solved answers carry the real (Python) reference solution; partial ones keep the starter code
        const solved = rand() < skill;
        const languageId = solved ? 71 : langs[Math.floor(rand() * langs.length)];
        const code = solved ? mock.solution : (mock.starterCodes?.[languageId] ?? GENERIC_STARTERS[languageId]);

        await prisma.draftAnswer.create({
          data: {
            sessionId: session.id,
            questionId: q.id,
            languageId,
            languageName: LANGUAGE_NAMES[languageId],
            code,
            isAnswered: true,
            isFlagged: rand() < 0.15,
          },
        });

        // Solved → all tests pass; otherwise a skill-weighted share of tests pass
        const results = q.testCases.map((tc) => {
          const passed = solved || rand() < skill * 0.7;
          const status = passed ? 'Accepted' : rand() < 0.75 ? 'Wrong Answer' : rand() < 0.5 ? 'Time Limit Exceeded' : 'Runtime Error (NZEC)';
          return {
            testCaseId: tc.id,
            passed,
            actualOutput: passed ? tc.expectedOutput : status === 'Wrong Answer' ? '0' : '',
            statusDesc: status,
            executionTime: Math.round((0.01 + rand() * 0.3) * 1000) / 1000,
            memoryUsed: 3000 + Math.floor(rand() * 20000),
          };
        });
        const passedCount = results.filter((r) => r.passed).length;

        await prisma.submission.create({
          data: {
            assessmentId: assessment.id,
            questionId: q.id,
            candidateName: name,
            languageId,
            languageName: LANGUAGE_NAMES[languageId],
            code,
            status: 'graded',
            score: (passedCount / results.length) * 100,
            createdAt: finishedAt,
            testCaseResults: { create: results },
          },
        });
      }
    }

    // Candidates currently mid-test (started 10 minutes ago, drafts saved)
    for (const name of spec.inProgress ?? []) {
      const session = await prisma.assessmentSession.create({
        data: { assessmentId: assessment.id, candidateName: name, startedAt: new Date(now - 10 * 60 * 1000) },
      });
      sessionCount++;
      const [firstTitle] = spec.questions[0];
      await prisma.draftAnswer.create({
        data: {
          sessionId: session.id,
          questionId: questions.get(firstTitle)!.id,
          languageId: 71,
          languageName: 'Python',
          code: MOCK_QUESTIONS.find((m) => m.title === firstTitle)!.solution,
          isAnswered: true,
        },
      });
    }

    console.log(`✅ Created assessment: ${spec.name} [${spec.status}] — ${spec.questions.length} questions, ${(spec.candidates?.length ?? 0) + (spec.inProgress?.length ?? 0)} candidates`);
  }

  console.log(`\n✅ Created ${sessionCount} candidate sessions with graded submissions`);
  console.log('\nSeed complete! Log in as Admin to see the dashboard, or as an Candidate (e.g. a new name) to take a test.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
