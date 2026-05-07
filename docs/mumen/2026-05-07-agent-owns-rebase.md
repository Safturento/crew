---
type: mumen
created: 2026-05-07
path: ticket
key: CREW-110
---

# Move rebase from `crew fix-pr` wrapper into the dispatched agent

Jira: https://safturento.atlassian.net/browse/CREW-110

## Goal

Eliminate the dead-zone where `crew fix-pr` does a rebase, hits conflicts that break the daemon's source on disk, and bails on docker preflight before the agent ever spawns — leaving the worktree mid-rebase with no agent to resolve it. Move the rebase into the dispatched agent so docker comes up against compiling source, preflight passes cleanly, and the existing conflict-resolution playbook always runs.

## Background

Today fix-pr's flow is: `fetchOrigin` → `rebaseOnto` → `prepareAgentEnvironment` (docker bringup + preflight) → spawn agent. When rebase produces conflicts, the wrapper dispatches anyway, but for self-hosted crew (and any project whose docker stack rebuilds from worktree source) the daemon container can't compile source containing `<<<<<<<` markers. `probeAppUrls` fails, `process.exit(1)` fires, the worktree is stranded mid-rebase. CREW-99 reproduced this on 2026-05-07 and is being kept in its broken mid-rebase state to validate the fix.

## Approach

The wrapper stops doing the rebase. Sequence becomes:

1. Discover project config, read env, daemon-client setup (unchanged).
2. `prepareAgentEnvironment` against current (pre-rebase) source. Daemon compiles, stack is healthy, preflight passes.
3. Spawn agent with a new **rebase-first preamble**: Step 0 is `git fetch origin && git rebase origin/main`. If conflicts, follow the conflict-resolution rules. Then apply the review feedback below.

The existing `conflict-preamble.md` content folds into the new preamble — the rules are idempotent in the no-conflict case (a clean rebase just continues to feedback). The preamble explicitly tells the agent: hot-reload should pick up resolved source automatically; if the stack ends up wedged after resolution, run `docker compose up --build --wait` from the worktree. NOT `crew restart <KEY> --hard` — `--hard` calls `runReset` which removes the worktree + branch (full clean slate), wiping the agent's progress.

**Modularity**: extract a `buildRebasePreamble({ key, baseBranch })` helper in `packages/cli/src/lib/prompts/` that fix-pr's prompt builder composes. resume.ts (and any future caller) can adopt by importing the same helper.

**Leftover-rebase guard**: before calling `prepareAgentEnvironment`, the wrapper detects an already-mid-rebase worktree (from a prior failed run) via `isMidRebase()` — currently a private helper in `git/index.ts`, export it. When detected, fail fast with a tailored, actionable error:

```
<worktree> is mid-rebase from a prior run. Recover with:
  cd <worktree> && git rebase --abort
Then re-run crew fix-pr <KEY>.
```

This branches *before* the existing `hasUncommittedChanges` check so the user gets recovery guidance instead of the generic "commit, stash, or discard" message.

