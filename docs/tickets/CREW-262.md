# CREW-262 — Dispatched `claude -p` doesn't load settings.local.json → pr_created hook never runs

Jira: https://safturento.atlassian.net/browse/CREW-262

Child of the Concrete State Triggers epic (CREW-252). The real blocker behind
CREW-252's `pr_open` detection. CREW-256 built the injection and CREW-261 made
the hook logic correct, but the hook still never executed in a dispatch — it was
never **loaded**.

## Goal

The injected `pr_created` PostToolUse hook actually registers in a dispatched
session, so a `gh pr create` emits `~/.crew/state-events/<key>.jsonl` and the
agent transitions `running → pr_open` — on both `crew run` and `crew fix-pr`.

## Root cause

crew spawns the agent as `claude --dangerously-skip-permissions -p <prompt>`
with **no `--setting-sources`**. In print/non-interactive mode Claude Code loads
only the `user` + `project` setting sources by default — the `local` source
(`<worktree>/.claude/settings.local.json`) is silently skipped. `injectStateEventHook`
writes the hook into exactly that `local` file (deliberately — the per-dispatch
key must never be committed and an untracked file survives the fix-pr rebase), so
the hook was never registered.

The asymmetry that isolated it: crew's committed `.claude/settings.json`
PreToolUse doc-parity gate _does_ fire during dispatches → the `project` source
loads, but `local` does not.

## Fix

Add `--setting-sources user,project,local` to **both** spawn paths. The flag
pair lives as `CLAUDE_SETTING_SOURCES_FLAGS` in `lib/claude/spawn.ts`, threaded
through two shared arg-builders so the `crew run` launch and the resume/fix-pr
launch can't drift:

- `claudeFreshArgs(prompt)` → used by `spawnClaudeFresh` and the inline launch in `commands/run.ts`.
- `claudeResumeArgs(sessionId, prompt)` → used by `spawnClaudeResume` (fix-pr + verify-gate resume).

## Relevant files

- `packages/cli/src/lib/claude/spawn.ts` — new `CLAUDE_SETTING_SOURCES_FLAGS` constant + `claudeFreshArgs` / `claudeResumeArgs` builders; both spawn helpers now route through them.
- `packages/cli/src/commands/run.ts` — inline `crew run` launch now uses `claudeFreshArgs(prompt)`.
- `packages/cli/src/lib/claude/spawn.test.ts` — asserts both spawns carry the setting-sources flag; covers the new constant + builders (regression guard).
- `.agents/dispatch.md` — step 11 + State-event hook injection section document the load-bearing flag.

## Verification

- Unit: `npm run -w crew-cli test` — green.
- `typecheck`, `lint` — green.

## Note on empirical confirmation

The AC asks to "empirically confirm" a dispatched PR produces a `pr_created`
event. This worktree was dispatched by the **pre-fix** crew CLI, so the hook does
not load for _this_ agent's own PR — that's the bug. The fix takes effect on the
next dispatch run from the patched CLI. Confirm there by checking
`~/.crew/state-events/<key>.jsonl` for a `pr_created` line and the agent flipping
to `pr_open` after it opens a PR.
