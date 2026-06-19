# Concrete State Triggers — replace inferred agent-state transitions with emitted lifecycle events

**Date:** 2026-06-18
**Status:** Design (brainstormed 2026-06-18) — Epic to be created
**Supersedes the approach of:** [CREW-198](https://safturento.atlassian.net/browse/CREW-198) (fix-pr state cycle), the transcript-parse half of the CREW-31/32/174 state-detection fixes.

## Problem

An agent's badge state (`init` → `running` → `pr_open` → `pr_merged` / `finished` / `error`, plus the dormant `idle`/`waiting`) is **reverse-engineered by the daemon** from two fragile sources:

1. **Loose transcript parsing.** `running → pr_open` fires only when `hasPrCreateInvocation` (`packages/shared/src/transcripts/parser.ts`) finds a transcript Bash line that, after trimming, *starts with* `gh pr create`. It splits only on `\n`/`⏎`, so a same-line chain — `cd <worktree>; gh pr create …` or `git push && gh pr create …` — never matches.
2. **Volatile in-memory state.** `pr_open → running` (the fix-pr cycle, CREW-198) fires only when a *different* `runId` is seen, tracked in `IngestService.lastRunIdCache`, a plain in-memory `Map`. A daemon restart wipes it; the `lastSeenRunId !== undefined` guard then blocks the transition. We restart the daemon on **every schema-change PR merge**, so this is routine, not rare.

### Confirmed incidents

- **CREW-243** (PR #365, OPEN) is stuck in `running`. Its agent ran `cd /home/safturento/Repos/crew-CREW-243; gh pr create …` — a single-line `;` chain — so `hasPrCreateInvocation` returned `false` and the badge never advanced. Verified empirically against the real parser. Because it's stuck in `running` (never `pr_open`), `PrPoller` won't pick it up either, so it won't self-correct to `pr_merged` when #365 merges.
- The `pr_open → running` shift-back "not working" is the `lastRunIdCache`-wiped-on-restart failure above. The CREW-198 design's own Risks section predicted both of these and even noted "the CLI might just exit … this ticket needs to add the signal (CLI tells daemon 'run X completed' on exit)" — concrete signals were foreseen as the robust answer and deferred.

### Root cause

State is **inferred** from artifacts (transcript text, run-id sequencing) when the processes that *cause* each transition — the `crew` CLI, the host runner, and the dispatched agent session — already know the facts concretely and can simply state them.

## Goal

Make every state transition driven by a **concrete lifecycle event emitted by the process that caused it**, delivered durably, and reduced to a badge state by the daemon. Remove transcript parsing and the in-memory run-id cache from the state path entirely.

## Non-goals

- **Changing the timeline UI.** Sections still derive from the `state_transitions` table; only the *writer* of that table changes. No frontend work.
- **Re-backfilling historical agents.** Migration is forward-only (see Migration).
- **Replacing `PrPoller`.** A PR merging happens outside any crew process (on GitHub, often long after the agent exits); polling GitHub's authoritative state is correct, not inference. Kept as-is.
- **Replacing `crew finish`'s terminal signal.** Already a concrete CLI signal today. Kept.
- **Metrics' use of `hasPrCreateInvocation`.** `computeRunMetrics` counts PR-create invocations for metrics; that is a separate counting concern, not the badge, and stays.
- **`waiting` state.** This design makes `idle` reachable; `waiting` (input-needed) remains dormant, for a future effort.

## Design

### Source of truth

Concrete signals **only**. The daemon stops inferring state from transcripts. Transcript ingestion keeps running for `tool_calls`, the timeline, and metrics — it simply no longer writes `state_transitions`.

### Transition inventory

| Lifecycle event (concrete fact) | Emitter | When | Daemon reduces to |
|---|---|---|---|
| `run_started` | `crew run` (CLI) | at dispatch (alongside `registerRun`) | `running` |
| `pr_created` (+ `prUrl`) | PostToolUse(Bash) hook in the session | `gh pr create` exits 0 | `pr_open` |
| `fixpr_started` | `crew fix-pr` (CLI) | at fix-pr dispatch | `running` (from `pr_open`) |
| `fixpr_exited` (code 0) | runner/CLI | fix-pr process exits 0 | `pr_open` |
| `run_exited` (code 0) | runner/CLI | run process exits 0 | **`idle` if currently `running`; no change if `pr_open`** |
| `*_exited` (code ≠ 0) | runner/CLI | process exits non-zero | `error` |
| `finish_completed` | `crew finish` (CLI) | finish run completes | `finished` (existing path, re-expressed as an event) |
| — (GitHub-side) | `PrPoller` | `gh pr view` reports PR no longer OPEN | `pr_merged` (kept as-is) |

`idle` finally becomes reachable: it's already a legal `to_state` in the migration-0002 CHECK constraint, already in the `AgentState` union, already badge-styled, and already has `Resume + Finish` quick-actions (CREW-119). It means **"the run process ended without producing a PR — sitting idle, awaiting operator action."** This retires the `finished`-footgun followup (clean run with no PR currently masquerades as a successful close-out) and the `idle`/`waiting`-unreachable followup.

### The durable state-event log

Delivery must survive the daemon being momentarily down (every schema-change merge restarts it). Reuse the proven `~/.crew/startup/<key>.jsonl` → chokidar-tail pattern.

**File.** Per-key JSONL at `~/.crew/state-events/<key>.jsonl`. One line per emitted event:

```jsonc
{ "eventId": "<uuid>", "key": "CREW-243", "event": "pr_created",
  "ts": "2026-06-18T18:40:10Z", "source": "hook-pr-create",
  "prUrl": "https://github.com/.../pull/365", "runId": 42, "exitCode": null }
```

Producers append the **fact** (`event`), never a target state — the daemon owns the reduction (the `run_exited → idle|stay` case proves the producer can't always know the target).

**Ingestion.** A daemon chokidar watcher tails each file using the same `onStartupFile` + offset machinery already in `IngestService`. New lines → reduce → apply.

**The reducer.** A small, total pure function `reduce(currentState, event) → nextState | null` — the concrete-fact analog of today's `computeNextState`, fed deterministic events instead of parsed text. It keeps the sticky guards: `finished` and `pr_merged` are terminal against lifecycle events (only the dedicated paths move out). Returns `null` (no transition) when the event doesn't change state (e.g. `run_exited` while `pr_open`). On a non-`null` result the daemon writes the `state_transitions` row, updates its cache, and publishes the `agent.state_changed` SSE — the existing write path.

**Durability / idempotency.** Each event carries a client-generated `eventId`; application is idempotent on it (a dedup table or `UNIQUE` index of applied event ids). On a daemon restart, in-memory file offsets are gone, so it re-reads each file from the top; because per-key files are tiny (a handful of events per agent lifecycle) and application is `eventId`-idempotent, replay is cheap and exactly-once. **This is what lets a signal emitted during the restart window survive** — it waits in the file until the daemon replays it.

### The PostToolUse hook (the only in-session emitter)

The `pr_created` fact originates inside the dispatched agent session, so a hook is the emitter.

- **Injection.** crew writes a `PostToolUse` hook (matcher `Bash`) into every dispatched session's settings at dispatch, via the existing per-session injection path (`skill-injection-step`). The hook script ships with crew and is injected, so it works for every target project regardless of that repo's own `.claude/settings.json`. The agent `key` (and the `~/.crew/state-events` path) are templated in at dispatch, as crew already templates per-session values like `APP_URL`.
- **Logic.** PostToolUse receives the `command`, `tool_response` (stdout/stderr), and exit status. The hook:
  1. Matches `gh pr create` against the **raw command** with a command-position-anchored regex `(^|&&|;|\|)\s*gh pr create\b` — so `;` and `&&` chains both match.
  2. Requires **exit 0** — a failed `gh pr create` does not transition.
  3. Parses the **PR URL** from gh's stdout.
  4. Appends a `pr_created` event (with `prUrl`) to `~/.crew/state-events/<key>.jsonl`.
- It writes to the **durable log**, not a direct POST — same delivery guarantees as every other producer.
- A fix-pr that only pushes to an existing PR (no `gh pr create`) correctly does not fire here; its `running → pr_open` comes from `fixpr_exited`.

### What is removed from the live state path

In `IngestService`: `hasPrCreateInvocation` (state use), `lastRunIdCache` + its priming (`primeLastRunId`/the test seam), and the `computeNextState` new-runId logic. `state_transitions` stops being written by transcript replay.

### What is kept

- Transcript ingestion (`tool_calls`, timeline events, metrics).
- `computeRunMetrics`'s own `hasPrCreateInvocation` use (metrics counting).
- `deriveStateFromToolCalls` / the CREW-96 backfill, as the projection fallback for pre-cutover historical agents.
- `PrPoller` (`pr_open → pr_merged`) and `crew finish` (`→ finished`), the latter re-expressed as a `finish_completed` event for uniformity.

## Migration

Forward-only. Existing agents keep their last-derived state via the historical backfill path; no re-backfill. Concrete signals govern every run dispatched from the cutover onward. The only schema change is the `eventId`-dedup mechanism for log ingestion; `state_transitions` itself is untouched.

**CREW-243 specifically** stays stuck under this design (it predates the cutover and its PR is already open). It is unstuck manually (insert a `pr_open` transition / let #365 merge and correct by hand), independent of this Epic.

## Decomposition (sketch — refined in writing-plans)

The Epic's child tickets, roughly along these seams:

1. **Shared event contract + the reducer.** `StateEvent` types in `crew-shared`, the pure `reduce(currentState, event)` function, exhaustive unit tests. Leaf dependency; unblocks everything.
2. **Daemon ingestion.** The `~/.crew/state-events` chokidar watcher, `eventId` dedup, wiring the reducer into the existing `state_transitions` write path. Depends on #1.
3. **CLI/runner emitters.** `run_started`, `fixpr_started`, `run_exited`, `fixpr_exited`, `finish_completed` (re-express existing finish) appended to the log at the right lifecycle moments. Depends on #1.
4. **PostToolUse hook + injection.** The hook script, the dispatch-time injection, the URL parse. Depends on #1 (event shape) and #2 (so the emitted event is consumed).
5. **Removal + idle activation.** Strip the transcript-parse/`lastRunIdCache` state path; make `idle` reachable end-to-end (reducer + badge + AgentRow actions already exist; verify the `TRANSITION_TO_AGENT_STATE` map sends `idle → idle` rather than the current safety fallback to `running`). Depends on #2 + #3.

Stopgap (separate, ships first, not part of the Epic): widen `hasPrCreateInvocation` to handle `;`/`&&` chaining, and graduate the 2026-06-16 followup. Stops active bleeding while the Epic lands.

## Testing

- **Reducer:** exhaustive `(state, event) → state` table tests, including the sticky `finished`/`pr_merged` guards and the `run_exited → idle|stay` branch.
- **Ingestion:** events applied in order; `eventId` replay after a simulated restart is exactly-once; out-of-order / illegal events are skipped and logged.
- **Hook:** matches `;`/`&&` chains, ignores `echo "… gh pr create …"`, requires exit 0, parses the URL; emits a well-formed log line.
- **Emitters:** each CLI/runner exit path appends the right event with the right exit code.
- **Bruno:** a state-event ingestion smoke (dispatch a synthetic event file, assert the state-history endpoint reflects the transition).

## Risks

- **Hook coverage of non-`gh pr create` PR creation** (e.g. an agent using the GitHub API directly). Rare; falls back to `PrPoller` eventually noticing an open PR is moot (poller only walks `pr_open`). Accept for v1; the regex covers the overwhelmingly common path. Revisit if it bites.
- **Event ordering across producers.** The hook (session) and the exit emitter (runner/CLI) write to the same per-key file from different processes. Appends are atomic line-writes; the reducer is order-tolerant for the real sequences (a `pr_created` always precedes that run's `run_exited`). Document the assumption; test the realistic interleavings.
- **`idle` semantics drift.** `idle` now means "run ended, no PR." Ensure the AgentRow `Resume + Finish` actions and any copy match that meaning.
```
