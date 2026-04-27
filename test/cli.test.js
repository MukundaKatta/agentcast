import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../src/cli.js';

/**
 * Capture stdout/stderr from a single main() invocation.
 */
async function captureMain(argv) {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  process.stdout.write = (chunk) => {
    stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    return true;
  };
  try {
    const code = await main(argv);
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

test('--help prints usage and exits 0', async () => {
  const { code, stdout } = await captureMain(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /agentcast v\d/);
  assert.match(stdout, /extract/);
  assert.match(stdout, /validate/);
});

test('extract pulls a JSON object out of prose and exits 0', async () => {
  const text = 'I think the answer is {"answer": "42", "confidence": 0.9}. Hope this helps.';
  const { code, stdout } = await captureMain(['extract', text]);
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.deepEqual(out, { answer: '42', confidence: 0.9 });
});

test('extract handles ```json fenced blocks', async () => {
  const text = 'Here is the data:\n```json\n{"city":"sfo"}\n```\nDone.';
  const { code, stdout } = await captureMain(['extract', text]);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), { city: 'sfo' });
});

test('extract exits 1 when no JSON can be found', async () => {
  const { code, stdout } = await captureMain(['extract', 'just plain prose, no JSON anywhere']);
  assert.equal(code, 1);
  const out = JSON.parse(stdout);
  assert.equal(out.extracted, false);
  assert.match(out.error, /no JSON/i);
});

test('validate exits 0 when value matches the shape', async () => {
  const value = JSON.stringify({ name: 'alice', age: 30 });
  const shape = JSON.stringify({ name: 'string', age: 'number' });
  const { code, stdout } = await captureMain(['validate', value, '--shape', shape]);
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.valid, true);
  assert.deepEqual(out.value, { name: 'alice', age: 30 });
});

test('validate exits 1 and reports the error when value is wrong', async () => {
  const value = JSON.stringify({ name: 'alice' }); // missing required age
  const shape = JSON.stringify({ name: 'string', age: 'number' });
  const { code, stdout } = await captureMain(['validate', value, '--shape', shape]);
  assert.equal(code, 1);
  const out = JSON.parse(stdout);
  assert.equal(out.valid, false);
  assert.match(out.error, /age/);
});

test('unknown subcommand exits 2 with usage error', async () => {
  const { code, stderr } = await captureMain(['nope']);
  assert.equal(code, 2);
  assert.match(stderr, /unknown subcommand/);
});
