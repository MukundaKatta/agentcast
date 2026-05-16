---
name: Bug report (non-security)
about: cast() retries when it shouldn't (or stops when it shouldn't), extractJson misses obvious JSON, an adapter doesn't bridge to your validator. Not for ReDoS / extract-bomb / payload-leak reports.
title: "[bug] "
labels: bug
assignees: ''
---

> ⚠ **Found an extractJson input that hangs the process, or a path where previous-attempt LLM output leaks into the next prompt?** Stop. Use [GitHub's private vulnerability reporting](https://github.com/MukundaKatta/agentcast/security/advisories/new) instead of this template. See `SECURITY.md`.

## What happened

A clear, concise description of the actual behavior.

## What you expected

A clear, concise description of what should have happened.

## Reproduction

Minimal repro using only this library:

```js
import { cast, adapters, CastError } from '@mukundakatta/agentcast';

// the smallest validator that reproduces (use a fake LLM)
const validate = adapters.fn(
  (v) => typeof v?.name === 'string',
  (v) => 'name must be a string',
);

let attempts = 0;
const fakeLlm = async ({ prompt, attempt, lastError }) => {
  attempts++;
  // the model response that triggered the bug
  return '{"name": 123}';
};

try {
  const out = await cast({ llm: fakeLlm, prompt: '...', validate, maxAttempts: 2 });
  // observed: ...
  // expected: ...
} catch (err) {
  if (err instanceof CastError) {
    console.log('cast error:', err.attempts, err.lastError);
  } else {
    throw err;
  }
}
```

For `extractJson` bugs, paste the **exact** string you fed it:

```js
import { extractJson } from '@mukundakatta/agentcast';

const input = `...paste here, anonymized but byte-identical to what failed...`;
console.log(extractJson(input));
// observed: ...
// expected: ...
```

## Environment

- agentcast version: (`npm ls @mukundakatta/agentcast`)
- Node version: (`node --version` — agentcast requires Node 20+)
- OS: (macOS 14 / Ubuntu 22.04 / Windows 11)
- Validator library: (zod / valibot / ajv / plain predicate) + version
- LLM provider you wired into the BYO closure: (anthropic / openai / bedrock / groq / local)

## Notes

Anything else — whether the failing run was deterministic or only happens with certain models, whether the LLM closure returns plain JSON or JSON-in-markdown-fences, anything else suspicious.
