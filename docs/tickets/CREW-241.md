# CREW-241 — Control-queue foundation: shared types + runner_commands migration + RunnerCommandsService

Jira: https://safturento.atlassian.net/browse/CREW-241

Ticket **A** of Epic [CREW-235](https://safturento.atlassian.net/browse/CREW-235) (runner control parity). Plan: `docs/superpowers/plans/2026-06-16-crew-235-runner-control.md` Tasks 1–3.

## Goal

The foundation the rest of the Epic builds on: the shared runner-control types, the persisted reverse-command queue (`runner_commands`), and the daemon service that owns its lifecycle.

## Relevant files

- `packages/shared/src/runner/types.ts` — `LiveProcess`, `RunnerSnapshot`, `RunnerCommand`, `RunnerCommandKind`, `LiveProcessState`, `RunFailure`, plus the `RUNNER_COMMAND_KINDS` / `RUNNER_COMMAND_STATUSES` / `LIVE_PROCESS_STATES` const tuples. Re-exported via `runner/index.ts` → package index.
- `packages/daemon/src/migrations/0009_runner_commands.ts` — the `runner_commands` table (CHECK constraints mirror the shared tuples).
- `packages/daemon/src/db.ts` — `RunnerCommandsTable` interface added to `DaemonDatabase`.
- `packages/daemon/src/services/RunnerCommandsService.ts` — `enqueue` / `claimPending` / `reportResult`, registered scoped in `container.ts`.
- `packages/daemon/src/services/EventBus.ts` — new `runner.command_changed` SSE payload variant.

## Decisions

- **Migration numbered `0009`, not `0008`** — the plan was written when `0008` was the next free number, but `0008_agent_app_url` has since landed. Took the next free slot; CREW-244 (the Epic's other migration-adder) rebases its migration number accordingly per the Epic's "one migration-adder per merge" rule.
- **New `runner/` shared module** rather than folding into `actions/` — runner control is a distinct concern; mirrors the `actions/` module shape (const tuples + derived unions, per the shared-package convention).
- **`claimPending` uses a transaction + re-asserted `WHERE status='pending'`** — copied `ActionService.claimNextPending`'s proven atomic-claim pattern rather than the plan's sketched subquery-in-`where` form (the plan flagged this fallback).
- **`enqueue` returns the full `RunnerCommand`** (not just `{ id }`) — matches `ActionService.enqueue` returning `ActionRequest`; the CREW-242 route can return it directly.
- **`reportResult` on an unknown id is a no-op** (no throw) — the runner reports results best-effort; a missing row (already settled) shouldn't crash the drain cycle.

## Notes

`pause` / `resume` / `message` kinds are in the contract from day one (carried by the queue) but their apply paths are fast-follow (CREW-248). Snapshot/route wiring is CREW-242; this ticket is types + queue + service only — no HTTP route yet, so no Bruno endpoint is added here.
