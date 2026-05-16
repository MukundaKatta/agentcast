import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractJson } from '../src/extract.js';

test('extractJson() parses whole-text JSON', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('  {"a":1}  '), { a: 1 });
  assert.deepEqual(extractJson('[1,2,3]'), [1, 2, 3]);
});

test('extractJson() handles ```json fenced blocks', () => {
  const text = 'Here is the data:\n```json\n{"city":"sfo"}\n```\nDone.';
  assert.deepEqual(extractJson(text), { city: 'sfo' });
});

test('extractJson() handles plain ``` fenced blocks', () => {
  const text = '```\n{"x":42}\n```';
  assert.deepEqual(extractJson(text), { x: 42 });
});

test('extractJson() finds the largest balanced object in prose', () => {
  const text = 'I think the answer is {"answer": "42", "confidence": 0.9}. Hope this helps.';
  assert.deepEqual(extractJson(text), { answer: '42', confidence: 0.9 });
});

test('extractJson() handles nested objects in prose', () => {
  const text = 'Result: {"user":{"name":"alice","age":30},"city":"sfo"}';
  assert.deepEqual(extractJson(text), { user: { name: 'alice', age: 30 }, city: 'sfo' });
});

test('extractJson() handles arrays in prose', () => {
  const text = 'The list is [1, 2, 3, {"nested": true}]';
  assert.deepEqual(extractJson(text), [1, 2, 3, { nested: true }]);
});

test('extractJson() picks the LARGEST balanced JSON when multiple exist', () => {
  const text = 'Small: {} Big: {"a":1,"b":[1,2,3]}';
  assert.deepEqual(extractJson(text), { a: 1, b: [1, 2, 3] });
});

test('extractJson() ignores braces inside strings', () => {
  const text = 'Got: {"msg": "hello {world}", "n": 1}';
  assert.deepEqual(extractJson(text), { msg: 'hello {world}', n: 1 });
});

test('extractJson() ignores escaped quotes inside strings', () => {
  const text = '{"msg": "she said \\"hi\\"", "n": 1}';
  assert.deepEqual(extractJson(text), { msg: 'she said "hi"', n: 1 });
});

test('extractJson() returns null when no parseable JSON found', () => {
  assert.equal(extractJson('I have no JSON for you.'), null);
  assert.equal(extractJson(''), null);
  assert.equal(extractJson('   '), null);
});

test('extractJson() returns null on non-string input', () => {
  assert.equal(extractJson(null), null);
  assert.equal(extractJson(undefined), null);
  assert.equal(extractJson(42), null);
  assert.equal(extractJson({}), null);
});

test('extractJson() handles unterminated brackets gracefully', () => {
  // Half-broken JSON: we should fall through cleanly, not throw
  assert.equal(extractJson('{"a": 1'), null);
  assert.equal(extractJson('text {"a"'), null);
});

test('extractJson() runs in bounded time on adversarial bracket-bomb input', () => {
  // Regression test for the O(N^2) bug fixed in this commit.
  //
  // Before the fix: `extractLargestBalanced` re-scanned the tail of the
  // input for every '{' or '[' position, giving quadratic time. On a
  // 100k-bracket input (~200KB, well within real LLM response sizes),
  // this took ~14 seconds locally — long enough that a prompt-injected
  // model response could hang any agentcast-using test.
  //
  // After the fix: single-pass with two open-bracket stacks. Same input
  // returns in ~2 ms on the same hardware.
  //
  // We assert "under 1000 ms" rather than "under 5 ms" so the test stays
  // green on slow CI runners without losing the regression signal. The
  // pre-fix behavior was 14000+ ms; anything in that ballpark would fail
  // this bound by orders of magnitude.
  const noise = '[{'.repeat(50_000) + '\\u00'.repeat(100);
  const start = process.hrtime.bigint();
  const out = extractJson(noise);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(out, null, 'unterminated input should return null');
  assert.ok(
    elapsedMs < 1000,
    `extractJson on 100k brackets took ${elapsedMs.toFixed(1)}ms; expected < 1000ms`,
  );
});
