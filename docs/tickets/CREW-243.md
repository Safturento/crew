# CREW-243 — Runner registry + signalling (host side)

Jira: https://safturento.atlassian.net/browse/CREW-243

Ticket **C** of Epic CREW-235 (Runner Control Parity). Plan Tasks 5–6.
Depends on A (CREW-241: shared types + `runner_commands` + `RunnerCommandsService`)
and B (CREW-242: live-process snapshot on `RunnerStatusService` + command routes) —
both merged before this branch.

## Goal

Make the host runner self-aware: track the agent subprocesses it spawns, push the
live-process snapshot on its heartbeat, and apply operator control commands by
signalling the tracked process group. `crew runner status` renders the live registry.

## Relevant files

- `packages/cli/src/lib/runner/registry.ts` — in-memory `agentKey → LiveProcess` map; `add/remove/get/setState/toSnapshot`.
- `packages/cli/src/lib/runner/commands.ts` — pure `applyCommand` mapping (`cancel_soft`/`cancel_hard`/`reap` → effect).
- `packages/cli/src/lib/runner/executor.ts` — `launch` resolves `{pid,pgid}`; `executeAction` records the registry entry.
- `packages/cli/src/lib/runner/loop.ts` — heartbeat carries the snapshot; `drainCommands` claims + applies each cycle.
- `packages/cli/src/lib/runner/worker.ts` — constructs the `Registry`, wires `process.kill` + detached spawn (`pgid === pid`).
- `packages/cli/src/lib/daemon-client/index.ts` — `heartbeat(snapshot?)`, `getRunnerStatus`, `claimPendingCommand`, `reportCommandResult`.
- `packages/cli/src/commands/runner.ts` — `crew runner status` renders the live-process table.

## Decisions

- **Detached spawn ⇒ `pgid === pid`.** `execa(..., { detached: true })` makes each verb a process-group leader, so signalling `kill(-pgid, …)` reaches the verb and every child it spawned (claude, docker). The registry stores both, equal today.
- **`cancel_soft` = SIGTERM + `cancelling`; `cancel_hard` = SIGKILL + drop tracking; `reap` = drop tracking, no signal.** The agent self-reports its run completion on a graceful SIGTERM; a force-killed/orphaned run is settled daemon-side (it drops from the next snapshot once removed from the registry).
- **`applyCommand` is pure over injected `kill` + `registry`.** No daemon round-trip in the apply itself — the loop reports the `applied`/`failed` result back over `reportCommandResult`. A `kill` that throws (`ESRCH`, already-dead group) is absorbed into a `failed` result so a racey cancel never crashes the drain loop.
- **`getRunnerStatus` (not `heartbeat`) backs `crew runner status`.** `GET /api/runner/status` is read-only, so rendering status never falsely flips the runner online.

## Ruled out

- **Applying `dequeue` host-side.** It needs a daemon route to drop a still-pending `action_request`, which doesn't exist and is out of this ticket's host-side scope (was Ticket B's domain). Reported as `failed` "not yet supported" for now — see followup `2026-06-17 — Host runner can't apply dequeue`.
- **`pause`/`resume`/`message`.** Designed-for in the shared types but deliberately deferred to the CREW-248 fast-follow; reported `failed` "not yet supported."

## Notes

Backend/CLI-only — no dashboard or daemon-route changes, so no Bruno endpoint or
visual-fidelity work. Verified: `crew-cli`/`crew-shared` test suites, full-workspace
typecheck, eslint, prettier, and `npm run bruno:smoke` (daemon up, all routes green).
