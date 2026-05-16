<!--
Thanks for sending a PR to agentcast.

Quick reminders before you submit:
  - Zero runtime dependencies. A PR that adds one will be sent back to discussion first.
  - The retry loop must never thread previous-attempt payload content into the next prompt; only the validator's error message is fed back.
  - extractJson runs on untrusted, possibly-prompt-injected LLM output. Any new regex must be checked for catastrophic backtracking.
  - Tests live in test/ and run via `npm test`. Add an adversarial extract case for any new heuristic.
-->

## What this changes

A one-line summary, then a short paragraph if needed.

## Why

The user-visible bug or workflow gap this addresses.

## Type of change

- [ ] Bug fix in `cast()` / `extractJson()` / an `adapter`
- [ ] New extract heuristic
- [ ] New validator adapter
- [ ] Numerical / parsing edge case
- [ ] Test coverage (especially adversarial extract inputs)
- [ ] Documentation
- [ ] CI / build / release plumbing

## Security review

- [ ] If this changes `extractJson`, I added an adversarial test for catastrophic regex backtracking (long bracket runs, deeply nested incomplete arrays, repeated unicode escapes).
- [ ] If this changes the retry loop, only the validator's error message is fed back to the BYO-LLM closure; no raw previous-attempt payload content is threaded forward.
- [ ] If this changes the public surface, the `extract-bomb` CI smoke still completes in bounded time on the 100k-bracket input.

## Scope check

- [ ] No new runtime dependencies added (enforced by CI).
- [ ] If this changes the threat-model surface, `SECURITY.md` was updated in the same PR.

## Validation

- [ ] `npm run test:all` passes locally (unit + examples)
- [ ] `npm run test:coverage` still meets the configured thresholds (70% branches / 80% lines+functions+statements)
- [ ] Public API changes are reflected in `src/index.d.ts`

## Linked issue

Closes #
