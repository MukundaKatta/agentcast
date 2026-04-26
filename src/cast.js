import { extractJson } from './extract.js';
import { CastError } from './errors.js';

/**
 * Get a typed/validated structured value out of any LLM call.
 *
 * The flow:
 *   1. Call llm(messages) to get text.
 *   2. Extract JSON from the text (handles fences and prose-wrapped JSON).
 *   3. Run validate(value) on the extracted JSON.
 *   4. If validation passes → return validated value.
 *   5. If validation fails → append the error to messages as feedback and retry,
 *      up to maxRetries times. After exhausting retries, throw CastError.
 *
 * The library is BYO-LLM and BYO-validator: you pass an `llm` function and a
 * `validate` function. Adapters for zod-style schemas live in `./adapters.js`.
 *
 * @param {CastOptions} opts
 * @returns {Promise<any>}
 */
export async function cast(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('cast: opts must be an object');
  }
  const { llm, validate, prompt, system } = opts;
  if (typeof llm !== 'function') {
    throw new TypeError('cast: llm must be a function (messages) => Promise<string>');
  }
  if (typeof validate !== 'function') {
    throw new TypeError('cast: validate must be a function (value) => { valid, value? | error? }');
  }
  if (typeof prompt !== 'string' || !prompt) {
    throw new TypeError('cast: prompt must be a non-empty string');
  }

  const maxRetries = opts.maxRetries ?? 2; // total attempts = 1 + maxRetries
  if (typeof maxRetries !== 'number' || maxRetries < 0) {
    throw new TypeError('cast: maxRetries must be a non-negative number');
  }

  const onAttempt = typeof opts.onAttempt === 'function' ? opts.onAttempt : null;

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: appendJsonInstruction(prompt) });

  /** @type {import('./errors.js').Attempt[]} */
  const attempts = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const text = await llm(messages);

    if (typeof text !== 'string') {
      throw new TypeError(
        `cast: llm() must return a string, got ${typeof text}. ` +
          `If your LLM call returns a richer object, unwrap the text content first.`
      );
    }

    const parsed = extractJson(text);

    if (parsed === null) {
      const error = 'No JSON could be extracted from the response.';
      attempts.push({ text, parsed: null, error });
      if (onAttempt) onAttempt({ attempt: attempt + 1, text, parsed: null, error });
      pushFeedback(messages, text, error);
      continue;
    }

    const result = validate(parsed);
    if (result && result.valid === true) {
      return result.value !== undefined ? result.value : parsed;
    }
    const error =
      result && typeof result.error === 'string'
        ? result.error
        : 'Validation failed (no error message provided).';
    attempts.push({ text, parsed, error });
    if (onAttempt) onAttempt({ attempt: attempt + 1, text, parsed, error });
    pushFeedback(messages, text, error);
  }

  throw new CastError(
    `cast: failed validation after ${attempts.length} attempt${attempts.length === 1 ? '' : 's'}. ` +
      `Last error: ${attempts[attempts.length - 1]?.error ?? '(unknown)'}`,
    attempts
  );
}

function appendJsonInstruction(prompt) {
  // Idempotent — don't double-add if the user already asked for JSON
  if (/\bonly\s+json\b/i.test(prompt) || /reply\s+with\s+json/i.test(prompt)) {
    return prompt;
  }
  return prompt + '\n\nRespond with ONLY valid JSON. No prose, no markdown fences.';
}

function pushFeedback(messages, assistantText, error) {
  messages.push({ role: 'assistant', content: assistantText });
  messages.push({
    role: 'user',
    content:
      `Your previous response did not match the required shape. ` +
      `Error: ${error}\n\n` +
      `Try again. Respond with ONLY valid JSON that fixes the error above.`,
  });
}

/**
 * @typedef {Object} CastOptions
 * @property {(messages: { role: string, content: string }[]) => Promise<string>} llm
 *   Your LLM call function. Receives the message history; must return the
 *   assistant's text response (NOT a streaming object — unwrap it first).
 * @property {(value: any) => { valid: true, value?: any } | { valid: false, error: string }} validate
 *   Validation function. Use one of `adapters.zod(schema)`, `adapters.fn(...)`,
 *   or `adapters.shape(...)` from './adapters.js', or pass your own.
 * @property {string} prompt
 *   The user prompt. cast() appends an explicit "Respond with ONLY valid JSON"
 *   instruction unless the prompt already contains one.
 * @property {string} [system]
 *   Optional system message added at the front of the message history.
 * @property {number} [maxRetries]
 *   How many times to retry on validation failure. Total LLM calls = 1 + maxRetries.
 *   Default: 2 (so up to 3 attempts).
 * @property {(info: { attempt: number, text: string, parsed: any, error: string }) => void} [onAttempt]
 *   Called after each failed attempt. Useful for logging/telemetry.
 */
