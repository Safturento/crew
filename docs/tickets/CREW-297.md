# CREW-297 — A: Gate + conditional GH_TOKEN injection (token-or-MCP)

Jira: https://safturento.atlassian.net/browse/CREW-297
Epic: CREW-296. Plan: `docs/superpowers/plans/2026-06-26-dispatch-github-mcp-auth.md` — Tasks 1–2.

## Goal

Let a dispatched `crew run` agent authorize PR creation through **either** the
GitHub MCP **or** a per-repo gh-token. Introduce a shared channel resolver, wire
a fail-fast pre-flight gate that passes when ≥1 channel is configured, and make
the `GH_TOKEN` copy/read/injection conditional on the token actually existing.

## Relevant files

- `packages/cli/src/lib/github-auth/resolve.ts` (new) — `hasRepoToken`, `userMcpHasGithubServer`, `resolveGithubAuth`, `requireGithubAuth`.
- `packages/cli/src/lib/github-auth/index.ts` (new) — barrel.
- `packages/cli/src/commands/run.ts` — replace `requireGhToken` gate with `requireGithubAuth`; conditional token copy/read/inject.
- `packages/cli/src/lib/run/preconditions.ts` — drop `requireGhToken`, keep `requireWorktreeAvailable`.
- `packages/cli/src/lib/run/preconditions.test.ts` — drop the `requireGhToken` describe block.

## Decisions

- **Presence-only credential checks** — never read the gh-token's contents (only `existsSync` + `statSync().size`); never echo `~/.claude.json` (it may carry an MCP `Authorization` token). 2026-06-26.
- **OR logic** — `resolveGithubAuth.ok = hasToken || hasMcp`. The run-path gate and `crew doctor` both consume this (doctor is child C / Task 6, out of scope here).
- **Conditional injection** — `GH_TOKEN` is spread into the dispatched child env only when a token file exists, mirroring the existing `resolvedAppUrl` conditional-spread pattern.

## Notes

Branch cut from `origin/main` before the plan PR (#428) merged, so the plan doc
isn't on disk — followed it by reading from `origin/docs/dispatch-github-mcp-auth-spec`.
Scope is Tasks 1–2 only (Epic-child A). Tasks 3–8 are children B and C.

This is CLI/backend-only — no UI, no HTTP routes. Visual-fidelity and bruno
endpoint-coverage steps do not apply; `bruno:smoke` still runs as a daemon
liveness check during verification.
