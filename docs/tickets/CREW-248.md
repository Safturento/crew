# CREW-248 — Pause / resume / message a running agent (feasibility spike)

Jira: https://safturento.atlassian.net/browse/CREW-248
Parent Epic: [CREW-235](https://safturento.atlassian.net/browse/CREW-235) — Runner control parity. Plan task **F-1**.

> **This ticket is a spike-gated fast-follow.** The v1 data model already
> reserves everything pause/resume/message needs (`pause`/`resume`/`message`
> command kinds + `payload.message`; the `paused` `LiveProcessState`). The apply
> paths in `packages/cli/src/lib/runner/commands.ts` and the dashboard controls
> are built **only after** a feasibility spike proves a detached headless
> `claude` can be cleanly interrupted mid-turn and resumed via
> `spawnClaudeResume` without a half-finished tool call corrupting state.

## Goal

Run the F-1 feasibility spike and **document the outcome**. The build (apply
paths + dashboard controls, covered by tests) graduates from designed-for to
shipped **only if the spike is green**.

## Spike question

> Can a detached headless `claude -p` be cleanly **interrupted at its current
> turn** (SIGTERM the process group — *not* SIGSTOP, which would freeze a
> half-finished tool call) and then **resumed** via `claude --resume <sessionId>`
> (the path `crew fix-pr` / `crew resume` already use through
> `spawnClaudeResume`) **without a half-finished tool call corrupting state**?

The specific risk: SIGTERM can land in the narrow window *after* Claude Code has
written a `tool_use` block to the session transcript but *before* the matching
`tool_result` is written. The Anthropic Messages API requires every `tool_use`
to be answered by a `tool_result` in the next turn, so a transcript that ends on
a **dangling `tool_use`** could make `--resume` reject the reconstructed
conversation. That dangling-tool_use case is the whole reason this is gated
rather than assumed-green from the existence of `crew resume`.

## Outcome — INCONCLUSIVE in-sandbox (empirical leg blocked); host confirmation run required before building

The empirical spike **could not be completed inside the `crew run` dispatch
sandbox**, for a concrete, reproducible environmental reason — not a Claude Code
limitation. A standalone host run is required to close the gate. Until then the
apply paths and dashboard controls are **not built** (this ticket ships the
documented outcome only, per the acceptance criteria's primary deliverable).

### What was empirically established (in-sandbox)

Running a nested `claude --dangerously-skip-permissions -p '<prompt>'` from
inside the dispatch sandbox (`docs/tickets/CREW-248.md` was produced from such a
run):

1. **The nested agent runs and reaches the API.** Given a "create 60 files
   f1.txt…f60.txt with the Write tool" prompt, it wrote **52 files** before being
   interrupted — proving the model, tool loop, and network egress to the
   Anthropic API all work for a nested agent.
2. **The Write tool works; the Bash tool does not.** Every Bash tool invocation
   fails during setup with
   `EROFS: read-only file system, mkdir '~/.claude/session-env/<uuid>'` —
   Claude Code's per-Bash sandbox env dir lives under `~/.claude/session-env`,
   which the dispatch sandbox mounts **read-only**.
3. **No session/transcript is ever persisted.** Claude Code writes transcripts to
   `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`, and that tree is also
   mounted **read-only** in the sandbox. The nested agent ran to (near)
   completion but created **zero** transcript files — it silently degraded to a
   non-persistent session.

Verified directly:

```
$ mkdir -p ~/.claude/projects/<anything>   # → Read-only file system
$ mkdir -p ~/.claude/session-env/<anything> # → Read-only file system
```

### Why this blocks the spike specifically

`--resume <sessionId>` requires (a) an existing session transcript to read and
(b) the ability to **append** new turns to it as the resumed agent runs — both
under `~/.claude/projects/`, which is read-only here. With no transcript ever
created, there is **nothing to resume**; even resuming a pre-existing real
session would fail on the first append. The session-persistence substrate that
`--resume` depends on is exactly what the sandbox makes unwritable.

### Why the in-sandbox workarounds are dead ends

- **Disable the sandbox** — `dangerouslyDisableSandbox` is disabled by policy for
  this environment; commands cannot run un-sandboxed.
- **Relocate the config dir** (`CLAUDE_CONFIG_DIR=/tmp/...`) to a writable path —
  this *would* make transcripts + `session-env` writable, **but** Claude Code
  reads its credentials from the config dir. A fresh writable config dir has no
  auth, and copying the real credentials in is barred by the secrets rule. (The
  nested agent worked precisely *because* it read the real read-only config for
  auth while failing to write the read-only projects/session-env dirs.)

So the spike is environmentally blocked in-sandbox and must be run on the host.

## Existing-production evidence (encouraging, but does NOT close the gate)

The interrupt-then-resume cycle is **already shipped and exercised** in crew:

- `crew resume` (`packages/cli/src/commands/resume.ts`) is described as *"Continue
  an interrupted crew run on an existing worktree."* On `Ctrl+C`/SIGTERM it does
  `sub.kill('SIGTERM')`, then re-running `crew resume <key>` calls
  `findLatestSession({ worktree })` + `spawnClaudeResume({ sessionId, … })`
  (`--resume <id>`).
- `crew fix-pr` resumes the same session the same way.
- `pause` (SIGTERM the group to interrupt the turn) and `resume`
  (`spawnClaudeResume`) are mechanically **identical** to what `crew resume`
  already does.

This makes the *general* "interrupt + resume a crew claude" path low-risk. But it
does **not** isolate the gated worst case: operator-driven `crew resume`
interrupts tend to land at natural boundaries (or after the run already
finished), whereas an automated `pause` SIGTERMs at an arbitrary instant —
including mid-tool-execution, leaving a **dangling `tool_use`**. Whether Claude
Code's resume reconstruction repairs that (drops the trailing tool_use or
synthesizes a cancelled `tool_result`) or chokes on it is the open question. The
CREW-235 spec deliberately treats it as unproven; this spike does not change
that. **Do not assume green.**

## Recommendation

1. **Run the host confirmation spike below** (un-sandboxed, where
   `~/.claude/projects` + `session-env` are writable) before any build. It is
   designed to test the *exact* worst case deterministically: it interrupts a
   real run mid-tool-call, then also truncates the real transcript to end on a
   dangling `tool_use` and attempts `--resume` against that manufactured-but-real
   session.
2. **If green** → build the apply paths + dashboard controls per the design
   below, covered by tests.
3. **If red** (resume rejects a dangling tool_use) → the apply path must first
   sanitize the trailing turn (drop the dangling `tool_use` / inject a synthetic
   cancelled `tool_result`) before re-spawning; re-spike after.

## Implementation design the spike clarified (for the build, once green)

Scoped to keep the eventual PR reviewable:

- **`pause`** — `kill(-pgid, 'SIGTERM')` to interrupt the current turn, then
  `registry.setState(agentKey, 'paused')` and **keep** the entry tracked (unlike
  `cancel_*`, which drop it). The paused entry persists in the heartbeat snapshot
  with `state: 'paused'` — the only place `paused` exists today
  (`LIVE_PROCESS_STATES`), and exactly what the acceptance criterion's "pause
  sets state paused" refers to. Fully unit-testable in `commands.ts` (mock
  `kill`), mirroring the existing `cancel_soft` test.
