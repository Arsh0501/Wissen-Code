import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma';
import { generateStudioDrafts, retryDraftSave } from '../services/questions/studio-generation';
import type { structuredAI } from '../services/ai/structured-ai';
test('MCQ generation remains separate, retries malformed responses and replays saved jobs', async () => {
  const user = await prisma.user.create({
    data: {
      name: 'MCQ fixture',
      email: `mcq-stage-${randomUUID()}@test.invalid`,
      password: 'unused',
      role: 'admin',
    },
  });
  let calls = 0;
  const request = {
    requestId: randomUUID(),
    topic: 'SQL',
    difficulty: 'easy',
    questionType: 'mcq',
    count: 1,
  };
  const ai = (async () => ({
    questions: [
      {
        title: 'MCQ generation fixture',
        statement: 'Which option is correct in this fixture?',
        difficulty: 'easy',
        questionType: 'mcq',
        topics: ['SQL'],
        requiredSkills: [],
        solutionExplanation: '',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        ...(++calls === 1 ? {} : { correctOptionId: 'a' }),
      },
    ],
  })) as typeof structuredAI;
  try {
    const drafts = await generateStudioDrafts(request, user.id, ai);
    assert.equal(calls, 2);
    assert.equal(drafts.length, 1);
    assert.equal((await generateStudioDrafts(request, user.id, ai))[0].id, drafts[0].id);
    assert.equal(calls, 2);
    await assert.rejects(generateStudioDrafts({ ...request, questionType: 'coding' }, user.id, ai));
  } finally {
    await prisma.aIQuestionDraft.deleteMany({ where: { authorId: user.id } });
    await prisma.aIJob.deleteMany({ where: { authorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
test('transient draft saves retry within a bounded limit', async () => {
  let calls = 0;
  assert.equal(
    await retryDraftSave(async () => {
      if (++calls < 3) throw { code: 'P1001' };
      return 'saved';
    }),
    'saved',
  );
  assert.equal(calls, 3);
});
