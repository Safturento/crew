# CREW-299 — C: github-auth-present health check + init softening + docs

Jira: https://safturento.atlassian.net/browse/CREW-299
Epic: CREW-296. Plan: `docs/superpowers/plans/2026-06-26-dispatch-github-mcp-auth.md` — Tasks 6–8.

## Goal

Finish Epic CREW-296's doctor + init + docs surface for the token-or-MCP auth
model. Replace the token-only `gh-token-present` health check with an OR-check
(`github-auth-present`) that consumes child A's `resolveGithubAuth`, soften the
`crew init` scaffold + message so the gh-token reads as an *optional* fallback to
the GitHub MCP, and document the model in `README.md` + `.agents/dispatch.md`.

## Relevant files

- `packages/cli/src/lib/health/checks/github-auth-present.ts` (new) — OR-check; consumes `resolveGithubAuth`. Replaces `gh-token-present.ts`.
- `packages/cli/src/lib/health/checks/github-auth-present.test.ts` (new).
- `packages/cli/src/lib/health/registry.ts` + `registry.test.ts` — swap the registered check.
- `packages/cli/src/lib/health/checks/gh-token-present.ts` + test — deleted.
- `packages/cli/src/lib/init/scaffold-gh-token.ts` — doc-comment softening (behavior unchanged).
- `packages/cli/src/lib/init/run-init.ts` + `run-init.test.ts` — dual-channel init message.
- `README.md` — "GitHub token" → "GitHub access for dispatch (MCP or token)".
- `.agents/dispatch.md` — `gh-token-present` → `github-auth-present` doctor-table row.

## Decisions

- **OR-check reuses `resolveGithubAuth`** — the doctor check and the run-path
  `requireGithubAuth` gate now agree: dispatch is GitHub-authorized when EITHER a
  per-repo token OR a user-level GitHub MCP is present. 2026-06-26.
- **`fix()` unchanged** — still scaffolds the optional token slot via the shared
  `scaffoldGhToken`; it can't supply a credential, so a fully-unconfigured machine
  (no MCP, no token) stays red after `--fix`.
- **Hermetic fail-case test** — `github-auth-present.detect` accepts an optional
  `homeDir` override so the fail test points at a clean temp dir, not the real
  `~/.claude.json` (which may declare a GitHub MCP in CI / on this machine).
- **Presence-only** — never reads token contents or echoes `~/.claude.json`.

## Notes

CLI/backend + docs only — no UI, no HTTP routes. Visual-fidelity and bruno
endpoint-coverage steps do not apply; `bruno:smoke` still runs as a daemon
liveness check during verification.