- **`resume`** — re-spawn the agent on the existing worktree/session by
  re-dispatching `crew resume <key>` (which already does
  `findLatestSession` + `spawnClaudeResume`). This needs a new injected boundary
  on `ApplyCommandDeps` (e.g. `resume(agentKey, message?) => Promise<{pid,pgid}>`)
  because `applyCommand` today only has `{ registry, kill }` and cannot spawn.
  On success, re-register the entry (`state: 'running'`, new pid/pgid).
- **`message`** — identical to `resume` but always forwards `payload.message`
  into `crew resume <key> -m <message>` (the steer/inject path).

### Cross-layer wrinkle to resolve as part of the build (NOT yet handled)

`crew run` lands a **terminal** `completeRun` on any SIGTERM exit: the signal
handler sets `signaled`, kills claude, and the process exits `130`
(`resolveExitCode`), which `emitDispatchExitedSync` reports and the daemon
reduces (non-zero exit → **`error`**). So a naive `pause` SIGTERM would make the
daemon mark the run **errored/ended**, conflicting with a resumable "paused".
`paused` is a `LiveProcessState` only — it is **not** a `runs`/agent state.

Resolving this needs `crew run` to be **pause-aware**: distinguish a
pause-interrupt from a cancel/finish (e.g. a sentinel the runner sets, or a
distinct signal) and emit a non-terminal `paused` state / suppress `completeRun`
so the run stays resumable. This is a daemon + run.ts change beyond
`commands.ts`, and should be sized as its own slice of the build (or a sibling
ticket) once the spike is green. It is the main reason this ticket is *only* the
spike: the apply mapping is small, but a correct, non-terminal "paused" run state
is not.

