# CREW-307 — Runner rework A: daemon spine (queued/orphaned states + row-at-initiation)

Jira: https://safturento.atlassian.net/browse/CREW-307

Implements Tasks 1–4 of `docs/superpowers/plans/2026-06-30-runner-page-rework.md` (spec: `docs/superpowers/specs/2026-06-30-runner-page-rework-design.md`). The plan/spec live on the unmerged `docs/runner-page-rework-spec` branch; content mirrored here.

## Goal

The daemon spine every later ticket depends on:

1. Two new lifecycle states — `queued` + `orphaned` — derive/reduce correctly.
2. `ActionService.enqueue` births a `queued` agent row (+ transition) for `kind:'run'` (dashboard path).
3. `POST /api/runner/initializing` → `RunFailureService.recordInitializing` → `CrewDaemonClient.reportInitializing` (direct-CLI birth; idempotent upsert), with a Bruno endpoint.

## Relevant files

- `packages/shared/src/state-events/types.ts` — add `run_orphaned` StateEventKind (feeds the reduce edge).
- `packages/shared/src/paths/worktree.ts` (new) — `worktreePathFor` moved here so the daemon can derive worktree paths; CLI re-exports.
- `packages/daemon/src/services/state-derivation.ts` — `TransitionState` + `TRANSITION_TO_AGENT_STATE`.
- `packages/daemon/src/services/AgentsService.ts` — `AgentState`/`StateTransitionState` unions + `deriveState`.
- `packages/daemon/src/services/state-reduce.ts` — `run_orphaned` reduce edge into `orphaned`.
- `packages/daemon/src/services/RunFailureService.ts` — `birthQueued` + `recordInitializing`.
- `packages/daemon/src/services/ActionService.ts` + `container.ts` — enqueue births the queued row.
- `packages/daemon/src/routes/runner.ts` + `routes/agents.ts` — initializing endpoint + widened state enums.
- `packages/daemon/src/services/IngestService.ts` — recognize `queued`/`orphaned` on transition read-back.
- `packages/daemon/src/db.ts` + new migration `0015_*` — widen `state_transitions` CHECK.
- `packages/cli/src/lib/daemon-client/index.ts` — `reportInitializing` client.
- `bruno/endpoints/runner/post-initializing.bru`.

## Decisions

- **Migration required (plan/spec were wrong).** The plan says "No schema migration (states are `state_transitions.to_state` text)". Not true: migration 0005 established a hard `CHECK (to_state IN (...))` constraint (preserved by 0012's `ADD COLUMN`). Writing `queued`/`orphaned` transitions fails the CHECK at runtime. Added migration `0015_state_transitions_queued_orphaned` (table-rebuild, 0005 pattern) to widen both `from_state`/`to_state` CHECK lists.
- **`worktreePathFor` moves to `crew-shared`.** The daemon's `enqueue` must derive `worktree_path` (NOT NULL) the same way the CLI does — one canonical impl in shared, re-exported from `cli/lib/run/paths.ts`, avoids drift (the docker port allocator keys off the sibling-basename naming).
- **Birth methods live on `RunFailureService`** (per plan). It already owns the agents-row upsert; it writes the birth transition + publishes `agent.state_changed` directly. Safe re: `IngestService`'s state cache because that cache lazily loads from the DB on first touch of a key.
- **`recordInitializing` idempotency:** upsert the agent always; write the `init` transition only when the current state is absent or `queued` (fresh birth `∅→init`, dashboard `queued→init`). Never regresses an agent already past init.

## Scope boundary

Tasks 5–13 (CLI birth call, early-gate failures, reap-reason, orphan reclaim, dashboard retire) are **later tickets**. This ticket adds `reportInitializing` to the CLI client but does **not** wire it into `run.ts` (that's Task 5).

## Notes

Daemon-only + one CLI client method. No dashboard/Figma changes, so no visual-fidelity gate.