**Footer change**: wrapper no longer knows up-front whether a rebase happened. Capture `git rev-parse HEAD` before spawn, compare after; if HEAD changed, print the existing "inspect before pushing" advisory. Cheaper alternative if HEAD-comparison feels brittle: always print the advisory on clean exit (it's never wrong to inspect before `--force-with-lease`).

## Files / surfaces touched

- `packages/cli/src/lib/prompts/templates/conflict-preamble.md` → repurpose/rename to `rebase-preamble.md`. Drop `{{fileList}}` (agent discovers via `git status`); add Step 0 rebase instruction + the `docker compose up --build --wait` recovery note.
- `packages/cli/src/lib/prompts/rebase-preamble.ts` — new builder (the modular hook for fix-pr / future resume).
- `packages/cli/src/lib/prompts/fix-pr.ts` — drop `conflictFiles` param; compose `buildRebasePreamble()` unconditionally.
- `packages/cli/src/lib/prompts/builders.test.ts` — update assertions / snapshots.
- `packages/cli/src/commands/fix-pr.ts` — remove `fetchOrigin` + `rebaseOnto` block; remove `conflictFiles` from prompt-builder call; add leftover-rebase pre-check using `isMidRebase()`; rework `printFooter` via HEAD comparison or always-advise simplification.
- `packages/cli/src/commands/fix-pr.test.ts` — drop rebase-call assertions; add tailored mid-rebase error test; add HEAD-capture / footer-branch tests.
- `packages/cli/src/lib/git/index.ts` — delete unused `rebaseOnto`, `fetchOrigin`, `RebaseResult`, `listConflictFiles`. Keep + export `isMidRebase` (used by the leftover-rebase guard).
- `packages/cli/src/lib/git/git.test.ts` — drop `rebaseOnto` tests; ensure `isMidRebase` has direct coverage.

## Edge cases

- **Worktree already mid-rebase from prior failed run** (CREW-99 today): wrapper's leftover-rebase guard fires before docker bringup; user gets the tailored `git rebase --abort` recovery instruction.
- **Clean rebase, no conflicts**: agent runs `git rebase`, succeeds, moves on to feedback application. Step 0 is a silent no-op signal.
- **Already up-to-date**: rebase no-op; agent skips to feedback.
- **Agent decides to `git rebase --abort`** (per existing playbook: "if not confident, abort + document"): docs/tickets gets the blocker note; wrapper sees clean exit code; HEAD comparison shows no change → no rebase advisory printed.
- **Hot-reload chokes on conflict markers mid-resolution**: tsx watch errors briefly; daemon may 5xx. Agent's `npm run lint / typecheck / test:run` during resolution don't depend on docker, so resolution completes regardless. Once source is clean, hot-reload recovers; escape hatch in the preamble if it doesn't.
- **Origin force-pushed underneath us**: agent surfaces git's actual error and follows `git status` guidance like a human would.

## Out of scope

- Updating `sandbox-network-note.md` to remove its misleading `crew restart --hard` recommendation. Followup-worthy, separate diff.
- Wiring `resume` to use the new `buildRebasePreamble` helper. Build modularly so resume *can* import it later, but don't wire resume up here — there's no concrete trigger yet.
- `crew run` (fresh) — confirmed it doesn't currently rebase.

## Test plan

### Unit

- `buildFixPrPrompt` always includes the rebase preamble (no `conflictFiles` branch).
- `buildRebasePreamble` standalone: rendered output contains `git rebase`, conflict-resolution rules, the `docker compose up --build --wait` escape hatch, and does NOT contain `crew restart --hard`.
- `fix-pr.test.ts` no longer asserts `rebaseOnto` / `fetchOrigin` calls; asserts the leftover-rebase tailored error fires when `isMidRebase` is true; asserts wrapper captures HEAD pre-spawn and prints the inspection advisory when HEAD changes.
- `git.test.ts`: `rebaseOnto` tests deleted; `isMidRebase` gains direct coverage if not already exercised.

### Manual (against CREW-99 — kept broken for this)

1. Without aborting the existing rebase: `crew fix-pr CREW-99 -m '<test feedback>'`. Expect: leftover-rebase guard fires, prints the tailored `git rebase --abort` instruction. Wrapper exits non-zero without spawning agent.
2. `cd ~/Repos/crew-CREW-99 && git rebase --abort` to clean. Then `crew fix-pr CREW-99 -m '<test feedback>'`. Expect: docker bringup succeeds, preflight passes, agent spawns, agent's first action is the rebase, hits the same conflicts, resolves them, applies feedback, exits clean. Wrapper footer prints the inspection advisory because HEAD changed.
3. For sanity, also exercise on a branch with no rebase needed (rebase no-op): expect agent skips Step 0 silently, applies feedback normally, footer skips the inspection advisory because HEAD didn't change.
