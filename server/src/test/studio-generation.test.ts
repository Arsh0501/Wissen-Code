import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma';
import { generateStudioDrafts, retryDraftSave } from '../services/questions/studio-generation';
import { structuredAI } from '../services/ai/structured-ai';

const question = {
  starterContractVersion: 2,
  title: 'Identity fixture',
  statement: 'Return the input integer unchanged using the provided function.',
  inputFormat: 'One integer n.',
  outputFormat: 'One integer.',
  constraints: '-10 <= n <= 10',
  functionSignature: 'def solve(n: int) -> int:',
  difficulty: 'easy',
  questionType: 'coding',
  topics: ['integers'],
  requiredSkills: [],
  starterCodePython:
    'def solve(n: int) -> int:\n    # BEGIN CORE LOGIC\n    # TODO: implement\n    return 0\n    # END CORE LOGIC\n\nprint(solve(int(input())))',
  expectedSolutionPython: 'def solve(n: int) -> int:\n    return n\n\nprint(solve(int(input())))',
  solutionExplanation: 'Return n without modifying its value.',
  testCases: [
    { input: '1', expectedOutput: '1', isSample: true },
    { input: '-1', expectedOutput: '-1', isSample: false },
  ],
};

test('studio generation retries malformed output, resumes saved progress, and replays without duplicates', async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Generation retry fixture',
      email: `studio-${randomUUID()}@test.invalid`,
      password: 'unused',
      role: 'admin',
    },
  });
  try {
    let calls = 0;
    const repaired = await generateStudioDrafts(
      {
        requestId: randomUUID(),
        topic: 'Integers',
        difficulty: 'easy',
        questionType: 'coding',
        count: 1,
      },
      user.id,
      (async () => ({
        questions: [
          {
            ...question,
            starterCodePython: ++calls === 1 ? 'broken starter' : question.starterCodePython,
          },
        ],
      })) as typeof structuredAI,
    );
    assert.equal(calls, 2);
    assert.equal(repaired.length, 1);
    let schemaCalls = 0;
    const schemaRecovered = await generateStudioDrafts(
      {
        requestId: randomUUID(),
        topic: 'Integers',
        difficulty: 'easy',
        questionType: 'coding',
        count: 1,
      },
      user.id,
      (async () => {
        if (++schemaCalls === 1)
          throw Object.assign(
            new Error(
              "Generated JSON does not match the expected schema. jsonschema: missing properties: 'testCases'",
            ),
            { status: 400 },
          );
        return { questions: [question] };
      }) as typeof structuredAI,
    );
    assert.equal(schemaCalls, 2);
    assert.equal(schemaRecovered.length, 1);

    let codingCalls = 0;
    const normalized = await generateStudioDrafts(
      {
        requestId: randomUUID(),
        topic: 'Integers',
        difficulty: 'easy',
        questionType: 'coding',
        count: 3,
        starterLanguages: [
          { id: 71, name: 'Python' },
          { id: 62, name: 'Java' },
        ],
      },
      user.id,
      (async () => {
        codingCalls++;
        return {
          questions: [
            {
              ...question,
              starterCodes: [
                {
                  languageId: 62,
                  languageName: 'Java',
                  code: `import java.util.*;
public class Main {
    // BEGIN CORE LOGIC
    // TODO: implement
    public static int solve(int n) {
        return 0;
    }
    // END CORE LOGIC
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println(solve(scanner.nextInt()));
    }
}`,
                },
              ],
            },
          ],
        };
      }) as typeof structuredAI,
    );
    assert.equal(normalized.length, 3);
    assert.equal(
      codingCalls,
      3,
      'method-wrapped markers should be repaired without another AI call',
    );
    for (const draft of normalized) {
      const java = (draft.content as any).starterCodes.find(
        (starter: any) => starter.languageId === 62,
      );
      assert.match(java.code, /public static int solve\(int n\) \{\n        \/\/ BEGIN CORE LOGIC/);
    }

    let recover = false,
      partialCalls = 0;
    const request = {
      requestId: randomUUID(),
      topic: 'Integers',
      difficulty: 'easy',
      questionType: 'coding',
      count: 2,
    };
    const ai = (async () => {
      partialCalls++;
      if (!recover && partialCalls > 1)
        throw Object.assign(new Error('Temporary provider failure'), { status: 503 });
      return { questions: [{ ...question, title: `Identity fixture ${partialCalls}` }] };
    }) as typeof structuredAI;
    await assert.rejects(generateStudioDrafts(request, user.id, ai), /saving 1 of 2/);
    const failed = await prisma.aIJob.findUniqueOrThrow({ where: { id: request.requestId } });
    assert.equal(failed.status, 'failed');
    const firstId = (failed.output as any).draftIds[0];
    assert.ok(await prisma.aIQuestionDraft.findUnique({ where: { id: firstId } }));
    recover = true;
    const resumed = await generateStudioDrafts(request, user.id, ai);
    assert.equal(resumed.length, 2);
    assert.equal(resumed[0].id, firstId);
    const completedCalls = partialCalls;
    assert.deepEqual(
      (await generateStudioDrafts(request, user.id, ai)).map((draft) => draft.id),
      resumed.map((draft) => draft.id),
    );
    assert.equal(partialCalls, completedCalls);
    await prisma.aIQuestionDraft.delete({ where: { id: firstId } });
    assert.equal((await generateStudioDrafts(request, user.id, ai)).length, 1);
    assert.equal(partialCalls, completedCalls);
    await assert.rejects(
      generateStudioDrafts({ ...request, count: 3 }, user.id, ai),
      /original generation settings/,
    );
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const concurrentRequest = { ...request, requestId: randomUUID(), count: 1 };
    const pending = generateStudioDrafts(concurrentRequest, user.id, (async () => {
      started();
      await gate;
      return { questions: [question] };
    }) as typeof structuredAI);
    await ready;
    try {
      await assert.rejects(generateStudioDrafts(concurrentRequest, user.id, ai), /still running/);
    } finally {
      release();
    }
    assert.equal((await pending).length, 1);
  } finally {
    await prisma.aIQuestionDraft.deleteMany({ where: { authorId: user.id } });
    await prisma.aIJob.deleteMany({ where: { authorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

test('draft persistence retries transient failures only and remains bounded', async () => {
  let calls = 0;
  assert.equal(
    await retryDraftSave(async () => {
      if (++calls < 3) throw { code: 'P1001' };
      return 'saved';
    }),
    'saved',
  );
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    retryDraftSave(async () => {
      calls++;
      throw new Error('Invalid data');
    }),
    /Invalid data/,
  );
  assert.equal(calls, 1);
});
