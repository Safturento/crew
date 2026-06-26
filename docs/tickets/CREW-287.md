# CREW-287 — crew run: orphan-branch worktree wedge (idempotent guard)

Jira: https://safturento.atlassian.net/browse/CREW-287

## Goal

`crew run <KEY>` no longer wedges when a `<KEY>` branch already exists. A safe orphan branch (no commits beyond `origin/<default>`, left by an interrupted run) is reclaimed automatically so the worktree is created cleanly; a branch carrying unrecovered work produces a clear, actionable error instead of the raw `fatal: a branch named '<KEY>' already exists` and a silent "launched".

## Relevant files

- `packages/cli/src/lib/run/reconcile-orphan-branch.ts` — new guard. `reconcileOrphanBranch()`: `show-ref` to detect the branch, `rev-list --count origin/<default>..refs/heads/<KEY>` for unique commits, `branch -D` to reclaim a safe orphan, throw otherwise.
- `packages/cli/src/lib/run/reconcile-orphan-branch.test.ts` — mocked-execa unit tests (absent / safe-orphan / unique-commits / uncomputable / delete-failure / cwd).
- `packages/cli/src/lib/run/index.ts` — re-exports the new module.
- `packages/cli/src/commands/run.ts` — calls the guard after `git fetch`, before `git worktree add`; the worktree `bracketStartupPhase` is now wrapped in try/catch → `fail()` so a refusal exits 1 cleanly (the phase's `failed` event is still recorded).
- `.agents/dispatch.md` — step 3 + failure-modes updated.
- `docs/followups.md` — followup moved to Resolved.

## Decisions

- **Reclaim safe orphan by delete + recreate, not reuse.** Deleting the orphan and letting the existing `git worktree add -b <KEY> … origin/<default>` recreate it keeps the fresh-start semantics; "add onto the existing branch and reset" was the alternative but is more surface area for the same outcome.
- **Refuse on unique commits, don't silently reuse.** Per the followup's open question — silent reuse risks running on unexpected state. The error points at `git log origin/<default>..<KEY>` (inspect) and `git branch -D <KEY>` (discard).
- **Refuse when the count can't be computed** (rev-list non-zero exit, e.g. missing origin ref) rather than treating it as zero — being conservative avoids deleting real work if refs are in a surprising state.
- **Scope: the (a) pre-flight-guard half only.** The ticket's "record the worktree-creation failure pre-registration" half is explicitly marked _possibly separate / folds into runner-observability_ and overlaps the runner-reaping followup + CREW-249; the acceptance criteria require only the guard + test. Wrapping the worktree phase in try/catch already upgrades the silent-launched failure into a recorded `crew_startup_worktree` failed event (the cheap part of that half).

## Ruled out

- Adding `--force` / reuse flags to `git worktree add` — doesn't distinguish safe orphan from unrecovered work.

## Notes

Backend CLI-only change (git/worktree setup). No HTTP route, dashboard component, or `.bru` touched — bruno/visual-fidelity/e2e gates are not applicable.
