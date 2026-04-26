import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cast, adapters, CastError } from '../src/index.js';

/** Build a deterministic LLM stub that returns scripted responses in order. */
function scriptedLLM(...responses) {
  let i = 0;
  const calls = [];
  const fn = async (messages) => {
    calls.push(messages);
    if (i >= responses.length) {
      throw new Error(`scriptedLLM exhausted (got ${responses.length} responses, asked for ${i + 1})`);
    }
    return responses[i++];
  };
  fn.calls = calls;
  return fn;
}

test('cast() returns validated value on a happy first pass', async () => {
  const llm = scriptedLLM('{"name":"alice","age":30}');
  const result = await cast({
    llm,
    validate: adapters.shape({ name: 'string', age: 'number' }),
    prompt: 'give me a person',
  });
  assert.deepEqual(result, { name: 'alice', age: 30 });
  assert.equal(llm.calls.length, 1);
});

test("cast() retries with feedback when validation fails, then succeeds", async () => {
  const llm = scriptedLLM(
    '{"name":"alice"}', // missing age — should fail
    '{"name":"alice","age":30}' // correct on retry
  );
  const result = await cast({
    llm,
    validate: adapters.shape({ name: 'string', age: 'number' }),
    prompt: 'give me a person',
    maxRetries: 2,
  });
  assert.deepEqual(result, { name: 'alice', age: 30 });
  assert.equal(llm.calls.length, 2);

  // Second call should include the previous response + the validation error as feedback
  const second = llm.calls[1];
  assert.equal(second.length, 3); // user prompt + assistant response + user feedback
  assert.match(second[2].content, /missing.*age/);
});

test('cast() throws CastError after exhausting retries', async () => {
  const llm = scriptedLLM(
    '{"x":1}',
    '{"x":2}',
    '{"x":3}' // still wrong shape
  );
  await assert.rejects(
    () =>
      cast({
        llm,
        validate: adapters.shape({ name: 'string' }),
        prompt: 'give me a person',
        maxRetries: 2,
      }),
    (err) => {
      assert.ok(err instanceof CastError);
      assert.equal(err.attempts.length, 3);
      assert.match(err.lastError, /missing.*name/);
      assert.equal(err.lastText, '{"x":3}');
      return true;
    }
  );
  assert.equal(llm.calls.length, 3);
});

test('cast() handles models that wrap JSON in prose', async () => {
  const llm = scriptedLLM(
    'Sure! Here you go:\n\n```json\n{"city":"sfo"}\n```\n\nLet me know if you need anything else.'
  );
  const result = await cast({
    llm,
    validate: adapters.shape({ city: 'string' }),
    prompt: 'what city is the airport in',
  });
  assert.deepEqual(result, { city: 'sfo' });
});

test('cast() retries when extraction fails (no JSON in response)', async () => {
  const llm = scriptedLLM(
    'I cannot help with that, sorry.', // no JSON at all
    '{"name":"alice"}'
  );
  const result = await cast({
    llm,
    validate: adapters.shape({ name: 'string' }),
    prompt: 'give me a person',
    maxRetries: 2,
  });
  assert.deepEqual(result, { name: 'alice' });
  assert.match(llm.calls[1][2].content, /No JSON could be extracted/);
});

test('cast() onAttempt fires on each failed attempt', async () => {
  const fired = [];
  const llm = scriptedLLM('{"x":1}', '{"name":"a"}');
  await cast({
    llm,
    validate: adapters.shape({ name: 'string' }),
    prompt: 'p',
    maxRetries: 2,
    onAttempt: (info) => fired.push(info.attempt),
  });
  assert.deepEqual(fired, [1]); // only the first attempt failed; second succeeded
});

test('cast() works with a system message', async () => {
  const llm = scriptedLLM('{"ok":true}');
  await cast({
    llm,
    validate: adapters.shape({ ok: 'boolean' }),
    prompt: 'is it ok',
    system: 'You are precise.',
  });
  assert.equal(llm.calls[0][0].role, 'system');
  assert.equal(llm.calls[0][0].content, 'You are precise.');
});

test('cast() does NOT double-add the JSON instruction if user already asked', async () => {
  const llm = scriptedLLM('{"x":1}');
  await cast({
    llm,
    validate: adapters.shape({ x: 'number' }),
    prompt: 'give me data. Reply with JSON only.',
  });
  const userMsg = llm.calls[0].find((m) => m.role === 'user').content;
  // Should NOT contain 'Respond with ONLY valid JSON' added by us
  assert.equal(
    userMsg.match(/respond with only valid JSON/gi)?.length ?? 0,
    0,
    'should not auto-append when user already asked'
  );
});

test('cast() validates input shape', async () => {
  await assert.rejects(() => cast(null), TypeError);
  await assert.rejects(() => cast({ llm: 'no', validate: () => {}, prompt: 'p' }), TypeError);
  await assert.rejects(() => cast({ llm: async () => '', validate: 'no', prompt: 'p' }), TypeError);
  await assert.rejects(() => cast({ llm: async () => '', validate: () => {}, prompt: '' }), TypeError);
  await assert.rejects(
    () => cast({ llm: async () => '', validate: () => {}, prompt: 'p', maxRetries: -1 }),
    TypeError
  );
});

test('cast() throws TypeError when llm returns non-string', async () => {
  const llm = async () => ({ content: '{"x":1}' }); // user forgot to unwrap
  await assert.rejects(
    () => cast({ llm, validate: () => ({ valid: true }), prompt: 'p' }),
    TypeError
  );
});

test('cast() with predicate validator (no schema lib)', async () => {
  const llm = scriptedLLM('{"score": 0.9}');
  const result = await cast({
    llm,
    validate: adapters.fn(
      (v) => typeof v?.score === 'number' && v.score >= 0 && v.score <= 1,
      'score must be a number between 0 and 1'
    ),
    prompt: 'give me a confidence score',
  });
  assert.deepEqual(result, { score: 0.9 });
});

test('cast() works with a zod-style validator', async () => {
  // Mock zod-style schema (no zod dep needed)
  const fakeSchema = {
    safeParse: (val) => {
      if (typeof val?.email === 'string' && val.email.includes('@')) {
        return { success: true, data: { ...val, email: val.email.toLowerCase() } };
      }
      return {
        success: false,
        error: { issues: [{ path: ['email'], message: 'Invalid email' }] },
      };
    },
  };

  const llm = scriptedLLM('{"email":"USER@example.com"}');
  const result = await cast({
    llm,
    validate: adapters.zod(fakeSchema),
    prompt: 'give me a user email',
  });
  // Validator coerced the email to lowercase; cast() returns the validator's value
  assert.equal(result.email, 'user@example.com');
});