## Host confirmation spike (run un-sandboxed; reproducible)

Saved verbatim so the gate can be closed on a host where `~/.claude/projects` and
`~/.claude/session-env` are writable. It (1) interrupts a real run mid-tool-call,
(2) checks whether SIGTERM naturally left a dangling `tool_use`, (3) resumes the
natural session, then (4) **manufactures the worst case** by truncating the real
transcript to end on a `tool_use` (dropping its `tool_result`) and resumes that.

```bash
#!/usr/bin/env bash
# CREW-248 host confirmation: interrupt mid-tool-call + resume, incl. the
# deterministic dangling-tool_use worst case. RUN ON THE HOST (un-sandboxed).
set -uo pipefail
ROOT="${TMPDIR:-/tmp}/crew248-spike"; WORK="$ROOT/work"
rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK" || exit 2
LOG="$ROOT/claude.log"
ENC=$(printf '%s' "$WORK" | sed 's#/#-#g')
PROJ="$HOME/.claude/projects/$ENC"

dangle_check () { node -e '
  const fs=require("fs");
  const recs=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").filter(Boolean)
    .map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
  const tu=new Set(),tr=new Set();
  for(const r of recs){const c=r?.message?.content; if(Array.isArray(c)) for(const b of c){
    if(b.type==="tool_use")tu.add(b.id); if(b.type==="tool_result")tr.add(b.tool_use_id);}}
  const d=[...tu].filter(id=>!tr.has(id));
  console.log("  records",recs.length,"tool_use",tu.size,"tool_result",tr.size,"DANGLING",d.length);
' "$1"; }

# 1. Spawn detached, in its own process group; many tool calls = wide window.
#    On a host the Bash tool works, so a `sleep`-based inducer is fine; the
#    Write-based one below avoids it and works in more environments.
setsid claude --dangerously-skip-permissions --setting-sources user,project,local \
  -p 'Using ONLY the Write tool, create 60 files f1.txt..f60.txt in the cwd, each containing "ok", one Write call per file in order. Reply DONE when finished.' \
  > "$LOG" 2>&1 &
CPID=$!; PGID=$(ps -o pgid= -p "$CPID" | tr -d ' ')
echo "claude pid=$CPID pgid=$PGID"

# 2. Wait for a tool_use, let a few accumulate, then SIGTERM the whole group.
for i in $(seq 1 45); do sleep 1
  TR=$(ls -t "$PROJ"/*.jsonl 2>/dev/null | head -1)
  [ -n "${TR:-}" ] && grep -q '"name":"Write"' "$TR" 2>/dev/null && { echo "tool_use @ ${i}s"; break; }
done
sleep 3; kill -TERM -"$PGID"; sleep 3
TR=$(ls -t "$PROJ"/*.jsonl | head -1); SID=$(basename "$TR" .jsonl)
echo "session $SID"; echo "natural post-SIGTERM:"; dangle_check "$TR"

# 3. Resume the natural session.
timeout 120 claude --dangerously-skip-permissions --setting-sources user,project,local \
  --resume "$SID" -p 'Stop. Reply exactly RESUME_OK.' && echo "NATURAL: green" || echo "NATURAL: FAILED"

# 4. Worst case: truncate the REAL transcript to end on the last tool_use
#    (drop its tool_result), rewrite sessionId, resume that.
WID="crew248worst-$(date +%s)"; W="$PROJ/$WID.jsonl"
node -e '
  const fs=require("fs"); const [src,dst,id]=process.argv.slice(1);
  const L=fs.readFileSync(src,"utf8").split("\n").filter(Boolean); let cut=-1;
  for(let i=L.length-1;i>=0;i--){let r;try{r=JSON.parse(L[i])}catch{continue}
    if(Array.isArray(r?.message?.content)&&r.message.content.some(b=>b.type==="tool_use")){cut=i;break;}}
  if(cut<0){console.error("no tool_use");process.exit(3);}
  fs.writeFileSync(dst,L.slice(0,cut+1).map(l=>{const r=JSON.parse(l);if(r.sessionId)r.sessionId=id;return JSON.stringify(r);}).join("\n")+"\n");
' "$TR" "$W" "$WID"
echo "worst-case:"; dangle_check "$W"
timeout 120 claude --dangerously-skip-permissions --setting-sources user,project,local \
  --resume "$WID" -p 'Reply exactly WORST_RESUME_OK.' \
  && echo "WORST: GREEN — resume tolerated a dangling tool_use" \
  || echo "WORST: RED — resume rejected a dangling tool_use (gate fails; sanitize trailing turn first)"
```

