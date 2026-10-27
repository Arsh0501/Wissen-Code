import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuestionSetAgent,
  parseQuestionSetDraft,
  questionSetGroqConfig,
  type GroqQuestionSetRequest,
  type GroqQuestionSetResponse,
} from '../ai/question-set-agent';
import type { QuestionSetGenerationInput } from '../services/questions/question-set-contracts';

const question = {
  title: 'Java locks',
  statement: 'Compare optimistic and pessimistic locking.',
  answer: 'Optimistic locking checks a version; pessimistic locking holds a lock.',
};
const input: QuestionSetGenerationInput = {
  topics: 'Java concurrency',
  count: 1,
  includeAnswers: true,
  answerDetail: 'detailed',
};
const config = () => ({ apiKey: 'fixture-key', model: 'openai/gpt-oss-120b' });

function completion(document: unknown, finishReason = 'stop'): GroqQuestionSetResponse {
  return {
    choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(document) } }],
  };
}

function providerError(status: number, code: string, message: string) {
  return { isAxiosError: true, response: { status, data: { error: { code, message } } } };
}

test('Groq-only configuration ignores AI_PROVIDER and never falls back to an OpenAI key', () => {
  assert.deepEqual(
    questionSetGroqConfig({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'unused',
      GROQ_API_KEY: ' groq-only ',
      GROQ_MODEL: 'default-model',
      QUESTION_SET_GROQ_MODEL: 'dedicated-model',
    }),
    { apiKey: 'groq-only', model: 'dedicated-model' },
  );
  assert.throws(() => questionSetGroqConfig({ OPENAI_API_KEY: 'unused' }), /requires GROQ_API_KEY/);
});

test('normalizes object and single-array responses without silently dropping extra questions', () => {
  for (const document of [question, { question }, [question], { questions: [question] }]) {
    assert.deepEqual(parseQuestionSetDraft(JSON.stringify(document), true), {
      ...question,
      source: 'ai',
    });
  }
  assert.throws(
    () => parseQuestionSetDraft(JSON.stringify([question, question]), true),
    /exactly one/,
  );
  assert.throws(
    () => parseQuestionSetDraft(JSON.stringify({ ...question, title: '\u0000' }), true),
    /fields/,
  );
  assert.throws(
    () => parseQuestionSetDraft(JSON.stringify({ ...question, answer: '' }), true),
    /nonempty/,
  );
  assert.throws(() => parseQuestionSetDraft('not JSON', true), /valid JSON/);
});

test('makes one request per question, sends no count, and preserves answer options and prior titles', async () => {
  const requests: GroqQuestionSetRequest[] = [];
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async (request, key) => {
      assert.equal(key, 'fixture-key');
      requests.push(request);
      return completion({ question: { ...question, title: `Question ${requests.length}` } });
    },
  });
  const result = await agent.generate({ ...input, count: 2, includeAnswers: false });
  assert.equal(result.questions.length, 2);
  assert.ok(result.questions.every((draft) => draft.answer === null && draft.source === 'ai'));
  const format = requests[0].response_format;
  assert.equal(format.type, 'json_schema');
  if (format.type === 'json_schema') assert.equal(format.json_schema.strict, true);
  const first = JSON.parse(requests[0].messages[1].content);
  assert.equal(first.count, undefined);
  assert.equal(first.answerDetail, 'detailed');
  assert.deepEqual(JSON.parse(requests[1].messages[1].content).previousTitles, ['Question 1']);
});

test('recovers from the reported provider 400 array/object schema error', async () => {
  let calls = 0;
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async (request) => {
      calls++;
      if (calls === 1)
        throw providerError(400, 'json_validate_failed', 'expected object, but got array');
      assert.match(request.messages[1].content, /formatCorrection/);
      return completion({ question });
    },
  });
  assert.equal((await agent.generate(input)).questions[0].title, question.title);
  assert.equal(calls, 2);
});

