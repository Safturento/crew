# CREW-291 — Runner drawers C: run drawer + failed/recently-ended/queued section wiring

Jira: https://safturento.atlassian.net/browse/CREW-291

Implements plan tasks **T3** (run drawer + failed-to-start / recently-ended wiring) and
**T6** (queued section wiring) of `docs/superpowers/plans/2026-06-25-runner-drawers.md`.
Blockers B (daemon endpoints, CREW-290) and F (Figma drawers, CREW-294) are merged on main.

## Goal

Every run row on the Runner page (live process / failed-to-start / recently-ended) is
clickable → a **run drawer** that shows the run's header, meta, failed-start diagnosis, and
raw startup console log. The three stubbed `useRunnerPageData` sections
(`failedToStart` / `queued` / `recentlyEnded`) render real data from `GET /api/runner/page`.
The interim `ViewOutputModal` is absorbed into the run drawer.

## Relevant files

- `packages/dashboard/src/components/runner/RunDrawer.tsx` — **new**, the drawer (header/meta/diagnosis/console).
- `packages/dashboard/src/components/runner/useRunnerPageData.ts` — replace the `[]` stubs with fetched data.
- `packages/dashboard/src/data/useRunnerPage.ts` — **new** TanStack Query hook over `getRunnerPage`.
- `packages/dashboard/src/data/useStartupLog.ts` — **new** hook over `getStartupLog` (poll while live).
- `packages/dashboard/src/data/{DaemonClient,HttpDaemonClient,MockDaemonClient}.ts` — `getRunnerPage` + `getStartupLog`.
- `packages/dashboard/src/components/runner/{ProcessRow,FailedStartCard,RecentlyEnded}.tsx` — row → open drawer.
- `packages/dashboard/src/components/runner/ViewOutputModal.tsx` (+ `.figma.tsx`) — **deleted** (absorbed).

## Decisions

- **One drawer, discriminated source.** `RunDrawer` takes a `RunDrawerSource` union
  (`live` `LiveProcess` / `failed-start` `FailedStartView` / `ended` `EndedRunView`) and
  derives the header pill, meta, diagnosis, and console from it. Each row owns its own
  drawer open-state locally (same pattern `FailedStartCard` used for `ViewOutputModal`).
- **Console = `getStartupLog(key)` with a fallback.** The drawer always fetches
  `~/.crew/startup/<key>.log`; on 404 it falls back to any `failure.output` already in hand,
  else "No output captured." Live runs poll-refetch the body every 2s (mirrors
  `useRunnerLogs`); the daemon's `?follow=1` SSE tail is left as a future upgrade.
- **pid/pgid only for live runs.** The daemon page schema carries pid/pgid only on
  `LiveProcess`; failed/ended drawers omit them honestly (Figma mock showed them for all
  three — a known low-severity visual-fidelity gap).
- **Relative timestamps.** Meta uses `formatAgo` to match every other Runner row; the Figma
  mock's absolute clock times are a low-severity content gap.

## Notes

Queued rows (T6) keep their `Dequeue` action and do **not** open a drawer — a queued action
has not spawned, so there is no console log to show.
