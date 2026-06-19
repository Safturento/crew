# CREW-256 — PostToolUse pr_created hook + dispatch injection

Jira: https://safturento.atlassian.net/browse/CREW-256

Epic child **D** of the Concrete State Triggers epic — plan Task 5
(`docs/superpowers/plans/2026-06-18-concrete-state-triggers.md`). The only
in-session emitter: a PostToolUse(Bash) hook that captures the `pr_created` fact.

## Goal

A dependency-free Node hook that, when a dispatched agent runs a successful
`gh pr create`, appends a `pr_created` state event to
`~/.crew/state-events/<key>.jsonl` — and the dispatch-time injection that wires
that hook into every dispatched session with the agent key templated in.

## Relevant files

- `hooks/state-events/pr-create-postuse.mjs` — the hook (new; ships with crew, runs under bare `node`, no build step).
- `hooks/state-events/pr-create-postuse.test.mjs` — hook tests.
- `packages/cli/src/lib/run/state-event-hook-injection.ts` — merges the PostToolUse entry into the worktree's `.claude/settings.local.json` (new).
- `packages/cli/src/commands/run.ts` — calls the injection alongside `runSkillInjection`.
- `.claude/settings.json` — existing PreToolUse hooks; the `$CLAUDE_PROJECT_DIR` convention (df6a2a3) this follows.

## Decisions

- **Inject into `.claude/settings.local.json`, not `.claude/settings.json`** — the
  tracked `settings.json` would show a dirty diff in the worktree (it's a tracked
  file force-added past the `.claude/*` ignore) and the key is per-dispatch, so it
  must never be committed. `settings.local.json` is gitignored by `.claude/*`,
  Claude Code merges its hooks with `settings.json`, and an untracked file is
  untouched by the `crew fix-pr` resume rebase.
- **Template the key inline in the command** — `CREW_AGENT_KEY=<key> node "$CLAUDE_PROJECT_DIR/hooks/state-events/pr-create-postuse.mjs"`.
  A POSIX inline `VAR=val` prefix is guaranteed to reach the hook process; it does
  not depend on an undocumented per-hook `env` field. Absolute path via
  `$CLAUDE_PROJECT_DIR` follows the df6a2a3 convention.
- **Hook is `.mjs`, dependency-free** — it runs from the worktree at dispatch via
  bare `node` with no compile step and no `crew-cli` import, so it appends the
  same JSONL shape directly (mirrors `lib/state-events/writer.ts` / the
  `startup-events` writer's best-effort try/catch-to-stderr).
- **Repo-root `hooks/` test runs via a new `test:hooks` root script** mirroring the
  existing `test:scripts` pattern, chained into root `test:run`.

## Ruled out

- A per-hook `env: { CREW_AGENT_KEY }` JSON field — not a documented/guaranteed
  Claude Code hook-config field; the inline command prefix is robust.

## Notes

For a non-crew target repo the hook file is absent from the worktree, so
`node <missing>` exits non-zero — a non-blocking PostToolUse no-op, consistent
with the existing crew-repo-centric `$CLAUDE_PROJECT_DIR` gate hooks.
