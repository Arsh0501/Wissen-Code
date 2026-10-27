import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { runAgent } from '../ai/gateway';
import {
  isOutputTruncationError,
  questionOutputBudget,
  MAX_OUTPUT_BUDGET,
} from '../ai/output-budget';

test('question generation budgets account for multiple complete language starters', () => {
  assert.equal(questionOutputBudget({}), 8192);
  assert.ok(questionOutputBudget({ starterLanguages: [71, 63, 62, 54] }) > 8192);
  assert.equal(questionOutputBudget({ requestedLanguages: new Array(100) }), MAX_OUTPUT_BUDGET);
  assert.equal(
    isOutputTruncationError({
      status: 400,
      message:
        'max completion tokens reached before generating a valid document: the output was truncated to fit max_completion_tokens',
    }),
    true,
  );
  assert.equal(isOutputTruncationError({ message: 'Invalid API key' }), false);
});

test('provider schema rejection is repaired with explicit requirements and validated before returning', async () => {
  const schema = z.object({
    questions: z
      .array(
        z.object({
          title: z.string(),
          inputFormat: z.string(),
          testCases: z.array(z.string()).min(1),
        }),
      )
      .length(1),
  });
  let attempts = 0;
  const result = await runAgent(
    'generated_questions',
    schema,
    'Generate a question.',
    {},
    [],
    async (params) => {
      attempts++;
      if (attempts === 1)
        throw Object.assign(
          new Error(
            "Generated JSON does not match the expected schema. jsonschema: missing properties: 'inputFormat'",
          ),
          { status: 400 },
        );
      assert.ok(params.instructions.includes('Required JSON schema:'));
      assert.ok(params.instructions.includes('inputFormat'));
      if (attempts === 2)
        return {
          status: 'completed',
          output: [],
          output_text: '{"questions":[{"title":"Incomplete"}]}',
        };
      return {
        status: 'completed',
        output: [],
        output_text: JSON.stringify({
          questions: [{ title: 'Complete', inputFormat: 'One integer', testCases: ['1'] }],
        }),
      };
    },
  );
  assert.equal(attempts, 3);
  assert.equal(result.questions[0].title, 'Complete');
});

test('persistent malformed output is bounded and authentication failures are not retried', async () => {
  let attempts = 0;
  await assert.rejects(
    runAgent('generated_questions', z.object({ ok: z.boolean() }), '', {}, [], async () => {
      attempts++;
      return { status: 'completed', output: [], output_text: '{"wrong":true}' };
    }),
    (error: any) => error.code === 'AI_SCHEMA_RETRIES_EXHAUSTED' && error.status === 502,
  );
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(
    runAgent('generated_questions', z.object({ ok: z.boolean() }), '', {}, [], async () => {
      attempts++;
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }),
    /Unauthorized/,
  );
  assert.equal(attempts, 1);
});

test('provider truncation errors retry with a larger output budget', async () => {
  const budgets: number[] = [];
  const result = await runAgent(
    'generated_questions',
    z.object({ ok: z.boolean() }),
    '',
    { requestedLanguages: [71, 63, 62, 54] },
    [],
    async (params) => {
      budgets.push(params.max_output_tokens);
      if (budgets.length === 1)
        throw Object.assign(
          new Error('max completion tokens reached before generating a valid document'),
          { status: 400 },
        );
      return { status: 'completed', output: [], output_text: '{"ok":true}' };
    },
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(budgets.length, 2);
  assert.ok(budgets[0] > 2500);
  assert.ok(budgets[1] > budgets[0]);
});

test('incomplete truncated responses are retried, while persistent truncation stays bounded', async () => {
  let attempts = 0;
  await assert.rejects(
    runAgent('generated_questions', z.object({ ok: z.boolean() }), '', {}, [], async () => {
      attempts++;
      return {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
        output_text: '{"ok":',
      };
    }),
    (error: any) => error.code === 'AI_OUTPUT_LIMIT' && error.status === 502,
  );
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(
    runAgent('generated_questions', z.object({ ok: z.boolean() }), '', {}, [], async () => {
      attempts++;
      throw Object.assign(new Error('Invalid request parameter'), { status: 400 });
    }),
    /Invalid request parameter/,
  );
  assert.equal(attempts, 1);
});
