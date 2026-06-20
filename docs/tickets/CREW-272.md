# CREW-272 — Pause/resume/message apply paths in commands.ts + injected resume boundary

Jira: https://safturento.atlassian.net/browse/CREW-272
Parent Epic: [CREW-235](https://safturento.atlassian.net/browse/CREW-235) — Runner control parity. Plan task **F-1** (apply-paths portion).

> Build slice **1 of 3** of the pause/resume/message fast-follow. Unblocked by
> the CREW-248 spike, which closed **GREEN** on 2026-06-19: `claude --resume`
> tolerates a transcript ending on a dangling `tool_use` (Claude Code's resume
> reconstruction sanitizes the trailing turn before re-sending to the API), so
> **no transcript-sanitization branch is needed** in the apply path.

## Goal

Implement the three runner command kinds in `applyCommand`
(`packages/cli/src/lib/runner/commands.ts`) that today return
`failed: not yet supported`:

- **`pause`** — `kill(-pgid, 'SIGTERM')` to interrupt the current turn, then
  `registry.setState(agentKey, 'paused')` and **keep** the entry tracked (unlike
  `cancel_*`, which drop it). The paused entry persists in the heartbeat
  snapshot.
- **`resume`** — re-spawn the agent on its existing worktree/session by
  re-dispatching `crew resume <key>` (which already does `findLatestSession` +
  `spawnClaudeResume`). Uses a **new injected boundary** on `ApplyCommandDeps`
  (`resume(agentKey, message?) => Promise<{pid,pgid}>`), since `applyCommand`
  previously only had `{ registry, kill }` and cannot spawn. On success,
  re-register the entry (`state: 'running'`, new pid/pgid).
- **`message`** — identical to `resume` but always forwards `payload.message`
  into `crew resume <key> -m <message>` (the steer/inject path).

## Relevant files

- `packages/cli/src/lib/runner/commands.ts` — `applyCommand`; the three new apply
  paths + the `resume?` and `writePauseSentinel?` boundaries on
  `ApplyCommandDeps`. `signalGroup` now also serves `pause` (`after: 'paused'`,
  writing the sentinel before the SIGTERM); `resumeAgent` serves
  `resume`/`message`.
- `packages/cli/src/lib/runner/commands.test.ts` — unit coverage for pause (kept
  tracked; sentinel written before kill; no sentinel on a missing entry or on a
  cancel), resume (re-register), message (forward), and the failure modes
  (no entry / no boundary / boundary rejects).
- `packages/cli/src/lib/runner/loop.ts` — threads `resume?` and
  `writePauseSentinel?` through `DrainCommandsDeps` / `RunLoopDeps` into the
  `applyCommand` call.
- `packages/cli/src/lib/runner/loop.test.ts` — guards the boundary threading.
- `packages/cli/src/lib/runner/worker.ts` — wires the real `resume` closure
  (resolve the paused entry's project → `crew resume <key> [-m <message>]`
  launched detached) and the real `writePauseSentinel` from
  `lib/pause-sentinel/` (the documented producer for CREW-273's consumer).

## Decisions

- **`resume` boundary is optional on `ApplyCommandDeps`.** A runner wired before
  resume support — or a test exercising only cancels — can omit it; a
  `resume`/`message` command then fails cleanly (`runner has no resume boundary
configured`) rather than throwing, consistent with the "never crash the drain
  loop" philosophy and the existing optional `now?` pattern in `executor.ts`.
- **`resume` and `message` share one apply path** (`resumeAgent`). They differ
  only in whether a message is present; both forward `command.payload?.message`,
  so the `message` "always forwards" requirement falls out naturally.
- **Re-register, don't mutate.** On a successful resume the entry is re-added
  (`{ ...proc, pid, pgid, state: 'running' }`), preserving `command`,
  `actionRequestId`, `project`, and `spawnedAt`. On any failure the entry is left
  untouched so the operator can retry.
- **Re-dispatch `crew resume`, not `spawnClaudeResume` directly.** Reuses
  resume.ts's preflight/env/mcp refresh (the CREW-248 design recommendation).
- **The pause path is CREW-273's sentinel producer.** CREW-273 (the non-terminal
  `paused` run-state slice) landed on `main` first, shipping `lib/pause-sentinel/`
  with `consumePauseSentinel` already wired into `crew run`'s signal handler and a
  doc comment delegating the **write** to this slice's pause apply path. Surfaced
  on rebase: without the producer, a `pause` SIGTERM is indistinguishable from a
  cancel and `crew run` would settle it terminally. So `pause` now calls the
  injected `writePauseSentinel` **before** the kill (durable before the signal).
  Injected as a boundary (like `kill`/`resume`) so the ordering is unit-tested
  without filesystem writes; best-effort and optional — absent, a pause degrades
  to a terminal cancel rather than crashing the drain loop.

## Out of scope

- Dashboard Pause/Resume controls.

(The non-terminal `paused` **run state** in `crew run` + the daemon — originally
the sibling slice this ticket deferred to — landed as **CREW-273** before this
branch merged. This slice now integrates with it via the pause sentinel above, so
the end-to-end pause is correct once both are on `main`.)

## Notes

Backend-only (CLI runner). No HTTP route, schema, or UI change → Bruno and
visual-fidelity gates are N/A. `dequeue` remains `not yet supported` (needs a
daemon action-drop route, out of the host runner's scope).
