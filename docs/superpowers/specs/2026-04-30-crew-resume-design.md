# crew resume — design

> **Purpose of this document.** A scoped design spec for a family of `crew` commands that recover from interrupted runs and let the user steer agent re-spawns: `crew resume`, `crew restart`, `crew reset`, plus a new `-m "<message>"` flag that supplements the prompt of any agent-spawning command. Today, when a `crew run` fails partway (docker bringup error, claude crash, ctrl-c, machine reboot mid-run), the worktree and branch already exist and the only recovery is manual `git worktree remove` + `git branch -D` before retrying. This spec eliminates that manual cleanup and adds explicit verbs for the three recovery patterns: continue from where the agent left off, redo the ticket fresh in the same worktree, or wipe state outright.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) for system context.
>
> **Foundation.** This work consumes `prepareAgentEnvironment({mode: 'resume'})` from CREW-62 (already merged) and `findLatestSession({worktree})` from `lib/sessions/index.ts`. No new infrastructure layers — this is command-shell work over existing primitives.

## 1. Background

### 1.1 The gap

`crew run KAN-X` runs through ~10 setup steps before claude spawns: create worktree, write secrets, write docker `.env`, write `.mcp.json` (smoke mode), write bruno env file, docker bringup, install Chromium, build prompt, spawn claude. Any of these can fail. When they do, the worktree and branch already exist. Today the user has to run `git worktree remove <path>` + `git branch -D <key>` manually before `crew run KAN-X` will succeed on retry. The error message says exactly that:

```
worktree already exists at <path>
   remove it first: git worktree remove '<path>'
```

There's also no escape hatch for "the agent went off-path during a successful run, I want to redirect it." `crew fix-pr` exists but requires a PR — useless during the in-flight run.

### 1.2 What's missing

Three distinct recovery patterns need first-class commands:

1. **Continue interrupted work.** Agent did some work, got interrupted; pick up where it left off. The `claude --resume <id>` primitive does this for the agent's reasoning; we need a command shell that pairs it with crew's environment setup.
2. **Redo from scratch in existing worktree.** Sessions wiped, agent re-spawned with a fresh ticket prompt; worktree's code state preserved (so e.g. partial commits aren't lost just because the agent went down a wrong path of reasoning).
3. **Abandon the ticket.** Full cleanup: worktree, branch, sessions all gone. Used when the user realizes the ticket itself was wrong, or when prepping for a clean retry.

Plus the cross-cutting need: a way to **inject user context** into any agent spawn — supplementing a sparse Jira ticket, redirecting an interrupted agent, or providing PR feedback inline rather than via a comment-then-fix-pr round-trip.

### 1.3 Why now

`prepareAgentEnvironment({mode: 'resume'})` from CREW-62 is the load-bearing primitive these commands need. Before CREW-62 landed, a "resume" command would have had to either re-implement docker bringup or assume it was already up — neither acceptable. With CREW-62 in place, the resume family is a thin command shell over an already-correct environment-prep helper.

## 2. Stack & rationale

This is pure TypeScript work inside the existing CLI workspace. No new runtime dependencies. All command shells follow the existing pattern in `packages/cli/src/commands/`. The four design commitments below shape the implementation:

- **Explicit verbs over flag-based modes.** `crew resume` and `crew restart` are separate commands rather than `crew run --resume` and `crew run --restart`. Each verb has one clear purpose; failure modes are controllable; help text is discoverable.
- **`--hard` is symmetric across `reset` and `restart`.** Without it, the operation is session-level (worktree preserved). With it, the operation includes worktree state. Same semantic, applied consistently — users learn it once.
- **`-m "<message>"` is shared across all agent-spawning commands** (`run`, `resume`, `restart`, `fix-pr`). Same flag, same helper, same template partial; the surrounding prompt frames the message correctly per command.
- **Composition over implementation.** `restart` is `reset` + `resume`. `restart --hard` is `reset --hard` + `run`. The composed commands literally invoke the underlying ones; no duplicated state-handling logic.

## 3. Scope

**In scope:**

