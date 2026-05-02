# CREW-76 — Add post-agent Playwright e2e verify gate (host-side, with fix-pr loopback)

Jira: https://safturento.atlassian.net/browse/CREW-76

## Goal

After the agent's transcript stream resolves in `crew run`, `crew resume`, and `crew restart`, run `config.playwright.authored.test_command` from the worktree dir on the host (full reachability to the docker stack). On non-zero exit, feed the captured output back into the existing `fix-pr` flow with `mode: 'message'`, looping up to `verify_max_attempts` total agent runs (default 2). Closes the verification gap that the agent's bash sandbox can't traverse on its own.

Full design: `docs/mumen/2026-05-01-playwright-e2e-verify-gate.md`.

## Relevant files

- `packages/shared/src/config/schema.ts` — extend `playwright.authored` with `verify_after_run` (default false) and `verify_max_attempts` (default 2).
- `packages/cli/src/lib/playwright/mode-flags.ts` — add `verifyAfterRunEnabled(config)` helper.
- `packages/cli/src/lib/run/verify-authored-e2e.ts` — new gate orchestrator: runs the test command, captures output, classifies pass/assertions/crash, and orchestrates the fix-pr resume loop.
- `packages/cli/src/lib/run/baseline.ts` — new pre-condition guard. Reads a per-project baseline cache file (`~/.cache/crew/baselines/<project>`) recording the SHA of `origin/<default_branch>` last-known-green; if absent or stale, gate is treated as disabled with a warning.
- `packages/cli/src/commands/run.ts` — wire gate after `streamTranscript` resolves, before `process.exit`. Pass `dockerUnavailable` into `buildTicketPrompt` so the agent surfaces the gap when docker bringup failed.
- `packages/cli/src/commands/resume.ts` — same hook around the resume + fresh paths.
- `packages/cli/src/commands/restart.ts` — falls through `runRun` / `runResume` so it gets the gate transitively.
- `packages/cli/src/lib/prompts/templates/ticket-playwright-authored.md` + `ticket.ts` — when `verify_after_run` is on, replace the "run `npm run test:e2e` yourself" line with "crew runs the suite externally after handoff and will resume you with the output if it doesn't pass."
- `packages/cli/src/lib/prompts/templates/ticket.md` + `ticket.ts` — render a `docker_unavailable` disclosure line into the prompt when applicable.

## Decisions

- **Distinguisher = exit code**, not stderr parsing. Playwright exits 1 on test assertion failures and other codes (or signals) for runner crashes. The orchestrator emits `"e2e test assertions failed:"` for rc=1 and `"playwright runner crashed:"` otherwise. Loop body is identical; the prefix is purely a hint to the agent.
- **Baseline guard via explicit cache file** at `~/.cache/crew/baselines/<project_name>` containing the last-known-green `origin/<default_branch>` SHA. The human writes the file (`echo $(git rev-parse origin/main) > ~/.cache/crew/baselines/<name>`) after confirming main is green. This is simple, explicit, has no hidden runtime side-effects, and matches the design intent ("forces the underlying flakiness to get fixed once via a separate ticket").
- **Loop count = total agent runs.** `verify_max_attempts: 2` means 1 original + 1 retry. The third attempt is "surface to human and stop."
- **Docker-unavailable signal** is a `boolean` carried through to `buildTicketPrompt`; the prompt template renders a one-line disclosure into the workflow section when set.
- **Skip cases short-circuit before the gate runs**: gate disabled, no commits on branch, `--skip-docker`, docker bringup failed, baseline non-green. Each emits a one-line dim log. Returned as `{ skipped: true; reason }` so callers can branch.
- **Reuse `buildFixPrPrompt`** with `feedbackSource = 'crew e2e gate'` and the captured output (with distinguisher prefix) as `feedback`. Spawn via existing `spawnClaudeResume` in the same worktree. Mirror `runFixPr`'s SIGINT handling and abort-bridge pattern.

## Out of scope

- Bridging sandbox netns to host loopback (deferred indefinitely).
- A parallel gate for `bruno:smoke`.
- Wiring the gate as a GitHub Actions CI job.
- Fixing Recipes' pre-existing landing.spec.ts failures.

## Notes

Acceptance criteria — direct mapping to test cases:

- Gate runs when `verify_after_run = true`, post-stream, in run/resume/restart. → covered by command-level integration tests + unit tests on the orchestrator.
- Skip cases unit-tested: no commits on branch, `--skip-docker`, gate disabled, baseline non-green, docker bringup failed.
- `docker_unavailable: true` propagates into the agent prompt fragment (separate from gate firing).
- Pre-condition guard treats baseline mismatch as disabled-with-warning.
- Schema validation: `verify_after_run` and `verify_max_attempts` shape + defaults; structural rejection when `verify_after_run = true` lives outside the `[playwright.authored]` block.
- Prompt fragments: render the "external gate" line under the right conditions; render the docker_unavailable disclosure when applicable.
