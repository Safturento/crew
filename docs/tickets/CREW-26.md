# CREW-26 — fix-pr: spawn claude with cwd=worktree so --resume finds the session

Jira: https://safturento.atlassian.net/browse/CREW-26

## Goal

`crew fix-pr --from-pr <KEY>` invoked from the canonical repo (i.e. not from
inside the `<repo>-<KEY>` worktree) successfully resumes the worktree's Claude
Code session. Today the spawned `claude --resume` runs with the parent shell's
cwd, so claude derives the wrong project directory and reports "No conversation
found".

## Relevant files

- `packages/cli/src/lib/claude/spawn.ts` — `spawnClaudeResume` calls `execa`
  without `cwd`. Add a required `cwd` field to the options and pass it through.
- `packages/cli/src/commands/fix-pr.ts` (~line 196) — call site has `worktree`
  in scope; pass it as `cwd`.
- `packages/cli/src/lib/claude/spawn.test.ts` — add a cwd assertion.
- `packages/cli/src/commands/run.ts:185-186` — reference: `crew run` already
  spawns claude with `cwd: worktree`. We're closing the same gap on the
  `--resume` path.

## Decisions

- **`cwd` is required, not optional.** Every real caller has a worktree path;
  defaulting silently is what caused the bug. Failing at the type level if a
  caller forgets is the safer contract.
- **Field name `cwd` (not `worktree`).** Mirrors the execa option it forwards
  to and keeps `spawnClaudeResume` unaware of crew-specific concepts.

## Notes

- No behavior change for users who already invoked `crew fix-pr` from inside
  the worktree — `cwd` was previously inherited and equal to the worktree in
  that case; now it's set explicitly to the same path.
