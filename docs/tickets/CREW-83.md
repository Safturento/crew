# CREW-83 — Preflight scaffold + dispatch integration

Jira: https://safturento.atlassian.net/browse/CREW-83

## Goal

Lay the orchestrator + types for the agent-dispatch preflight (CREW-82),
wire it into the existing shared `prepareAgentEnvironment`, and convert
`fresh` mode's docker bringup from background-fire-and-forget to `await`.
With no checks registered yet, `runPreflight` no-ops cleanly — Tickets B
(CREW-84) and C (CREW-85) land their checks on top.

## Relevant files

- `packages/cli/src/lib/preflight/types.ts` — new; `PreflightCheck`,
  `PreflightCheckContext`, `PreflightError` class.
- `packages/cli/src/lib/preflight/run-preflight.ts` — new; orchestrator
  iterates the `checks[]` array, each check runs with `{ config, worktree }`.
- `packages/cli/src/lib/preflight/render-error.ts` — new; structured stderr
  renderer matching spec §4.1/§4.2 (right-padded key column, min 8-char pad
  so `fix:` aligns even with no details).
- `packages/cli/src/lib/preflight/build-checks.ts` — new; returns `[]` for
  now. Tickets B + C extend to register their checks.
- `packages/cli/src/lib/preflight/index.ts` — barrel.
- `packages/cli/src/lib/run/agent-environment.ts` — MOD; `fresh` mode now
  awaits `startDockerBringup` and throws on non-zero rc; calls
  `runPreflight` after the playwright install block.
- `packages/cli/src/commands/{run,resume,fix-pr}.ts` — MOD; catch
  `PreflightError` from `prepareAgentEnvironment`, render structured
  stderr, then `process.exit(1)`. Other errors fall through to existing
  handlers.

## Decisions

- **Min 8-char column pad in `renderPreflightError`** — the plan's snippet
  paths-mismatched its own test (`fix:    do thing` with 4 trailing spaces
  in the no-details case versus a 5-char fallback in the renderer). I went
  with the test's intent: enforce a minimum padding of 8 so the `fix:` line
  aligns consistently with the spec's example output regardless of detail
  set. This is what spec §4.1 / §4.2 both render at.
- **`void config` in `buildPreflightChecks`** — eslint's `no-unused-vars`
  is configured without an `argsIgnorePattern: '^_'` override, so the
  underscore-prefix pattern triggers a lint error. Using `void config`
  silences the warning without adding a project-level config change. B/C
  will wire `config` into real branching, dropping the void.
- **Preserve `result.dockerProcess` after awaiting** — the property is now
  an already-resolved promise rather than an in-flight one, but
  `run.ts:451-469` still references it for the post-agent docker wait /
  exitCode read. Leaving it in place keeps that code path working without
  a wider refactor in this ticket.

## Notes

Tasks 1–4 of `docs/superpowers/plans/2026-05-03-agent-dispatch-preflight.md`
(plan lives on `docs/agent-dispatch-preflight` branch, not yet merged to
main at the time this ticket was implemented).