test('retries missing reference answers and increases the budget after truncation', async () => {
  const budgets: number[] = [];
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async (request) => {
      budgets.push(request.max_completion_tokens);
      if (budgets.length === 1) return completion({ question }, 'length');
      if (budgets.length === 2) return completion({ question: { ...question, answer: null } });
      return completion({ question });
    },
  });
  assert.ok((await agent.generate(input)).questions[0].answer);
  assert.equal(budgets.length, 3);
  assert.ok(budgets[1] > budgets[0]);
  assert.ok(budgets.every((budget) => budget <= 8192));
});

test('bounds invalid-output retries and returns an actionable error', async () => {
  let calls = 0;
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async () => {
      calls++;
      return completion([question, question]);
    },
  });
  await assert.rejects(agent.generate(input), (error) => {
    assert.match((error as Error).message, /after three attempts/);
    assert.match((error as Error).message, /No questions from this request were saved/);
    return true;
  });
  assert.equal(calls, 3);
});

test('retries rate limits with bounded backoff and does not retry invalid credentials', async () => {
  let calls = 0;
  const waits: number[] = [];
  const agent = createQuestionSetAgent({
    getConfig: config,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
    transport: async () => {
      calls++;
      if (calls < 3) throw providerError(429, 'rate_limit_exceeded', 'fixture');
      return completion({ question });
    },
  });
  await agent.generate(input);
  assert.deepEqual(waits, [1000, 2000]);

  calls = 0;
  const denied = createQuestionSetAgent({
    getConfig: config,
    transport: async () => {
      calls++;
      throw providerError(401, 'invalid_api_key', 'secret-provider-detail');
    },
  });
  await assert.rejects(denied.generate(input), /Check GROQ_API_KEY/);
  assert.equal(calls, 1);
});

test('rejects invalid input before contacting Groq', async () => {
  let calls = 0;
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async () => {
      calls++;
      return completion({ question });
    },
  });
  await assert.rejects(agent.generate({ ...input, count: 0 }));
  assert.equal(calls, 0);
});

test('retries duplicates without restarting or duplicating earlier questions', async () => {
  let calls = 0;
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async () => {
      calls++;
      return completion({
        question: calls < 3 ? question : { ...question, title: 'Java atomics' },
      });
    },
  });
  const result = await agent.generate({ ...input, count: 2 });
  assert.deepEqual(
    result.questions.map((draft) => draft.title),
    ['Java locks', 'Java atomics'],
  );
  assert.equal(calls, 3);
});

test('rejects object-valued detailed answers and retries for an editor-compatible string', async () => {
  let calls = 0;
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async (request) => {
      calls++;
      if (calls === 1)
        return completion({ question: { ...question, answer: { explanation: 'Not text' } } });
      assert.match(request.messages[1].content, /expected string/);
      return completion({ question });
    },
  });
  const result = await agent.generate(input);
  assert.equal(typeof result.questions[0].answer, 'string');
  assert.equal(calls, 2);
});

test('falls back to Groq JSON mode when strict decoding is unavailable', async () => {
  let calls = 0;
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async (request) => {
      calls++;
      if (calls === 1)
        throw providerError(
          400,
          'invalid_request_error',
          'response_format json_schema strict is not supported',
        );
      assert.deepEqual(request.response_format, { type: 'json_object' });
      return completion({ question });
    },
  });
  assert.equal((await agent.generate(input)).questions.length, 1);
  assert.equal(calls, 2);
});

test('passes the optional description to Groq while allowing requests without it', async () => {
  const descriptions: unknown[] = [];
  const agent = createQuestionSetAgent({
    getConfig: config,
    transport: async (request) => {
      descriptions.push(JSON.parse(request.messages[1].content).description);
      return completion({ question });
    },
  });
  await agent.generate({ ...input, description: '  Senior developer scenarios  ' });
  await agent.generate(input);
  assert.deepEqual(descriptions, ['Senior developer scenarios', undefined]);
  await assert.rejects(agent.generate({ ...input, description: 'a'.repeat(4001) }));
  await assert.rejects(agent.generate({ ...input, description: '\u0000' }));
  assert.equal(descriptions.length, 2);
});
