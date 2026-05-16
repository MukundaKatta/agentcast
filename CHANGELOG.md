# Changelog

## [Unreleased]

Production-polish branch (this PR): adds `SECURITY.md` (with the ReDoS / unbounded-JSON / retry-loop fingerprint surfaces called out), `CODE_OF_CONDUCT.md`, `CODEOWNERS` flagging `extract.js` + `cast.js` for extra scrutiny, Dependabot config, issue + PR templates (security routing for ReDoS reports), release workflow with npm provenance OIDC + zero-deps + extract-bomb smoke, expanded CI (macOS + Windows spot-checks, coverage gate, `npm pack` content check, extract-bomb smoke that asserts `extractJson` returns in bounded time on a 100k-bracket input). No source changes.

## [0.1.2] — 2026-04-28

### Added
- `c8` coverage tooling: `npm run test:coverage` reports per-file coverage
  and gates the build at 70% branches / 80% lines+functions+statements.
- `CHANGELOG.md`, `CONTRIBUTING.md`.
- Top-of-README badges (npm version, downloads, license, Node, tests).
- `Status` line in README now matches the actual test count (44).

### Notes
This is a tooling-only patch; no runtime behavior changed. Pinning at
0.1.2 keeps the agent-stack family (agentfit / agentguard / agentcast /
agentsnap / agentvet / agenttrace) on a unified version line.

## [0.1.1] — 2026-04-25

Initial published release. Structured-output validate-and-retry primitive. Core API stable, TypeScript types,
CI matrix on Node 20/22/24.

## [0.1.0]

Pre-release placeholder.
