# Security Policy

## Supported Versions

agentcast is at v0.1.x. Security fixes will be issued for the current minor (0.1.x). Older minors will not receive backports.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Use [GitHub's private vulnerability reporting](https://github.com/MukundaKatta/agentcast/security/advisories/new) on this repo, or email `mukunda.vjcs6@gmail.com` with the subject `[agentcast security]`. Include:

- A description of the vulnerability and its impact.
- The version of agentcast affected (`npm ls @mukundakatta/agentcast`).
- Reproduction steps or a minimal proof-of-concept (an LLM response payload + validator is usually enough).
- Any suggested mitigation, if you have one.

You can expect:

- An acknowledgment within 5 business days.
- A status update within 14 days.
- A coordinated disclosure window of at most 90 days from the acknowledgment.

## Specific Risk Surfaces

agentcast wraps an LLM call with a "validate, retry with the error as feedback, return typed data or throw" loop. The model output is **untrusted by default** — every byte that goes into `extractJson` came from a model that may have been prompt-injected. Areas worth special attention:

- **Catastrophic regex backtracking (ReDoS) in `extractJson`.** Pulls JSON out of possibly-prosed text. If you find an LLM-shaped input (long strings of brackets, deeply nested incomplete arrays, repeated unicode escapes) that drives the extractor into super-linear time, that's a high-severity report.
- **Unbounded JSON growth.** A malicious-looking LLM response could try to expand to GB-scale before `JSON.parse` rejects it. If the extractor or the loop can be forced into committing arbitrary-size buffers from a small prompt, please report.
- **Retry-loop fingerprint leak.** The retry path feeds the validator's error message back to the BYO-LLM closure as feedback. If the validator can be coaxed into echoing previous-attempt payloads (including secrets the model emitted by mistake) into the next prompt, that's a data-handling concern worth reporting.
- **Prototype pollution from parsed JSON.** `JSON.parse` of `"__proto__": {...}` doesn't mutate Object.prototype in V8 by default, but downstream merging in the BYO validator might. If a payload can reach `Object.prototype` and survive across `cast()` calls, please report.
- **BYO-LLM closure surface.** Callers pass `llm: async ({ prompt, attempt, lastError }) => string`. The library trusts what the closure returns. If you find a path where the library calls the closure with data it shouldn't (e.g. credentials, environment values, internal retry state that wasn't supposed to be exposed), please report.
- **CLI argument handling.** The bundled CLI parses caller args. Any path where a flag value lets `extractJson` be tricked into reading from the filesystem or executing arbitrary code is a real issue.

## Out of scope

- **LLM hallucination quality.** If the model returns wrong-but-syntactically-valid JSON, that's a prompt / validator problem, not a security problem.
- **Network exfiltration via the LLM call.** agentcast doesn't perform the LLM call itself — your BYO-LLM closure does. For tool-egress controls, see [agentguard](https://github.com/MukundaKatta/agentguard).
- **Provider API key handling.** The BYO-LLM closure handles its own auth. agentcast never sees a key.
- **Validator correctness.** Zod, valibot, JSON Schema, and predicate functions are the user's choice. Bugs in their validation logic should be reported upstream.

## Dependencies

agentcast has **zero** runtime dependencies, by design. The only dev dependency is `c8` for coverage. Any future addition is reviewed for security impact and dependency confusion risk.

We will not pay bug bounties at this time.
