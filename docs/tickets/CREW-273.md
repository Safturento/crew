# CREW-273 — Pause-aware crew run + daemon: non-terminal paused run-state

Jira: https://safturento.atlassian.net/browse/CREW-273

Build slice **2 of 3** of the pause/resume/message fast-follow under Epic
[CREW-235](https://safturento.atlassian.net/browse/CREW-235). Plan task **F-1**
(paused run-state portion). Design reference: `docs/tickets/CREW-248.md`
(_Cross-layer wrinkle_ section). Depends on: CREW-244 (Done).

## Goal

Make `crew run` **pause-aware** so a pause-interrupt is distinguished from a
cancel/finish, and the daemon reduces the pause to a **non-terminal, resumable**
run-state instead of `error`/`ended`.

Today `crew run` lands a terminal `completeRun` on any SIGTERM exit: the signal
handler sets `signaled`, kills claude, the process exits `130`
(`resolveExitCode`), and `emitDispatchExitedSync` reports `run_exited` with a
non-zero code which the daemon reduces (`reduceState`) to **`error`**. So a naive
`pause` SIGTERM would mark the run errored/ended, conflicting with a resumable
`paused`.

## Design

**Mechanism — a pause sentinel the runner sets.** The runner (slice 1 /
CREW-272's `commands.ts` `pause` apply path) writes a per-key sentinel file at
`~/.crew/pause-sentinels/<key>` _before_ SIGTERMing the tracked process group. A
pause and a cancel both arrive as SIGTERM, so the sentinel is the only thing that
tells them apart. `crew run`'s signal handler **consumes** (reads + deletes) the
sentinel; if it was present, the interrupt is a pause. A distinct signal was
ruled out — pause must SIGTERM the group to interrupt claude's turn, so a
different signal can't reach claude cleanly.

**Run-state representation — reduce to `idle`.** A pause-interrupt emits a new
`run_paused` state event (instead of `run_exited`) and **suppresses
`completeRun`**. The daemon's `reduceState` maps `run_paused` (from `running`) →
`idle`: non-terminal, resumable, and **already permitted by the
`state_transitions` CHECK** (migrations 0002/0005 list `idle`) — so **no schema
migration**. The user-visible `paused` label stays where the Epic's out-of-scope
note puts it: the runner's in-memory live-process registry snapshot
(`LiveProcessState`), overlaid on the persistent `idle` run-state. `run_paused`
is exempt from the non-zero-exit→`error` branch (it never carries an error code).

`waiting` was rejected as the target: the dashboard already treats `waiting` as
"agent blocked on human input" (renders a _provide-input_ button), wrong
semantics for a paused/resumable run. `idle` ("run ended, no PR, operator decides
next") is the right non-terminal home.

## Relevant files

- `packages/shared/src/state-events/types.ts` — add `run_paused` to
  `STATE_EVENT_KINDS` (+ zod enum).
- `packages/daemon/src/services/state-reduce.ts` — reduce `run_paused` → `idle`,
  exempt from the error branch.
- `packages/cli/src/lib/pause-sentinel/` — **new** lib: write / consume the
  per-key sentinel (the runner-↔-`crew run` contract).
- `packages/cli/src/lib/state-events/dispatch.ts` — `emitRunPausedSync`.
- `packages/cli/src/commands/run.ts` — `sigintHandler` consumes the sentinel; the
  exit path suppresses `completeRun` + emits `run_paused` on a pause.

## Decisions

- **Sentinel file, not a distinct signal.** 2026-06-19. Pause needs SIGTERM to
  interrupt claude's turn; a second signal can't both interrupt claude _and_
  uniquely mark the parent. A `~/.crew/pause-sentinels/<key>` file written by the
  runner before the SIGTERM, consumed (read+deleted) by `crew run`'s handler, is
  the clean cross-process contract. Consume-on-read prevents a stale sentinel
  from misreading a later cancel as a pause.
- **Reduce to `idle`, not a new `paused` to_state.** 2026-06-19. The ticket says
  no migration; `idle` is already CHECK-permitted, non-terminal, and resumable.
  The `paused` label lives in the live-process snapshot (in-memory), per the
  Epic's out-of-scope note — only the persistent run-state representation changes.
- **`run_paused` is a new `StateEventKind`, not a flag on `run_exited`.** A
  distinct kind keeps the reducer exhaustive-checked and the transition log
  self-explanatory, and avoids threading "was-this-a-pause" through `exitCode`.

## Ruled out

- **`waiting` as the paused target** — already means "blocked on human input" in
  the UI (provide-input button). Wrong semantics.
- **A distinct pause signal to the group** — wouldn't interrupt claude's turn the
  way SIGTERM does; SIGSTOP freezes a half-finished tool call (already ruled out
  in CREW-248).
- **A schema migration for a `paused` to_state** — unnecessary; `idle` carries the
  non-terminal/resumable invariant the AC requires.

## Notes

Independent in code from slice 1 (`commands.ts` apply mapping) — different seams,
build/merge in parallel. This ticket _owns_ the sentinel module; slice 1 only
calls `writePauseSentinel(key)` before its `pause` SIGTERM. No dashboard controls
here (those sit on top of this in a later slice). Backend-only for visual
verification — a real pause can't be driven end-to-end without slice 1's apply
path, so there is no in-browser golden path to exercise.
