# CREW-242 — Live-process snapshot on RunnerStatusService + extended runner routes

Jira: https://safturento.atlassian.net/browse/CREW-242

Ticket **B** of Epic [CREW-235](https://safturento.atlassian.net/browse/CREW-235) — Plan Task 4
(`docs/superpowers/plans/2026-06-16-crew-235-runner-control.md`). Depends on **A**
([CREW-241](https://safturento.atlassian.net/browse/CREW-241), shipped) — shared types +
`runner_commands` + `RunnerCommandsService`.

## Goal

The daemon side of the state + control path:

- `RunnerStatusService` mirrors the live-process snapshot the runner pushes on its heartbeat;
  `heartbeat(snapshot?)` stores it; `status()` returns the processes; published on the SSE channel.
  Existing online/offline edge logic untouched.
- `routes/runner.ts`: widen the status response with `processes`; heartbeat accepts an optional
  snapshot body; add the three command routes (`POST /api/runner/commands`,
  `GET /api/runner/commands/pending`, `POST /api/runner/commands/:id/result`) over the
  `RunnerCommandsService` from CREW-241.
- Bruno endpoints for each new route + the smoke flow.

## Relevant files

- `packages/shared/src/runner/schema.ts` (new) — zod wire schemas (`runnerSnapshotSchema`,
  `liveProcessSchema`, `enqueueRunnerCommandSchema`), mirroring `actions/schema.ts`.
- `packages/daemon/src/services/RunnerStatusService.ts` — snapshot storage + `runner.snapshot_changed`.
- `packages/daemon/src/services/EventBus.ts` — new `runner.snapshot_changed` SSE payload.
- `packages/daemon/src/routes/runner.ts` — widened status, snapshot heartbeat, 3 command routes.
- `bruno/endpoints/runner/*.bru` + `package.json` smoke order.

## Decisions

- **Dedicated `runner.snapshot_changed` SSE event** instead of folding the snapshot into the
  existing `runner.status_changed` edge event. The plan's wording ("publish the snapshot on
  `runner.status_changed`") collides with its own hard constraint "keep the existing edge logic
  untouched": `runner.status_changed` fires _only_ on online/offline edges (guarded by
  `emittedOnline`), and the shipped edge tests assert exact-equality `{online, lastSeen}` and
  exactly-once emission. A snapshot pushed every 5s heartbeat would have to fire that event on
  every beat, breaking edge semantics. A separate per-heartbeat snapshot event keeps the health
  chip's edge stream pristine and follows the existing one-event-per-concern pattern
  (`action.changed`, `runner.command_changed`). The widened `GET /api/runner/status` still carries
  `processes` for SSE seeding on mount.
- **Snapshot published only when a snapshot body is actually sent.** A bodyless heartbeat (the
  shipped runner) stores nothing and emits no snapshot event — maximally preserving current
  behavior. `status()` always returns `processes` (defaulting to `[]`).
- **Request wire schemas in `crew-shared`** (mirrors `enqueueActionSchema`); response schemas
  inline in the route (mirrors `ActionRequestSchema`).

## Notes

Out of scope (later Epic tickets): runner-side registry/snapshot serialization + command apply
(CREW-243, Task 5), dashboard consumption of the snapshot/SSE (CREW-245, Task 8).
