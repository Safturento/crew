# CREW-257 — Remove inferred state path + activate idle

Jira: https://safturento.atlassian.net/browse/CREW-257

Task 6 (final) of Epic CREW-252 — `docs/superpowers/plans/2026-06-18-concrete-state-triggers.md`.
Concrete lifecycle events (CREW-253..256) now drive every transition, so strip the
transcript-inferred state path and light up the dormant `idle` state.

## Goal

`idle`/`waiting` transitions project to their own badge state, a `gh pr create`
tool_call no longer writes a `state_transition`, and the daemon's state machine is
driven entirely by concrete events. A non-zero `*_exited` routes to `error`.

## Relevant files

- `packages/daemon/src/services/state-reduce.ts` — add the `error`-from-non-zero-exit case.
- `packages/daemon/src/services/state-derivation.ts` — map `idle → idle`, `waiting → waiting`.
- `packages/daemon/src/services/AgentsService.ts` — add `idle`/`waiting` to the `AgentState` badge union.
- `packages/daemon/src/routes/agents.ts` — add `idle`/`waiting` to the API `AgentStateEnum`.
- `packages/daemon/src/services/IngestService.ts` — delete the inferred path (`computeNextState`,
  `applyStateTransition`, `lastRunIdCache` + priming, `pendingPrCreates` + transcript PR-URL extraction,
  `hasPrCreateInvocation` use). Keep `tool_calls` ingest + `tool_calls.changed` ping untouched.
- `docs/followups.md` — resolve the `idle`/`waiting`-unreachable + `finished`-footgun entries.
- `.agents/architecture.md` — describe the concrete model (inferred path removed).

## Decisions

- **`error`-from-`*_exited` routing: extend `reduceState`** (the plan's recommended path). Keep
  `recordError` as the startup-phase-failure path; a non-zero `run_exited`/`fixpr_exited` also routes
  to `error` via a new `reduceState` case that consumes the event's `exitCode`. The CLI already
  carries `exitCode` on those events (`packages/cli/src/lib/state-events/dispatch.ts`).
- **Keep `recordRunCompleted`/`recordFinishCompleted`** — route-driven (called from `routes/runs.ts`),
  not part of the transcript-inferred path. Out of scope to remove; they coexist idempotently with
  the concrete events.
- **Keep `deriveStateFromToolCalls`** — forward-only cutover; the CREW-96 backfill still relies on it
  for pre-cutover agents (it retains the `hasPrCreateInvocation` use in `state-derivation.ts`).

## Notes

The dashboard already fully supports `idle`/`waiting` (data/types.ts, state-meta.ts, AgentRow);
the only gap was the daemon's `AgentState` union + the route enum.