- Three new commands: `crew resume`, `crew restart`, `crew reset` (with `--hard` flag on `reset` and `restart`).
- Modified `crew run`: new `-m` flag; improved worktree-exists error message that suggests `crew resume` and `crew reset --hard`.
- Modified `crew fix-pr`: new `-m` flag; **remove** `--from-stdin` (clean break — confirmed unused).
- One new prompt template (`resume.md`) and one new partial (`userMessageBlock`).
- Slot a `{{userMessageBlock}}` placeholder into existing `ticket.md` and `fix-pr.md` templates.
- Tests for each command shell + the shared message helper.

**Out of scope:**

- Telemetry / dashboard surfacing of resumes/restarts (separate ticket if/when the daemon's run-state tracking grows).
- Interactive `crew run` prompt-on-existing-worktree (the explicit verbs cover this; revisit only if user research surfaces friction).
- `crew run -m` interaction with a future `crew init` onboarding flow (separate spec).
- Auto-stash / auto-commit of uncommitted changes (we tolerate them; the agent reconciles).
- Backwards-compatibility shim for `--from-stdin` (clean break).
- Multi-session resume picker (today `findLatestSession` returns the latest by mtime; sufficient for now).

## 4. Architecture

### 4.1 Command surface

| Command | Internal composition | Spawns agent? |
|---|---|---|
| `crew run KAN-X [-m "msg"]` | (standalone) | yes — `claude` (no `--resume`) |
| `crew resume KAN-X [-m "msg"]` | (standalone) | yes — `claude --resume <id>` if session exists, else fresh `claude` |
| `crew restart KAN-X [-m "msg"]` | `reset` + `resume` (no-session branch) | yes — fresh `claude` |
| `crew restart KAN-X --hard [-m "msg"]` | `reset --hard` + `run` | yes — fresh `claude` |
| `crew reset KAN-X` | (standalone) | no |
| `crew reset KAN-X --hard` | (standalone) | no |
| `crew fix-pr KAN-X [-m "msg"] [--file path]` | (standalone, modified) | yes — `claude --resume <id>` |

### 4.2 State handling — `crew resume`

```
1. Resolve worktree path: worktreePathFor(repoPath, key).
2. Worktree exists?  No  → fail with "no worktree at <path>; did you mean 'crew run KAN-X'?".
3. git fetch origin (no state change; refresh refs).
4. Print worktree state: branch name, commits ahead of origin/main, uncommitted file count.
5. prepareAgentEnvironment({ mode: 'resume', config, worktree, key, env, dockerPorts }).
6. findLatestSession({ worktree }):
     ├─ Session exists → spawn `claude --resume <id>` with resume.md prompt.
     └─ No session    → print "→ no prior session found; starting fresh in existing worktree".
                         Spawn fresh `claude` with ticket.md prompt (same as crew run).
```

Tolerates uncommitted changes and unpushed commits. They're preserved as-is and surfaced to the agent in the prompt's worktree-state block. The agent reconciles.

### 4.3 State handling — `crew restart`

**Default (no `--hard`):**

```
1. Resolve worktree path. Worktree exists? No → fail with "no worktree at <path>".
2. crew reset KAN-X (sessions only) — see §4.5.
3. crew resume KAN-X — falls through to no-session branch (since reset just deleted it).
```

**With `--hard`:**

```
1. crew reset KAN-X --hard — see §4.5.
2. crew run KAN-X — full fresh start.
```

Both modes accept `-m "msg"` and pass it through to the underlying `resume` / `run` invocation.

### 4.4 State handling — `crew run` (modifications only)

- New `-m "<msg>"` flag. When set, the message is rendered into `{{userMessageBlock}}` in `ticket.md`.
- Worktree-exists error message updated:

  ```
  worktree already exists at <path>
     • To continue an interrupted run:  crew resume <KEY>
     • To wipe state and start fresh:   crew reset <KEY> --hard && crew run <KEY>
                                        (or:                       crew restart <KEY> --hard)
  ```

### 4.5 State handling — `crew reset`

**Default (sessions only):**

```
1. Resolve ~/.claude/projects/<encoded-worktree>/ via encodeWorktreeProjectPath.
2. Directory exists?  No → exit 0 with "no sessions to delete".
3. Delete every *.jsonl file in that directory. Print count.
4. Worktree, branch, and code state untouched.
```

**With `--hard`:**

```
1. Above (sessions cleanup).
2. git worktree remove <path>  — if path missing or not a worktree, log "(already removed)" and continue (no error).
3. git branch -D <KEY>          — if branch missing, log "(already removed)" and continue (no error).
4. Print summary of what was actually removed in this invocation (count of session files, plus per-step removed/already-removed state).
```

The "gracefully no-op" semantics matter for `crew restart --hard` (which re-invokes `reset --hard` followed by `run`) and for users hitting `reset --hard` after a partial manual cleanup — neither case should error on a missing artifact.

`crew reset` does **not** spawn an agent. It only removes state.

### 4.6 The `-m` flag

Single shared helper:

```ts
// packages/cli/src/lib/prompts/user-message.ts
export function renderUserMessageBlock(message: string | undefined): string {
  if (!message) return '';
  return render('user-message', { message });
}
```

Used by `buildTicketPrompt`, `buildResumePrompt`, `buildFixPrPrompt` — each one slots the result into its `{{userMessageBlock}}` placeholder.

The `user-message.md` partial wraps the content with a header so the agent recognizes it:

```
## Additional context from the user

{{message}}
```

**Per-command placement:**

- `ticket.md`: just below the opening line ("You are running unattended on a fresh git worktree to implement Jira ticket {{key}} end-to-end."), before the `## Skills` section. Read first; shapes the agent's whole approach.
- `resume.md`: near the top, after the "you're being resumed" frame and before worktree-state output.
- `fix-pr.md`: replaces today's stdin-feedback path. Same slot as the existing feedback content.

## 5. Implementation

### 5.1 New files

```
packages/cli/src/commands/resume.ts            — crew resume command shell
packages/cli/src/commands/restart.ts           — crew restart command shell (composes reset + resume/run)
packages/cli/src/commands/reset.ts             — crew reset command shell (no agent spawn)
packages/cli/src/lib/sessions/cleanup.ts       — deleteSessionsForWorktree(worktree) → deleted count
packages/cli/src/lib/run/cleanup-worktree.ts   — removeWorktreeAndBranch(worktree, key) → removed flags
packages/cli/src/lib/prompts/resume.ts         — buildResumePrompt(opts)
packages/cli/src/lib/prompts/user-message.ts   — renderUserMessageBlock(message)
packages/cli/src/lib/prompts/templates/resume.md       — new template
packages/cli/src/lib/prompts/templates/user-message.md — new partial
+ test files alongside each
```

### 5.2 Modified files

```
packages/cli/src/commands/run.ts        — add -m flag; improved worktree-exists error
packages/cli/src/commands/fix-pr.ts     — add -m flag; remove --from-stdin
packages/cli/src/lib/prompts/ticket.ts  — accept userMessage option; render userMessageBlock
packages/cli/src/lib/prompts/fix-pr.ts  — accept userMessage option; render userMessageBlock; drop stdin path
packages/cli/src/lib/prompts/render.ts  — register resume + user-message templates; add userMessageBlock placeholder to ticket + fix-pr template type
packages/cli/src/lib/prompts/templates/ticket.md   — slot {{userMessageBlock}} near top
packages/cli/src/lib/prompts/templates/fix-pr.md   — slot {{userMessageBlock}}; remove old stdin-feedback slot
packages/cli/src/cli.ts (or wherever commands are registered) — register resume / restart / reset
```

### 5.3 Foundation already in place (from prior tickets)

- `prepareAgentEnvironment({mode: 'resume', ...})` — CREW-62. Owns docker bringup (idempotent `up -d`) + Chromium install + URL resolution.
- `findLatestSession({worktree})` — `lib/sessions/index.ts`. Returns `{ sessionId, transcriptPath } | null`.
- `spawnClaudeResume({sessionId, prompt, logFile, cwd, env})` — `lib/claude/spawn.ts`. Accepts env; injects `CREW_APP_URL` per CREW-60.
- `worktreePathFor(repoPath, key)` — `lib/run/paths.ts`.
- `encodeWorktreeProjectPath(worktree)` — `lib/sessions/index.ts`. Maps worktree path → `~/.claude/projects/<encoded>/`.
- `discoverProjectConfig(repoPath)`, `agentNeedsAppRunning(config)`, prompt builders — all reusable.

## 6. Prompts

### 6.1 New: `resume.md`

```markdown
You're being resumed on {{key}} after an interruption.

{{userMessageBlock}}

## Worktree state

- Branch: {{branch}}
- {{commitsAhead}} commits ahead of origin/main
- {{uncommittedCount}} uncommitted files (preserved as-is from before the interruption)

{{playwrightBlock}}
{{brunoSmokeBlock}}

## What to do

Reassess where you left off — check your last actions in this conversation, the worktree's git state, and any uncommitted changes. Then continue toward closing the ticket. If the user-supplied context above changes your direction, factor it in before resuming.

{{discoveredSkillsBlock}}
```

The fragments `playwrightBlock` and `brunoSmokeBlock` reuse the existing `fix-pr-playwright.md` and `fix-pr-bruno-smoke.md` templates — their "stack up, browsers installed, do not duplicate" framing fits resume verbatim.

### 6.2 New partial: `user-message.md`

```markdown
## Additional context from the user

{{message}}
```

### 6.3 Modified: `ticket.md`

Insert `{{userMessageBlock}}` between the opening line and `## Skills`. When `-m` is unset the placeholder renders empty, leaving the template visually unchanged from today.

### 6.4 Modified: `fix-pr.md`

`fix-pr.md` already has a single `{{feedback}}` slot fed by `loadFeedback`'s output regardless of source. The `-m` flag adds a fourth source to `loadFeedback` (`{kind: 'message', message: string}` returning `{feedback: message, source: 'inline message'}`). The template is **unchanged** — the new mode flows through the existing `{{feedback}}` plumbing alongside PR / file modes.

Consequence: `userMessageBlock` partial is consumed only by `ticket.md` and `resume.md`; fix-pr's `-m` is wired at the `loadFeedback` layer rather than the prompt layer. The user-visible flag (`-m`) is shared across all four commands; the implementation seam differs because fix-pr already has a feedback-source abstraction worth reusing.

## 7. Acceptance criteria

- All five new/modified commands (`resume`, `restart`, `reset`, `run`, `fix-pr`) work end-to-end on a real Recipes ticket.
- `crew resume` against a worktree with a stopped docker stack brings the stack up via `prepareAgentEnvironment({mode: 'resume'})`.
- `crew resume` with no prior session falls through cleanly, prints `→ no prior session found; starting fresh in existing worktree`, and spawns fresh claude with the ticket prompt.
- `crew resume` tolerates uncommitted changes and unpushed commits; the prompt's worktree-state block reports them accurately.
- `crew restart` deletes the latest session and runs through resume's no-session branch (verified by observing one fewer session file + the no-session log line).
- `crew restart --hard` removes worktree + branch + sessions and re-runs the full `crew run` flow.
- `crew reset` (default) deletes sessions only; worktree, branch, and code state untouched.
- `crew reset --hard` removes worktree + branch + sessions; gracefully no-ops if any of them is already missing.
- `crew run` invoked against an existing worktree errors with the new message that suggests `crew resume` / `crew restart --hard`.
- `crew run -m "msg"` and `crew fix-pr -m "msg"` both render the user-message block at the documented slot in their respective prompts. Verified via snapshot tests.
- `crew fix-pr --from-stdin` is removed; passing it produces a usage error pointing at `-m` / `--file`.
- `npm run test:run`, `npm run lint`, `npm run typecheck`, `npm run format:check` all pass.
- One PR opened against `main` covering all of the above. (Ticket-internal commits map per command shell + per modified prompt builder so the diff is reviewable per concern.)

## 8. Out-of-scope follow-ups

- **Multi-session resume picker.** Today `findLatestSession` returns the most-recently-modified `.jsonl`. If a worktree accumulates many sessions and the user wants to resume an older one, an interactive picker would be useful. Defer until the need surfaces.
- **`crew resume --new-session`.** Force fresh claude even when a session exists. `crew restart` covers this case today; revisit if there's a workflow that needs preserving the old session for inspection while spawning a new one.
- **Telemetry on resume/restart events.** The daemon's run-state tracking (CREW-49) doesn't yet model "this run was resumed N times." Surfacing that in the dashboard is a separate concern; spec it when run-state grows there.
- **`crew run -m` interaction with `crew init`.** A future onboarding wizard might want to seed `-m` with a "first-run" template. Not in scope here; design alongside `crew init` proper.
- **Auto-stash on restart.** Today restart preserves uncommitted changes. If user research finds people accidentally losing work via restart-into-uncommitted-state, an opt-in `--stash` flag could be added. No evidence of need yet.
