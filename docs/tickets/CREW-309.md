# CREW-309 — Runner rework C: safe orphan-worktree reclaim + dashboard Restart

Jira: https://safturento.atlassian.net/browse/CREW-309

Plan task 8 in `docs/superpowers/plans/2026-06-30-runner-page-rework.md` (branch
`docs/runner-page-rework-spec`). Spec §7 "Safe dashboard restart". Blocked by A
(CREW-307, merged as #444).

## Goal

Make a wedged run self-heal on a plain re-run instead of hard-failing. Extend
CREW-287's safe/unsafe orphan-_branch_ reclaim to orphan-_worktree directories_:
a leftover worktree whose branch has zero commits beyond `origin/<default>` is
safely removed so the worktree can be recreated; one carrying unique commits
refuses with actionable guidance.

## Relevant files

- `packages/cli/src/lib/run/reconcile-orphan-branch.ts` — add
  `reconcileOrphanWorktree({ repoPath, key, defaultBranch, env? })`.
- `packages/cli/src/commands/run.ts` — call it in preflight, right before
  `requireWorktreeAvailable`, after a fresh `git fetch origin <default>` so the
  commit-count baseline is current. This is the self-heal point.
- `packages/cli/src/lib/run/reconcile-orphan-branch.test.ts` — new
  `reconcileOrphanWorktree` cases (safe / unsafe / uncomputable / absent /
  remove-fails / cwd).

## Decisions

- **Restart = re-run, self-healed in preflight** — spec §7: the dashboard
  `error`-row Restart "performs the worktree reconcile … Run in preflight so the
  common wedge self-heals." An errored/orphaned agent is not tracked in the host
  runner's registry, so a reverse-queue `restart` command could not resolve the
  agent's project/repo. The correct trigger is the existing forward `run`
  action-enqueue path (New Run picker), which now self-heals via this change.
  No new `RunnerCommand` kind, migration, or `applyCommand` case is added here —
  the dashboard `error`-row Restart button belongs to Task 10 (batch E) and
  reuses the run-enqueue path. This ticket delivers the self-heal that makes any
  such restart actually succeed instead of re-wedging.
- **Reconcile before `requireWorktreeAvailable`** — the leftover worktree dir
  makes `requireWorktreeAvailable` throw first, before the `crew_startup_worktree`
  bracket runs. Placing the reclaim in preflight (spec §7) is what self-heals the
  common wedge; `requireWorktreeAvailable` stays as the final guard for a
  non-orphan directory squatting the path.
- **Worktree reclaim only removes the worktree, not the branch** —
  `git worktree remove --force <path>` leaves the `<key>` branch (now not checked
  out), which `reconcileOrphanBranch` (already in the bracket) then reclaims. The
  two compose: worktree reclaim (preflight) → branch reclaim (bracket) → add.
- **"Safe" requires a clean working tree, not just zero unique commits** — a
  worktree (unlike a bare branch) has a live working tree; a run interrupted
  after edits but before a commit has 0 unique commits yet real unrecovered work,
  and `git worktree remove --force` would discard it silently. So the reclaim
  also runs `git -C <worktree> status --porcelain` and refuses on any content (or
  an errored status). This is the extra exposure `reconcileOrphanBranch` doesn't
  have. Surfaced by code review.

## Notes

`reconcileOrphanWorktree` finds the orphan by parsing `git worktree list
--porcelain` for the block whose `branch` is `refs/heads/<key>` (robust to path
convention), mirroring `reconcileOrphanBranch`'s safe/unsafe split and its
"refuse on any uncertainty" stance.
