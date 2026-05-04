# CREW-85 — Check 2 + Check 3: sandbox config awareness

Jira: https://safturento.atlassian.net/browse/CREW-85

## Goal

Implement Checks 2 and 3 of the agent-dispatch preflight (CREW-82). Check 2
reads `<worktree>/.claude/settings.json` and asserts `sandbox.excludedCommands`
contains the smoke / authored-e2e commands required by the project's enabled
`[bruno_smoke]` / `[playwright].authored` blocks. Check 3 adds a generalized
"Sandboxed-curl is misleading" section to the run / resume / fix-pr prompts so
the agent stops misreading "bruno succeeded" as "the app port is up."

## Relevant files

- `packages/cli/src/lib/preflight/verify-excluded-commands.ts` — new; Check 2
  implementation.
- `packages/cli/src/lib/preflight/build-checks.ts` — registers the check when
  `[bruno_smoke].enabled` or `[playwright].authored.enabled` is set.
- `packages/cli/src/lib/prompts/templates/sandbox-network-note.md` — new
  prompt partial.
- `packages/cli/src/lib/prompts/sandbox-network-note.ts` — shared builder
  consumed by `ticket.ts`, `resume.ts`, `fix-pr.ts`.
- `packages/cli/src/lib/prompts/templates/{ticket,resume,fix-pr}.md` — added
  `{{sandboxNetworkBlock}}` placeholder.
- `packages/cli/src/lib/run/agent-environment.test.ts` — stubs
  `buildPreflightChecks` to `[]` in pre-existing docker / playwright tests
  that don't assert preflight behavior (the dedicated `preflight integration`
  block still drives the orchestrator end-to-end).

## Decisions

- **Stub `buildPreflightChecks` in pre-existing docker tests.** Registering
  Check 2 in `buildPreflightChecks` made existing docker / playwright tests
  with `bruno_smoke.enabled = true` start exercising the real
  `verifyExcludedCommandsCheck` against a fake `/wt` worktree. They were
  testing the docker pipeline, not preflight, so the right fix is to mock
  `buildPreflightChecks` in their `beforeEach` rather than scaffold a real
  `.claude/settings.json` for each test.
- **Did not register `probeAppUrlsCheck`.** The plan's reference snippet for
  `build-checks.ts` includes it, but Check 1 is CREW-84's responsibility and
  not yet merged to `main`. Adding a check here would either import a
  non-existent module or be dead code; left untouched.

## Notes

Tasks 9–13 of `docs/superpowers/plans/2026-05-03-agent-dispatch-preflight.md`
(plan lives on `docs/agent-dispatch-preflight` branch, not yet merged at the
time this ticket was implemented).

Manual smoke (Task 13) was performed via inline tsx script rather than a
real `crew run` invocation against an external project, since this work
runs in an autonomous worktree without access to a configured sample
project. The script renders all three prompt variants and triggers both
Check 2 failure cases (file-missing, entry-missing); output captured in
the PR description.
