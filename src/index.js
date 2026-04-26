/**
 * agentcast — structured output for any LLM call.
 *
 * Public surface:
 *   - cast({ llm, prompt, validate, ... })  validate model response, retry on failure
 *   - extractJson(text)                     pull JSON out of a possibly-prosed response
 *   - adapters.zod(schema)                  bridge for zod-style validators (safeParse)
 *   - adapters.fn(predicate, errorBuilder)  bridge for arbitrary predicate functions
 *   - CastError                             thrown when all retries exhausted
 */

export { cast } from './cast.js';
export { extractJson } from './extract.js';
export { adapters } from './adapters.js';
export { CastError } from './errors.js';
export { VERSION } from './version.js';
