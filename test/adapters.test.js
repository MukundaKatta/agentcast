import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adapters } from '../src/adapters.js';

// --- shape ---

test('adapters.shape: validates required string/number/boolean/array/object fields', () => {
  const v = adapters.shape({
    name: 'string',
    age: 'number',
    active: 'boolean',
    tags: 'array',
    meta: 'object',
  });
  const ok = v({ name: 'a', age: 1, active: true, tags: [], meta: {} });
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.value, { name: 'a', age: 1, active: true, tags: [], meta: {} });
});

test('adapters.shape: collects multiple errors per validation', () => {
  const v = adapters.shape({ name: 'string', age: 'number' });
  const r = v({ name: 42, age: 'old' });
  assert.equal(r.valid, false);
  assert.match(r.error, /name.*string/);
  assert.match(r.error, /age.*number/);
});

test('adapters.shape: missing required field is an error', () => {
  const v = adapters.shape({ name: 'string' });
  const r = v({});
  assert.equal(r.valid, false);
  assert.match(r.error, /missing.*name/);
});

test('adapters.shape: optional fields (suffix ?) skip when absent', () => {
  const v = adapters.shape({ name: 'string', nickname: 'string?' });
  const r1 = v({ name: 'a' });
  assert.equal(r1.valid, true);
  const r2 = v({ name: 'a', nickname: 'b' });
  assert.equal(r2.valid, true);
});

test('adapters.shape: rejects non-objects (null, array, string)', () => {
  const v = adapters.shape({ x: 'string' });
  assert.equal(v(null).valid, false);
  assert.equal(v([]).valid, false);
  assert.equal(v('hi').valid, false);
});

test('adapters.shape: NaN does not pass number check', () => {
  const v = adapters.shape({ x: 'number' });
  assert.equal(v({ x: NaN }).valid, false);
});

// --- fn ---

test('adapters.fn: predicate-only validator', () => {
  const v = adapters.fn((n) => typeof n === 'number' && n > 0);
  assert.equal(v(5).valid, true);
  assert.equal(v(-1).valid, false);
});

test('adapters.fn: error builder as string', () => {
  const v = adapters.fn(() => false, 'nope');
  assert.equal(v(0).error, 'nope');
});

test('adapters.fn: error builder as function', () => {
  const v = adapters.fn(
    (n) => n > 0,
    (n) => `expected positive, got ${n}`
  );
  assert.equal(v(-3).error, 'expected positive, got -3');
});

test('adapters.fn: rejects bad input', () => {
  assert.throws(() => adapters.fn(null), TypeError);
});

// --- zod ---

test('adapters.zod: passes through safeParse success', () => {
  const fakeSchema = {
    safeParse: (val) => ({ success: true, data: { coerced: val } }),
  };
  const v = adapters.zod(fakeSchema);
  const r = v({ raw: 1 });
  assert.equal(r.valid, true);
  assert.deepEqual(r.value, { coerced: { raw: 1 } });
});

test('adapters.zod: formats safeParse failure with path + message', () => {
  const fakeSchema = {
    safeParse: () => ({
      success: false,
      error: {
        issues: [
          { path: ['user', 'age'], message: 'Expected number' },
          { path: [], message: 'something else' },
        ],
      },
    }),
  };
  const v = adapters.zod(fakeSchema);
  const r = v({});
  assert.equal(r.valid, false);
  assert.match(r.error, /user\.age: Expected number/);
  assert.match(r.error, /<root>: something else/);
});

test('adapters.zod: throws if schema lacks safeParse', () => {
  assert.throws(() => adapters.zod({}), TypeError);
  assert.throws(() => adapters.zod(null), TypeError);
});