## Relevant files

- `packages/cli/src/lib/runner/commands.ts` — `applyCommand`; today `pause`/
  `resume`/`message` return `failed: not yet supported`. Where the apply paths
  land if green.
- `packages/cli/src/lib/claude/spawn.ts` — `spawnClaudeResume` / `claudeResumeArgs`
  (`--resume <id> -p`). The resume mechanism under test.
- `packages/cli/src/commands/resume.ts` — `crew resume`; the production
  interrupt→`--resume` cycle and the natural `resume` boundary.
- `packages/cli/src/lib/runner/registry.ts` — `setState` already accepts
  `'paused'`; the entry must be *kept* (not removed) on pause.
- `packages/cli/src/commands/run.ts` (`sigintHandler`, `resolveExitCode`,
  `emitDispatchExitedSync`) — the terminal-`completeRun`-on-SIGTERM behaviour the
  paused state must work around.
- `packages/shared/src/runner/types.ts` — `RUNNER_COMMAND_KINDS`,
  `LIVE_PROCESS_STATES` (the designed-for `paused` + `pause`/`resume`/`message`).

## Decisions

- **Ship the documented spike outcome only; do not build the apply paths.**
  2026-06-19. The empirical gate could not be closed in-sandbox (read-only
  `~/.claude/projects` + `session-env`), and the dangling-tool_use worst case
  remains unproven. Building on an unconfirmed, spike-gated path would violate the
  ticket's own gate. The acceptance criterion's primary deliverable ("spike
  outcome documented in a docs/tickets note") is satisfied by this file.
- **The host confirmation script is committed inline** so the gate is closeable
  with one un-sandboxed run, testing the exact worst case deterministically.

## Open questions (for the host confirmation run + build)

- [ ] Does `claude --resume` repair a transcript ending on a dangling `tool_use`,
      or reject it? (The gate.)
- [ ] How should a *non-terminal* `paused` run state be represented so the run
      stays resumable — sentinel in `crew run` to suppress `completeRun`, a
      distinct pause signal, or a new daemon state? `paused` is a
      `LiveProcessState` only today.
- [ ] Should `resume`/`message` re-dispatch `crew resume <key>` (reuses all of
      resume.ts's preflight/env/mcp refresh) or call `spawnClaudeResume` directly
      from the runner (lighter, but re-implements that setup)? Re-dispatch is
      recommended.

## Ruled out

- **SIGSTOP-based pause** — freezes a half-finished tool call instead of letting
  the turn end; the spec already rules it out. Pause = interrupt-the-turn.
- **In-sandbox empirical verification** — environmentally impossible (above).

## Notes

The CREW-248 build, once the gate is green, is *two* slices, not one: (1) the
small, well-bounded `commands.ts` apply mapping + an injected `resume` boundary
(easily TDD'd), and (2) the genuinely harder non-terminal `paused` run-state in
`crew run` + the daemon. The dashboard controls (Pause/Resume on the Live
processes row + drawer header) sit on top of (2). Consider splitting (2) into its
own ticket under CREW-235 when scheduling.
