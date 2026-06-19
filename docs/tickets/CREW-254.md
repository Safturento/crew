# CREW-254 — Daemon reducer + durable state-event log ingestion

Jira: https://safturento.atlassian.net/browse/CREW-254

Epic child **B** of CREW-252 (Concrete State Triggers). Implements plan Tasks 2–3
of `docs/superpowers/plans/2026-06-18-concrete-state-triggers.md`. Depends on A
(CREW-253, shared `StateEvent` contract — already merged). Blocks E (CREW-257).

## Goal

The daemon side of concrete state triggers: a pure total reducer
`reduceState(current, event) → next | null`, plus durable ingestion of the
per-key `~/.crew/state-events/<key>.jsonl` log that drives `state_transitions`.
Idempotent on `eventId` across a daemon restart; `idle` becomes reachable.

## Relevant files

- `packages/daemon/src/services/state-reduce.ts` — pure reducer (sticky `finished`/`pr_merged`; `run_exited → idle | null`).
- `packages/daemon/src/migrations/0011_state_events_applied.ts` — eventId dedup ledger.
- `packages/daemon/src/db.ts` — `StateEventsAppliedTable` + cache type widening rationale.
- `packages/daemon/src/config.ts` — `CREW_STATE_EVENTS_DIR` (default `~/.crew/state-events`).
- `packages/daemon/src/services/IngestService.ts` — `ingestStateEvent` + the `watchStateEvents`/`onStateEventFile`/`stopStateEventWatcher` trio.
- `packages/daemon/src/app.ts` — onReady start / onClose stop wiring.
- `docker-compose.yml` — read-only mount of `~/.crew/state-events`.

## Decisions

- **Migration number is `0011`, not the plan's `0010`.** The plan's "next free number is 0010" was stale — `0010_run_failure_fields` shipped via CREW-244 between plan-authoring and implementation. Used `0011`.
- **Reducer + cache operate over `TransitionTarget`, not `TransitionState`.** The plan's reducer signature (`TransitionState | null`) is a latent type error: it returns `idle`, which lives only in the wider `TransitionTarget` union. Widened `reduceState`, `agentStateCache`, and `getCachedAgentState` to `TransitionTarget` so `idle` round-trips. The DB columns + migration-0002 CHECK already permit `idle`/`waiting`.
- **`idle` recognized on cold read-back, `error` deliberately not.** New `isTransitionTarget` guard adds `idle`/`waiting` to the read-back set so a concrete-event state survives a restart, but preserves the legacy `isTransitionState` quirk of treating a stored `error` as a cold-read miss (→ `init`) — unchanged behavior for existing error agents.
- **No new HTTP route.** Delivery is file-log only (consistency with startup-events), so no Bruno endpoint added — bruno-collection-maintenance is a no-op here.
- **Inferred path left intact.** `computeNextState` / transcript-driven transitions still co-exist; their removal + the `idle` badge mapping are CREW-257's scope (Task 6), which this ticket blocks.

## Open questions

- [ ] None blocking. The `error`-from-`*_exited` routing decision is CREW-257's (Task 6 / Task 4 emitters), not this ticket.

## Ruled out

- Keeping the cache as `TransitionState` and skipping the cache write when `next === 'idle'` — would break the idle→`run_started`→running resume case (a warm cache stuck on the pre-idle state would no-op the resume). Widening the cache is the correct fix.

## Notes

- **Schema change → daemon container must be rebuilt** (not just hot-reloaded) before the dashboard works against the new binary. The running stack stays on the old binary until `docker compose up --build`. Flagged in the PR body.
- Verification: `npm run -w crew-daemon test` (383 pass), `npm run typecheck`, `npm run lint`, `npm run bruno:smoke` (28/28) all clean.
