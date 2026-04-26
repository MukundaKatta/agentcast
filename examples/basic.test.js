/**
 * Basic example: a "model" returns flaky JSON; cast() retries until valid.
 *
 * The mock LLM here simulates a real-world failure mode — first response
 * has a missing field, second response wraps the JSON in prose, third gets
 * it right. Real models do exactly this.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cast, adapters } from '../src/index.js';

const personSchema = adapters.shape({
  name: 'string',
  age: 'number',
  email: 'string',
});

test('cast eventually gets a valid person from a flaky model', async () => {
  let attempt = 0;
  const flakyLLM = async () => {
    attempt++;
    if (attempt === 1) return '{"name":"alice","age":30}'; // missing email
    if (attempt === 2) return 'Sure thing! Here is the user:\n```json\n{"name":"alice","age":"thirty","email":"a@x.com"}\n```'; // age wrong type
    return '{"name":"alice","age":30,"email":"a@x.com"}';
  };

  const result = await cast({
    llm: flakyLLM,
    validate: personSchema,
    prompt: 'give me an example user',
    maxRetries: 3,
  });

  assert.deepEqual(result, { name: 'alice', age: 30, email: 'a@x.com' });
  assert.equal(attempt, 3);
});
