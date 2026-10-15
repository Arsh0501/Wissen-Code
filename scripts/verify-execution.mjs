import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const require = createRequire(
  new URL('../server/package.json', import.meta.url),
);
require('dotenv').config({
  path: new URL('../server/.env', import.meta.url).pathname,
});
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const db = new PrismaClient();
const origin = process.env.EXECUTION_TEST_URL || 'http://localhost:4001/api';
let userId;
let assessmentId;
const questionIds = [];
try {
  const health = await (await fetch(`${origin}/health`)).json();
  assert.equal(
    health.judgeMode,
    'live',
    'Enable live execution before running this check',
  );
  const user = await db.user.create({
    data: {
      name: `Execution ${crypto.randomUUID()}`,
      email: `execution-${crypto.randomUUID()}@test.invalid`,
      password: 'unused',
      role: 'admin',
    },
  });
  userId = user.id;
  const session = await db.userSession.create({
    data: {
      userId: user.id,
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'admin',
      sessionId: session.id,
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' },
  );
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(origin + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(180000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(`${path}: ${response.status} ${data.error ?? ''}`);
    return data;
  };
  for (const [languageId, sourceCode] of [
    [71, 'print(4)'],
    [63, 'console.log(4)'],
    [
      62,
      'public class Main { public static void main(String[] args) { System.out.println(4); } }',
    ],
    [54, '#include <iostream>\nint main(){std::cout << 4 << "\\n";}'],
    [
      82,
      'CREATE TABLE nums(n INTEGER); INSERT INTO nums VALUES(4); SELECT n FROM nums;',
    ],
  ]) {
    const result = await call('/judge/run', 'POST', { languageId, sourceCode });
    assert.equal(result.statusId, 3);
    assert.equal(result.stdout.trim(), '4');
    console.log(`PASS: live language ${languageId}`);
  }
  const coding = await db.question.create({
    data: {
      title: 'Live double input fixture',
      statement: 'Print twice the input integer.',
      difficulty: 'easy',
      testCases: {
        create: [
          { input: '2', expectedOutput: '4', isSample: true },
          { input: '3', expectedOutput: '6', isSample: false },
        ],
      },
    },
  });
  questionIds.push(coding.id);
  const sql = await db.question.create({
    data: {
      title: 'Live SQL fixture',
      statement: 'Return the sum of nums.n.',
      difficulty: 'easy',
      questionType: 'sql',
      testCases: {
        create: [
          {
            input:
              'CREATE TABLE nums(n INTEGER); INSERT INTO nums VALUES(1),(3);',
            expectedOutput: '4',
            isSample: true,
          },
          {
            input:
              'CREATE TABLE nums(n INTEGER); INSERT INTO nums VALUES(2),(5);',
            expectedOutput: '7',
            isSample: false,
          },
        ],
      },
    },
  });
  questionIds.push(sql.id);
  const assessment = await db.assessment.create({
    data: {
      name: 'Live grading verification',
      status: 'published',
      questionTypes: '["coding","sql"]',
      questions: {
        create: questionIds.map((questionId, orderIndex) => ({
          questionId,
          orderIndex,
          marks: 10,
        })),
      },
    },
  });
  assessmentId = assessment.id;
  const attempt = await call(`/assessments/${assessment.id}/start`, 'POST', {});
  const wrong = await call('/judge/run-tests', 'POST', {
    sourceCode: 'print(0)',
    languageId: 71,
    questionId: coding.id,
  });
  assert.equal(
    wrong.passedCount,
    0,
    'A wrong solution must fail real execution',
  );
  for (const [questionId, languageId, code] of [
    [coding.id, 71, 'print(int(input()) * 2)'],
    [sql.id, 82, 'SELECT SUM(n) FROM nums;'],
  ])
    await call(`/attempts/${attempt.sessionId}/answer`, 'PUT', {
      questionId,
      languageId,
      languageName: languageId === 82 ? 'SQL' : 'Python',
      code,
      isAnswered: true,
    });
  await call(`/attempts/${attempt.sessionId}/submit`, 'POST', {});
  let result;
  for (let round = 0; round < 40; round++) {
    result = await call(
      `/submissions/${assessment.id}/${encodeURIComponent(user.name)}`,
    );
    if (!result.resultsPending) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(result.overallScore, 100);
  assert.equal(result.evaluation.questions.length, 2);
  console.log(
    'PASS: live correct and incorrect answers, isolated SQL fixtures, hidden test cases, and weighted assessment grading.',
  );
} finally {
  if (assessmentId)
    await db.assessment.deleteMany({ where: { id: assessmentId } });
  await db.question.deleteMany({ where: { id: { in: questionIds } } });
  if (userId) await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
}
