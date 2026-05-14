---
type: mumen
created: 2026-05-01
path:
---

# Playwright e2e verify gate (post-agent, host-side)

## Goal

Close the verification gap on authored-Playwright projects: today the agent's bash sandbox can't reach the docker stack on host loopback, so `npm run test:e2e` always fails inside the sandbox even when the test would pass against the live stack. Crew should run the suite from outside the sandbox after the agent reports done, and on failure feed the output back into the existing `fix-pr` resume loop so the human isn't left to triage.

## Approach

After the agent's transcript stream resolves in `run.ts` (and in `resume.ts` / `restart.ts`), and only when the project has authored Playwright wired up _and_ the agent's branch produced commits worth testing _and_ the docker stack is verified up:

1. From the host (sharing host netns, full reachability to Caddy on the worktree's port), shell out to `config.playwright.authored.test_command` from the worktree directory. Capture stdout + stderr + exit code.
2. **Pass** → continue current post-run cleanup. Done.
3. **Fail** → invoke the existing `fix-pr` flow with `mode: { kind: 'message', message: <captured output, prefixed with a distinguisher line> }`. That re-spawns claude via `spawnClaudeResume` in the same worktree with the standard fix-pr prompt fragment.
4. After the resume run completes → re-run the gate. Repeat up to `verify_max_attempts` total agent runs (default 2 — the original run plus one retry), then surface the unresolved failure to the human and stop.

The distinguisher line in step 3 is the difference between "test assertions failed" and "playwright runner crashed before tests ran" (config error, browser launch failure, etc.). Loop behavior is identical for both — agent gets full output and decides — but the leading line tells the agent which kind of failure it's looking at without parsing the trace.

Config surface: new `verify_after_run = true` knob under `[playwright].authored` (default off until proven on a green-baseline project). Sibling `verify_max_attempts = 2`. Both live on the existing block — no new top-level section.

The agent's prompt also changes: when `verify_after_run` is on, the Playwright fragment tells the agent that crew runs `test:e2e` externally after handoff and will resume them with the failure output if it doesn't pass. This stops the agent from burning cycles trying to run `npm run test:e2e` itself from the sandbox (and from writing "Sandbox limitation" disclosures into PR descriptions when the gate has it covered).

## Files / surfaces touched

- `packages/cli/src/commands/run.ts` — invoke gate after `streamTranscript` resolves, before exit
- `packages/cli/src/commands/resume.ts`, `packages/cli/src/commands/restart.ts` — same gate hook (resumes can also produce commits worth re-verifying)
- `packages/cli/src/lib/run/verify-authored-e2e.ts` — new: run the test command, capture output, return pass/fail + log + distinguisher
- `packages/cli/src/lib/run/index.ts` — re-export
- `packages/shared/src/config/` — extend the Zod schema for `[playwright].authored` with `verify_after_run` + `verify_max_attempts`
- `packages/cli/src/lib/playwright/mode-flags.ts` — `verifyAfterRunEnabled(config)` helper
- `packages/cli/src/lib/prompts/ticket.ts` — Playwright fragment update: tell the agent crew runs the gate externally
- `packages/cli/src/lib/prompts/fix-pr.ts` — sanity-check the fragment reads sensibly when feedback came from the gate (not PR comments); tweak wording if needed
- Tests for each of the above

## Edge cases

- **Pre-existing failures on `main`.** Gate refuses to enable on a project whose `main` doesn't have a clean e2e suite — verification against a non-green baseline is noise dressed as signal. Concretely: at startup, crew checks the project's `main` (or `default_branch`) e2e baseline; if not green, the gate is treated as disabled for this run and crew warns the human. Forces the underlying flakiness to get fixed once via a separate ticket. (Recipes' `landing.spec.ts` failures are exactly this — being filed as a sibling ticket.)
- **Agent didn't push / no commits on branch.** Skip the gate entirely. Nothing to verify.
- **`--skip-docker` flag.** Skip the gate silently. The human explicitly opted out of the stack.
- **Docker bringup failed for non-skip reasons** (port collision, image build error, etc.). Skip the gate, but propagate a `docker_unavailable: true` signal into the agent's context (via the existing prompt build) so the agent mirrors today's behavior — get the PR open, but call out an uncompleted test item in the PR description rather than silently shipping. The gate not running is a known gap the human gets to see, not a silent pass.
- **e2e crashes vs e2e fails.** Identical loop behavior. Distinguisher line in the feedback message tells the agent which.
- **Retry cap hit.** Surface the final failure to the human (log path, last captured output, attempt count) and stop. Don't auto-close PR, don't auto-revert — human decides.
- **Test command absent.** If `[playwright].authored.test_command` isn't configured but `verify_after_run = true` is set, fail fast at config validation rather than at gate-fire time.

## Out of scope

- Bridging the sandbox netns to the host stack so the agent can run e2e itself (the alternative options 2 & 3 from the brainstorm — deferred indefinitely).
- A parallel gate for `bruno:smoke`. Same shape and same root cause if it turns out to have the same reachability gap; file as a separate ticket modeled on this one when needed (no current evidence it does).
- Wiring this gate as a GitHub Actions CI job. Already covered by the active followup at `docs/followups.md:333`.
- Fixing Recipes' pre-existing `landing.spec.ts` failures so KAN can adopt the gate. Separate KAN ticket.

## Test plan

- Unit: gate orchestration helper covers pass, fail, retry-cap-hit, and each skip case (no commits, `--skip-docker`, docker bringup failed, gate disabled).
- Unit: config schema accepts `verify_after_run` + `verify_max_attempts` with sensible defaults; rejects `verify_after_run = true` when `test_command` is missing.
- Unit: prompt fragments render the "crew runs gate externally" line under the right conditions; render the `docker_unavailable` disclosure line when applicable.
- Manual: dispatch `crew run` against a known-green Recipes branch with the gate enabled — gate runs, passes silently, run completes normally.
- Manual: dispatch against a deliberately broken branch (assertion guaranteed to fail) — gate runs, fix-pr loop fires, agent gets the failure output, retries, hits the cap, surfaces to human.
- Manual: dispatch with `--skip-docker` — gate skips silently. Confirm via run log.
- Manual: kill docker mid-bringup to simulate failure — agent receives the docker_unavailable disclosure, opens PR with the uncompleted-test note, gate doesn't fire.
