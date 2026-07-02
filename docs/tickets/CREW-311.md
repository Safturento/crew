# CREW-311 — Runner rework E: dashboard grid — queued/orphaned states, inline actions, nav

Jira: https://safturento.atlassian.net/browse/CREW-311

## Goal

The Agents grid renders the two new lifecycle states (`queued`, `orphaned`) with
their inline actions (Dequeue / Reap / Restart / Inspect), the Runner nav tab is
gone, and the header runner chip becomes the supervisor-drawer toggle carrying
an orphaned-count badge from `GET /api/runner/reconcile`. Plan tasks 10–11 of
`docs/superpowers/plans/2026-06-30-runner-page-rework.md` (Epic CREW-306).

## Relevant files

- `packages/dashboard/src/data/types.ts` — dashboard `AgentState` + `TransitionState` unions
- `packages/dashboard/src/data/state-meta.ts` — `STATE_META`, `STATE_CLASSES`, the two vocabulary maps
- `packages/dashboard/src/components/AgentRow.tsx` — per-state QuickActions switch
- `packages/dashboard/src/components/TopNav.tsx` + `RunnerStatusChip.tsx` — nav tabs + chip
- `packages/dashboard/src/components/runner/SupervisorDrawer.tsx` — the drawer the chip now toggles
- `packages/dashboard/src/data/DaemonClient.ts` / `HttpDaemonClient.ts` / `MockDaemonClient.ts` — `reconcile()` read
- `packages/shared/src/runner/page.ts` — `ReconcileRollup` / `RunRef` wire shapes (CREW-310)

## Decisions

- **Error rows split Restart vs Resume on `startedAt === ''`** — the Figma FINAL
  grid (`901:2209`) shows failed-start errors with Restart + Inspect and mid-run
  errors with Resume + Inspect. A failed-start agent has no `runs` row, so the
  daemon serves `startedAt: ''`; that's the discriminator. Restart enqueues a
  plain `run` — CREW-309 made preflight self-heal the orphan worktree, so the
  dashboard Restart "drives the same path" (its PR description's words).
- **`#/runner` route stays parseable (hidden) until F** — the plan allows "drop
  the `runner` route or repoint it"; ticket F (CREW-312) deletes the page, its
  route, and its sections wholesale. Removing only the tab here keeps the
  supervisor controls reachable by direct URL between E and F and keeps the diff
  honest about which ticket deletes what.
- **Chip badge counts `orphaned` only** — the spec left "queued + orphaned vs
  orphaned only" open; the ticket text pins it to the orphaned count. Queued is
  a normal transient state, orphaned is the anomaly worth a badge.
- **RunnerLogViewer deleted here, not in F** — the chip was its only mount;
  repointing the chip at the SupervisorDrawer orphans it, and F's delete list
  doesn't include it. Same-PR cleanup keeps no dead code behind.
- **sortRank: orphaned 1.5, queued 4.5** — orphaned is attention-worthy
  housekeeping (between error and pr_open); queued is pre-run quiescence
  (between initializing and idle).

## Open questions

- [ ] None.

## Ruled out

- Three-button error rows (Resume + Restart + Inspect) — the design shows two
  per error kind, and each verb is only *functional* for its kind (Resume needs
  a session to continue; Restart wants a reclaimable worktree).
- Counting queued in the chip badge — see Decisions.

## Notes

The committed Figma snapshot (`.crew/figma-snapshot`, captured 2026-06-24)
predates the runner-rework designs — AgentRow's variant axis there still has
only the original 7 states. The FINAL grid lives at node `901:2209` on the
Brainstorm page; visual fidelity for the *new* states was checked against a
live MCP screenshot of that node instead.
