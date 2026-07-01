# CREW-310 — Runner rework D: reconcile roll-up read surface

Jira: https://safturento.atlassian.net/browse/CREW-310

Plan task 9 in `docs/superpowers/plans/2026-06-30-runner-page-rework.md` (unmerged at
implementation time; Task 9 section extracted for reference). Blocked by A (CREW-307,
merged — `queued`/`orphaned` lifecycle states already in `AgentState`).

## Goal

Add a read-only roll-up the supervisor drawer (F) and the runner chip badge (E) consume:
`GET /api/runner/reconcile` → `{ queued: RunRef[], orphaned: RunRef[] }`, where
`RunRef = { key, projectName, state, since }` — every agent whose derived state is
`queued` or `orphaned`, across all projects. Excludes `running` (and every other state).

## Relevant files

- `packages/shared/src/runner/page.ts` — `RunRef` + `reconcileRollupSchema` wire shapes.
- `packages/daemon/src/services/RunnerPageService.ts` — `reconcile()` roll-up; reuses
  `AgentsService.list()` state filter (the `activeTicketKeys` pattern) for derivation,
  then joins the latest `state_transitions.ts` per key for `since`.
- `packages/daemon/src/container.ts` — inject `agentsService` into `runnerPageService`.
- `packages/daemon/src/routes/runner.ts` — thin `GET /api/runner/reconcile` route.
- `bruno/endpoints/runner/get-reconcile.bru` + `package.json` `bruno:smoke` list.

## Decisions

- **`since` is the latest `state_transitions.ts` (ISO string), not `AgentSummary.startedAt`.**
  A `queued` agent is birthed via `recordInitializing`/enqueue with a `queued` transition
  and no `runs` row, so `startedAt` (sourced from the runs join in `list()`) is empty for
  it. The transition ts is the honest "entered this state" timestamp for both buckets.
- **Reuse `AgentsService.list()`** for state derivation (per the ticket) rather than a
  bespoke query, so the terminal/override guards aren't reimplemented. Low-frequency call
  (drawer open / chip poll), so the heavier `list()` joins are acceptable — same rationale
  as `activeTicketKeys`.
- **Each bucket sorted oldest-`since`-first** — the longest-waiting/oldest-orphan surfaces
  at the top of the drawer.

## Notes

Backend-only ticket; no dashboard render yet (that's tasks E/F). Bruno smoke seeds no
queued/orphaned agent, so the `.bru` asserts shape (200 + both arrays present).
