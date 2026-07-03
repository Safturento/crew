# CREW-315 — Dispatch-injected `.claude/` artifacts dirty non-crew worktrees

Jira: https://safturento.atlassian.net/browse/CREW-315

## Goal

Dispatch's three injected `.claude/` artifacts (`skills/`, `crew-hooks/`,
`settings.local.json`) stay untracked on **every** target repo, not just ones
that gitignore `.claude/`. Concretely: after a `crew run` on a repo that only
gitignores `.claude/secrets/`, `git status --porcelain` in the worktree shows
none of the three, so `crew finish` passes its dirty gate and a stray
`git add -A` can't sweep the per-dispatch-key file into a PR.

## Relevant files

- `packages/cli/src/lib/run/converge-git-exclude.ts` — **new.** `convergeGitExclude`:
  appends the three artifacts to the target repo's `info/exclude`, resolved via
  `git rev-parse --git-common-dir`. Idempotent, dedup-aware, best-effort.
- `packages/cli/src/lib/run/converge-git-exclude.test.ts` — **new.** Unit tests.
- `packages/cli/src/commands/run.ts` — wires `convergeGitExclude` into the
  `crew_startup_skill_injection` bracket, right after `injectStateEventHook`.
- `packages/cli/src/lib/run/index.ts` — barrel export.
- `.agents/dispatch.md` — step 9 + new "Distribution" sub-paragraph.
- `docs/followups/daemon-cli-dispatch.md` → `docs/followups/resolved.md` — moved entry.

## Decisions

- **Resolve via `git rev-parse --git-common-dir`, not `--git-dir`.** For a linked
  worktree `--git-dir` points at `.git/worktrees/<name>`, but `info/exclude`
  lives in the shared common git dir. One append there covers all current and
  future worktrees of the repo, retroactively un-dirtying already-dispatched ones.
- **Only `crew run` converges.** `crew fix-pr` / `crew resume` reuse the
  run-created worktree; the shared-common-git-dir append from the original run
  already covers them, so no converge is wired into those paths.
- **Best-effort, never throws.** A git/fs failure returns a `warning` result and
  logs — a converge miss leaves artifacts merely visible-untracked (the prior
  behavior) rather than aborting an otherwise-healthy dispatch. It sits inside the
  `crew_startup_skill_injection` bracket but self-catches so it never fails the phase.
- **No finish-side belt.** The ticket floated an optional `crew finish` warn for
  pre-fix worktrees created on other machines. Skipped: the shared-common-git-dir
  append retro-fixes any such worktree on the next `crew run` of that repo.

## Ruled out

- **Widen `crew init`'s `.gitignore` append to `.claude/*`.** Broader blast radius
  (would ignore any user `.claude/` content in the target) and doesn't
  retro-protect already-inited repos. `info/exclude` is local, targeted, and
  retroactive.

## Notes

Acceptance criteria (all met):

- Fresh dispatch to a repo that doesn't gitignore `.claude/` → `git status
--porcelain` shows none of the three artifacts (they're in `info/exclude`).
- `crew finish` on such a worktree passes the dirty gate.
- Re-dispatch does not duplicate exclude lines; crew-repo dispatches unaffected.
- Followup entry moved to Resolved in this PR.
