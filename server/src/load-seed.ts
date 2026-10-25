import './config/environment';
import bcrypt from 'bcryptjs';
import prisma from './prisma';

/**
 * Creates N throwaway candidate accounts and one open assessment for load testing.
 *   npm run db:seed-load -- 400          create/refresh 400 candidates + assessment
 *   npm run db:seed-load -- clean        remove the load-test users, sessions and assessment
 * Accounts: load-cand-<n>@loadtest.local / LoadTest@123 (never use on a production database).
 */
export const LOAD_PASSWORD = 'LoadTest@123';
export const LOAD_ASSESSMENT = 'Load test — DSA screen';
const emailFor = (n: number) => `load-cand-${n}@loadtest.local`;

async function clean() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@loadtest.local' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.assessmentSession.deleteMany({ where: { candidateUserId: { in: ids } } });
  await prisma.userSession.deleteMany({ where: { userId: { in: ids } } });
  await prisma.assessment.deleteMany({ where: { name: LOAD_ASSESSMENT } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${ids.length} load-test users and the load assessment.`);
}

async function seed(count: number) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed load-test accounts into a production database');
  const hash = await bcrypt.hash(LOAD_PASSWORD, 10);
  const existing = new Set(
    (
      await prisma.user.findMany({
        where: { email: { endsWith: '@loadtest.local' } },
        select: { email: true },
      })
    ).map((u) => u.email),
  );
  const missing = Array.from({ length: count }, (_, i) => i + 1)
    .map(emailFor)
    .filter((email) => !existing.has(email));
  if (missing.length)
    await prisma.user.createMany({
      data: missing.map((email) => ({
        email,
        name: `Load Candidate ${email.match(/\d+/)![0]}`,
        password: hash,
        role: 'candidate',
      })),
    });

  const questions = await prisma.question.findMany({
    where: { questionType: 'coding', testCases: { some: {} } },
    orderBy: { id: 'asc' },
    take: 3,
    select: { id: true },
  });
  if (!questions.length)
    throw new Error('No coding questions with test cases found. Run npm run db:seed first.');

  let assessment = await prisma.assessment.findFirst({ where: { name: LOAD_ASSESSMENT } });
  if (!assessment)
    assessment = await prisma.assessment.create({
      data: {
        name: LOAD_ASSESSMENT,
        description: 'Synthetic assessment used by scripts/load-test.mjs',
        timeLimitMinutes: 60,
        status: 'published',
        maxAttempts: 1000,
        questions: {
          create: questions.map((q, i) => ({ questionId: q.id, orderIndex: i, marks: 10 })),
        },
      },
    });
  // Fresh run every time: drop earlier attempts by the load users.
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@loadtest.local' } },
    select: { id: true },
  });
  await prisma.assessmentSession.deleteMany({
    where: { assessmentId: assessment.id, candidateUserId: { in: users.map((u) => u.id) } },
  });
  // Candidates are single-device: clear logins left behind by the previous run.
  await prisma.userSession.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  console.log(
    JSON.stringify({ assessmentId: assessment.id, users: users.length, questions: questions.length }),
  );
}

const arg = process.argv[2];
(arg === '--clean' || arg === 'clean' ? clean() : seed(Number(arg) || 400))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
