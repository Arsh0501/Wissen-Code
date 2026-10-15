import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { aiConfig, aiConfigured } from '../ai/config';
import { runAgent } from '../ai/gateway';

test('provider selection, missing credentials, Groq tool calls and schema validation', async () => {
  const keys = ['AI_PROVIDER', 'GROQ_API_KEY', 'GROQ_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
  const previous = keys.map((key) => process.env[key]);
  keys.forEach((key) => delete process.env[key]);
  try {
    assert.equal(aiConfigured(), false);
    process.env.GROQ_API_KEY = 'test-groq';
    assert.equal(aiConfigured(), true);
    assert.equal(aiConfig().provider, 'groq');
    assert.equal(aiConfig().baseURL, 'https://api.groq.com/openai/v1');
    assert.equal(aiConfig().model, 'openai/gpt-oss-20b');
    process.env.AI_PROVIDER = 'openai';
    assert.equal(aiConfigured(), false);
    await assert.rejects(runAgent('result', z.object({ ok: z.boolean() }), '', {}), /API key is not configured/);
    process.env.OPENAI_API_KEY = 'test-openai';
    assert.equal(aiConfig().apiKey, 'test-openai');
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_MODEL = 'custom-model';
    let count = 0;
    const result = await runAgent('result', z.object({ ok: z.boolean() }), '', {}, [{
      name: 'lookup', description: 'Lookup', schema: z.object({ id: z.number() }),
      execute: async ({ id }) => { assert.equal(id, 7); return { found: true }; },
    }], async (params) => {
      assert.equal(params.model, 'custom-model');
      assert.equal(params.text.format.type, 'json_schema');
      if (count++ === 0) return { output: [{ type: 'function_call', name: 'lookup', call_id: 'call1', arguments: '{"id":7}' }] };
      assert.ok(params.input.some((item: any) => item.type === 'function_call_output' && item.call_id === 'call1'));
      return { status: 'completed', output: [], output_text: '{"ok":true}' };
    });
    assert.deepEqual(result, { ok: true });
    await assert.rejects(runAgent('result', z.object({ ok: z.boolean() }), '', {}, [], async () => ({ status: 'completed', output: [], output_text: '{"ok":"invalid"}' })));
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
