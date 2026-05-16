---
name: Feature request
about: Propose a new adapter, a new extract heuristic, or a behavior change.
title: "[feat] "
labels: enhancement
assignees: ''
---

## Scope check

Before opening, please confirm this proposal fits the project scope:

- [ ] It does **not** add a runtime dependency. (Zero deps is a hard line; adapters for zod/valibot/etc. are intentionally pure-shape bridges, not deps on those libraries.)
- [ ] It does **not** perform the LLM call itself. (agentcast is BYO-LLM. If you want a built-in adapter for the Anthropic / OpenAI SDK, it belongs in a separate sibling package.)
- [ ] It does **not** widen the retry surface in a way that lets failed-attempt payloads leak. (The retry loop currently passes only the validator's error message back to the next prompt. Proposals that thread more state need a SECURITY review.)

If any of those are unchecked, the right home is probably a separate package that depends on agentcast.

## What you want

A clear description of the proposed feature.

## Why

What real-world structured-output workflow does this address? Concrete example of the prompt + validator + LLM combination that would benefit.

## Proposed API shape

```jsonc
// new export, option, or adapter:
// signature:
// failure mode:
```

## Threat-model impact

Does this change the surfaces in `SECURITY.md`?

- [ ] No — orthogonal feature, no new bypass surface.
- [ ] Yes — and here is what I'd add to SECURITY.md: ...

## Alternatives considered

What workarounds exist today (raw `JSON.parse` + try-catch, instructor.js, langchain's `OutputParser`) and why aren't they good enough?
