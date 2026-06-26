# CREW-293 — Runner drawers E: wire supervisor Stop/Restart controls (cold Start = CLI hint)

Jira: https://safturento.atlassian.net/browse/CREW-293

Plan: `docs/superpowers/plans/2026-06-25-runner-drawers.md` → Task **T5**
Spec: `docs/superpowers/specs/2026-06-25-runner-drawers-design.md` → pillar 5
Epic: [CREW-249](https://safturento.atlassian.net/browse/CREW-249)

## Goal

Wire the `SupervisorCard` Stop/Restart buttons through the `runner_commands`
reverse-queue. Stop = graceful supervisor exit; Restart = exit-and-respawn via
the existing supervisor self-respawn loop. Cold Start stays a `crew runner start`
CLI hint — the containerized daemon can't spawn a dead host process, and once the
supervisor is fully stopped nothing drains the queue.

## Relevant files

- `packages/shared/src/runner/types.ts` — `RUNNER_COMMAND_KINDS` (+ `schema.ts` derives from it).
- `packages/daemon/src/migrations/0014_supervisor_command_kinds.ts` — widen the `runner_commands.kind` CHECK.
- `packages/daemon/src/routes/runner.ts` — enqueue route validation is already `z.enum(RUNNER_COMMAND_KINDS)` (auto-picks up the new kinds).
- `packages/cli/src/lib/runner/commands.ts` — `applyCommand` + new `supervisorControl` boundary.
- `packages/cli/src/lib/runner/loop.ts` — thread `supervisorControl` through `drainCommands` / `runLoop`.
- `packages/cli/src/lib/runner/worker.ts` — wire the boundary into `runWorker`.
- `packages/cli/src/commands/runner.ts` — `workerAction` translates a control request into the worker's exit code (0 = stop, non-zero = restart→respawn).
- `packages/cli/src/lib/runner/supervisor.ts` — existing self-respawn loop is the restart mechanism (no change beyond confirming semantics).
- `packages/dashboard/src/data/runnerControls.ts` — `useStopSupervisor` / `useRestartSupervisor` hooks.
- `packages/dashboard/src/routes/RunnerPage.tsx` — wire `onStop` / `onRestart` / `onStart` (hint).
- `packages/dashboard/src/components/runner/SupervisorCard.tsx` — already presentational; tests updated.

## Decisions

- **supervisor_stop = worker exits 0; supervisor_restart = worker exits non-zero.**
  The worker is the one draining the reverse-queue. The `supervisorControl`
  boundary aborts the worker loop; `workerAction` then sets the process exit code.
  The supervisor's `runSupervisor` loop already breaks on a clean (0) exit and
  respawns on a non-zero exit — so stop/restart reuse the existing self-respawn
  design with no supervisor change. (Resolves the spec's "restart semantics" open
  question: exit-and-rely-on-respawn.)
- **Daemon report ordering.** The boundary aborts the loop but does not kill the
  process; the in-flight `drainCommands` pass still reports `applied` before the
  main long-poll unwinds and the process exits, so the command never sticks at
  `claimed` (which would re-fire on respawn).
- **Cold Start = hint, not enqueue.** When offline, the supervisor isn't draining
  the queue, so `onStart` shows a toast pointing at `crew runner start` rather
  than enqueueing.
- **Queue-level commands.** `supervisor_stop`/`supervisor_restart` carry a null
  `agentKey` (they target the supervisor itself, not a tracked process).

## Notes

Parallel with T1 — independent of the log/drawer pillars. Touches shared + CLI +
daemon + dashboard.
