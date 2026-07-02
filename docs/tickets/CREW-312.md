# CREW-312 — Runner rework F: supervisor drawer roll-up + retire the Runner page

Jira: https://safturento.atlassian.net/browse/CREW-312

## Goal

The supervisor drawer becomes the runner's single housekeeping surface — Controls
(Start / Stop / Restart), a Reconcile roll-up (every queued `Dequeue` + orphaned
`Reap` across projects from `GET /api/runner/reconcile`), and the enriched
management log — and the standalone Runner page plus its exclusive component
subtree are deleted with no dangling imports. Plan task 12 of
`docs/superpowers/plans/2026-06-30-runner-page-rework.md` (Epic CREW-306); blocked
by D (CREW-310, reconcile read) + E (CREW-311, grid states + chip toggle).

## Relevant files

- `packages/dashboard/src/components/runner/SupervisorDrawer.tsx` — Controls + Reconcile section added
- `packages/dashboard/src/data/runnerControls.ts` — the shared control hooks (Dequeue/Reap/Stop/Restart)
- `packages/dashboard/src/data/useReconcile.ts` — the roll-up query (CREW-311)
- `packages/dashboard/src/App.tsx` / `routing/parseRoute.ts` — `/runner` route removed
- `packages/dashboard/src/data/{DaemonClient,HttpDaemonClient,MockDaemonClient}.ts` — dead `getRunnerPage` read dropped

## Decisions

- **The drawer owns its data + control hooks internally** — it already pulled
  `useSupervisorLog` internally while taking `supervisor` (online/lastSeen) as a
  prop. Following that pattern, the Reconcile roll-up (`useReconcile`) and the
  control mutations (`useStopSupervisor` / `useRestartSupervisor` / `useDequeue`
  / `useReap`) are wired inside the drawer rather than threaded through the thin
  `RunnerStatusChip` mount. The chip stays presentation-only.
- **Full subtree retirement, not just the named sections** — deleting the Runner
  page orphaned an entire exclusive component tree (ProcessRow, RunDrawer,
  CommandBadge, FailedStartCard, rowStates, SupervisorCard, useLiveDuration,
  useRunnerPage) beyond the 5 top-level sections the ticket names. Left in place
  they'd be unreachable dead code, so they're deleted too — each verified to
  have zero non-deleted importers, with typecheck as the backstop. Sections that
  survive because a *kept* component uses them (`Row`, `useCancelEscalation`)
  stayed.
- **`getRunnerPage` removed across all three client surfaces** — it was the dead
  read backing `useRunnerPageData`; the ticket's "remove dead reads from
  `HttpDaemonClient.ts`" extends naturally to the `DaemonClient` interface + the
  mock. The daemon `GET /api/runner/page` route is left untouched (out of scope).
- **`#/runner` falls back to the agents list** — the route is deleted from the
  `Route` union; the hidden hash now resolves to `agents-list` (was kept
  parseable by E between tickets).
- **Controls are Start/Stop/Restart, matching the retired SupervisorCard** —
  online shows Restart + Stop; offline shows a cold-Start CLI hint toast (the
  containerized daemon can't spawn the host supervisor once fully stopped).

## Ruled out

- **Decommissioning `useArchiveFailedStart` / `acknowledgeRun` in this PR** — the
  Runner page's Archive control was their only consumer, so they're now orphaned,
  but `acknowledgeRun` is a *write* backed by a live daemon route (not a dead
  read) and re-surfacing Archive on error rows is a live option. Noted as a
  followup (`docs/followups/dashboard-ui.md`) instead of expanding scope.

## Notes

- Design: Figma supervisor drawer overview `899:1887` (file
  `9FeJPriqdsdA4n9R5Xsrr8`, Brainstorm page) — meta-row workers/uptime/pid are
  depicted but not on the `SupervisorView` wire yet, so the header keeps the
  existing heartbeat + last-seen line.
