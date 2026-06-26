# CREW-288 — Runner: reap dead processes from the live-process registry

Jira: https://safturento.atlassian.net/browse/CREW-288

## Goal

The runner's heartbeat snapshot stops lying about phantom "running" agents. Each heartbeat, before serializing the snapshot, the runner probes every tracked pid with the existing `isAlive` check and drops the dead ones — so a `crew run` child that died without a terminal `remove` (early death, crash, OOM-kill) no longer lingers as a phantom **running** until the next runner restart.

## Relevant files

- `packages/cli/src/lib/runner/registry.ts` — `toSnapshot()` returns every tracked proc verbatim; gains a `reapDead(isAlive)` liveness sweep.
- `packages/cli/src/lib/runner/loop.ts` — `startHeartbeat` sweeps the registry before each `toSnapshot()`; `RunLoopDeps` gains an `isAlive` boundary.
- `packages/cli/src/lib/runner/liveness.ts` — **new**; the concrete `isProcessAlive` probe factored out of `commands/runner.ts` so the worker (lib) can inject it without a command→lib cross-import.
- `packages/cli/src/lib/runner/worker.ts` — wires the real `isProcessAlive` boundary into `runLoop`.
- `packages/cli/src/commands/runner.ts` — now imports `isProcessAlive` from the lib instead of defining it locally.

## Decisions

- **Method name `reapDead`, not `reap`** — there's already a `reap` _command_ kind (`applyCommand`, daemon-driven single-orphan untrack). `reapDead` names the liveness sweep distinctly to avoid confusion.
- **Pure `isAlive`, no grace period** — the registry only holds an entry after the child has actually spawned (`executeAction` records the pid post-spawn), so a just-spawned pid already probes alive. No grace window needed (resolves the followup's open question).
- **Sweep lives in the heartbeat tick** — defense-in-depth, independent of the daemon's terminal-state tracking, exactly where the ticket scopes it.
- **`paused` entries are exempt from the sweep** — a paused `crew run` `process.exit`s on the pause path (`run.ts:693,746`), so its pid is legitimately dead, but the entry is deliberately kept tracked (CREW-273) as a resumable handle for a later `resume`/`message`. Reaping it would silently destroy the resumable state. `reapDead` skips `paused`; every other state (`running`/`cancelling`/`launching`) with a dead pid is a genuine reap target. (Caught in code review.)
- **Factor `isProcessAlive` into `liveness.ts`** rather than into `supervisor.ts` — keeps `supervisor.ts`'s "pure over injected boundaries" doc honest; the concrete `process.kill(pid, 0)` probe gets its own tiny home. `commands/daemon.ts` keeps its own copy (out of scope).

## Out of scope

Surfacing an early-death run as an **error** state (daemon run-failure record + per-entity drawer) — folds into CREW-249.

## Notes

Followup `docs/followups.md` → "2026-06-25 — Runner never reaps dead processes…" moves to Resolved in this PR.
