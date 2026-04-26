# agentcast

**Structured output for any LLM call.** Validate the model's response, retry with the validation error as feedback, return typed data or throw after N attempts. Bring your own LLM, bring your own validator (zod, valibot, JSON Schema, plain predicate). Zero runtime dependencies.

```bash
npm install @mukundakatta/agentcast
```

```js
import { cast, adapters } from '@mukundakatta/agentcast';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const productSchema = z.object({
  name: z.string(),
  price: z.number(),
  in_stock: z.boolean(),
  tags: z.array(z.string()),
});

const product = await cast({
  llm: async (messages) => {
    const r = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return r.content[0].text;
  },
  validate: adapters.zod(productSchema),
  prompt: 'Generate one example product.',
  maxRetries: 3,
});

// product is { name, price, in_stock, tags } — guaranteed shape, or it threw.
```

If the model returns prose-wrapped JSON, returns the wrong type for a field, forgets a field, or refuses to return JSON at all, `cast()` extracts what it can, runs your validator, and feeds the validation error back to the model on the next attempt. After `maxRetries` it throws `CastError` with the full attempt history.

TypeScript types ship in the box.

### See it in action

```bash
git clone https://github.com/MukundaKatta/agentcast && cd agentcast
node examples/demo-retry.js
```

Stubbed "LLM" returns invalid JSON twice and clean JSON the third time. Watch the message history grow as feedback gets appended.

## Why

Every agent that returns structured data hits the same problems:

- The model wraps JSON in `Sure! Here you go:` prose
- Wraps it in ```` ```json ```` fences
- Returns `"thirty"` when you needed `30`
- Returns the wrong shape entirely
- Refuses with "I cannot help with that"

Ad-hoc retry loops sprawl through agent codebases. `cast()` is the small, focused primitive that handles the standard pattern in one place: extract → validate → feedback → retry → throw.

Other libraries that touch this problem:
- **Vercel `ai`'s `generateObject`** — great if you're in Vercel's ecosystem; this is the standalone version for any LLM call.
- **Python's `instructor`** — same pattern, different language. This is the JS sibling.

## API

### `cast(opts) → Promise<T>`

The retry loop.

```js
await cast({
  llm: async (messages) => '...',           // required: your LLM call
  validate: (value) => ({ valid: true }),   // required: validation function
  prompt: 'give me data',                   // required: the user prompt
  system: 'You are precise.',               // optional: system message
  maxRetries: 2,                            // optional: total attempts = 1 + maxRetries (default 2)
  onAttempt: (info) => console.log(info),   // optional: per-failed-attempt callback
});
```

Behavior:
- Calls `llm(messages)` and expects a string back.
- Pulls JSON via `extractJson()` (handles whole-text JSON, ```` ```json ```` fences, and the largest balanced `{...}`/`[...]` substring in prose).
- Calls `validate(value)`. If `{ valid: true, value }`, returns `value` (or the original if `value` is undefined).
- If extraction or validation fails, appends the assistant's response and a feedback message asking it to try again, then re-calls the LLM.
- After `maxRetries` failures, throws `CastError` with the full attempt history.

### `extractJson(text) → any | null`

Pulls JSON out of an LLM response. Tries: whole text, ```` ```json ```` fence, plain ```` ``` ```` fence, largest balanced `{...}`/`[...]` substring. Returns the parsed value or `null`. Useful standalone if you want to handle the retry yourself.

### `adapters.zod(schema)`

Bridge for any validator with a `safeParse()` method (zod, valibot, etc.).

```js
import { z } from 'zod';
import { adapters } from '@mukundakatta/agentcast';

const validate = adapters.zod(z.object({ name: z.string() }));
```

### `adapters.fn(predicate, errorBuilder?)`

For ad-hoc predicate validation, no schema lib needed.

```js
const validate = adapters.fn(
  (v) => typeof v?.score === 'number' && v.score >= 0 && v.score <= 1,
  (v) => `score must be between 0 and 1, got ${v?.score}`
);
```

### `adapters.shape(spec)`

Tiny built-in shape checker for when you want zero deps end-to-end.

```js
const validate = adapters.shape({
  name: 'string',
  age: 'number',
  active: 'boolean?',  // suffix '?' for optional
  tags: 'array',
  meta: 'object',
});
```

Not a full JSON Schema validator — just enough to gate basic shapes. For richer constraints, use zod.

### `CastError`

Thrown when retries are exhausted.

```js
import { CastError } from '@mukundakatta/agentcast';

try {
  await cast(...);
} catch (err) {
  if (err instanceof CastError) {
    console.error('failed after', err.attempts.length, 'attempts');
    console.error('last error:', err.lastError);
    console.error('last text:', err.lastText);
    console.error('last parsed:', err.lastParsed);
    console.error('full history:', err.attempts);
  }
}
```

## Recipes

### With the OpenAI SDK

```js
import OpenAI from 'openai';
const openai = new OpenAI();

await cast({
  llm: async (messages) => {
    const r = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return r.choices[0].message.content;
  },
  validate: adapters.shape({ summary: 'string', sentiment: 'string' }),
  prompt: 'Analyze this review: ...',
});
```

### Without any schema library (pure predicate)

```js
const isISO8601 = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s);

const event = await cast({
  llm: myLLM,
  prompt: 'Extract the event date as ISO 8601.',
  validate: adapters.fn(
    (v) => isISO8601(v?.date),
    (v) => `expected { date: ISO8601 string }, got ${JSON.stringify(v)}`
  ),
});
```

### Logging every retry

```js
await cast({
  llm,
  validate,
  prompt,
  maxRetries: 5,
  onAttempt: ({ attempt, text, error }) => {
    console.log(`[cast attempt ${attempt} failed]`, { error, text });
  },
});
```

## What this is not

- **Not a model client.** You bring the LLM call. Works with any SDK, any HTTP client, any local model.
- **Not a prompt framework.** It just handles the validate-and-retry loop. Compose with your existing prompt code.
- **Not a tool-call validator.** This is for the model's *output* shape, not the tool calls it makes mid-conversation. For tool-call regressions, see [@mukundakatta/agentsnap](https://www.npmjs.com/package/@mukundakatta/agentsnap).

## Sibling libraries

Part of the agent reliability stack — all `@mukundakatta/*` scoped, all zero-dep:

- [`@mukundakatta/agentfit`](https://www.npmjs.com/package/@mukundakatta/agentfit) — fit messages to budget. *Fit it.*
- [`@mukundakatta/agentsnap`](https://www.npmjs.com/package/@mukundakatta/agentsnap) — snapshot tests for tool-call traces. *Test it.*
- [`@mukundakatta/agentguard`](https://www.npmjs.com/package/@mukundakatta/agentguard) — network egress firewall. *Sandbox it.*
- [`@mukundakatta/agentvet`](https://www.npmjs.com/package/@mukundakatta/agentvet) — tool-arg validator. *Vet it.*
- **`@mukundakatta/agentcast`** — structured output enforcer. *Validate it.* (this)

Natural pipeline: **fit → guard → snap → vet → cast**.

## Status

v0.1.0 — initial release. Core API stable. TypeScript types included. 37/37 tests, CI on Node 20/22/24.

**v0.2 plans** (post-real-world-feedback):
- Streaming variant (parse JSON as it streams in, fail fast on bad shape)
- JSON-mode hint generation (auto-build the OpenAI/Anthropic JSON-mode params if user opts in)
- Cost-aware max budget (skip retry if next attempt would exceed a $/token cap)

## License

MIT
