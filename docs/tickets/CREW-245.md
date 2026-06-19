# CREW-245 — Runner page (dashboard): 3rd tab, sections, cancel escalation

Jira: https://safturento.atlassian.net/browse/CREW-245

Task 8 of Epic **CREW-235** (Runner control parity). Plan: `docs/superpowers/plans/2026-06-16-crew-235-runner-control.md`. Spec: `docs/superpowers/specs/2026-06-16-crew-235-runner-control-design.md`. Figma source of truth: Runner Page `775:3715`, View-output modal `777:3872`, composites SupervisorCard `789:1190` / ProcessRow `767:1179` / FailedStartCard `771:1142` / ViewOutputContent `774:1150`.

## Goal

A top-level **Runner** tab rendering the full section stack (Supervisor, Failed to start, Live processes, Unmanaged runs, Queued actions, Recently ended) through one shared `Row`, with the soft→hard cancel escalation and the failed-start View-output (Inspect) modal.

## Relevant files

- `packages/dashboard/src/routing/parseRoute.ts` — `runner` route kind.
- `packages/dashboard/src/components/TopNav.tsx` — Runner tab.
- `packages/dashboard/src/App.tsx` — route the page.
- `packages/dashboard/src/components/Row.tsx` (new) — shared generic row; AgentRow refactors onto it.
- `packages/dashboard/src/components/runner/*` (new) — section components + RunnerPage.
- `packages/dashboard/src/data/useRunnerStatus.ts` — seed `processes`, subscribe to `runner.snapshot_changed`.
- `packages/dashboard/src/data/{DaemonClient,HttpDaemonClient,MockDaemonClient}.ts` — `processes` on `RunnerStatus`; `enqueueRunnerCommand` + `acknowledgeRun`.
- `packages/dashboard/src/data/eventStream.ts` — add `runner.snapshot_changed`.

## Decisions

- **Shared `Row` takes an explicit `accent?: AgentState`** rather than auto-deriving the tint from the status-pill color. The Figma shows live-process rows (incl. `cancelling`, whose pill is amber) rendered *plain*, while only Failed-to-start (`error`) and Unmanaged (`waiting`) carry the tinted bg/border + `animate-att-pulse` left bar. Auto-deriving from the pill would wrongly tint cancelling/error-in-recently-ended rows. AgentRow keeps its exact behavior by passing `accent={meta.attention ? agent.state : undefined}`.
- **Status-pill color ≠ row accent.** ProcessRow maps `launching→initializing` (blue), `running→running` (slate), `cancelling→waiting` (amber) pills; rows stay plain.
- **Data wiring is bounded to what the already-merged daemon serves.** This run can't ship/restart the daemon, and the plan scopes Task 8 dashboard-only consuming `GET /api/runner/status`. So:
  - **Supervisor + Live processes** — real, from `/api/runner/status` (online/lastSeen + `processes` snapshot) + the `runner.snapshot_changed` SSE event (shipped by CREW-242).
  - **Unmanaged runs** — derived honestly client-side: agents in `running`/`initializing` whose key is absent from the live snapshot (exactly the spec's "running in DB, no live process").
  - **Cancel / Force kill / Reap / Dequeue** — `POST /api/runner/commands` (`cancel_soft`/`cancel_hard`/`reap`/`dequeue`); **Archive** — `POST /api/runs/:key/acknowledge`. All exist on the merged daemon.
  - **Failed to start / Queued / Recently ended** — no read endpoint exists on the merged daemon (the claim route mutates; failed-start runs aren't "agents"). Components are fully built + fixture-tested + visually verified; their live read wiring is fed `[]` in v1 (sections hide when empty / show the specified empty state) and deferred to the CREW-249 per-entity read surfaces. See followup.
- **Supervisor Restart/Stop/Start** render to match Figma but are not wired (those are `crew runner` CLI ops with no daemon control route). Surfaced as a followup.
- **Cancel escalation extracted to `useCancelEscalation`** so the row and (CREW-246) the drawer header share one timer.

## Ruled out

- Adding daemon read endpoints for failed-start/recently-ended/queued this run — the live stack runs the merged daemon binary and can't be rebuilt mid-run, so new routes couldn't be smoke-/visually-verified; and the plan scoped Task 8 dashboard-only. Deferred, not abandoned.
- Deriving Recently-ended from `/api/agents` terminal agents — would duplicate the Agents list and can't reconstruct the `cancelled`/`soft cancel` sub-states (those need `runs.status`). Left for the real read endpoint.

## Notes

Cancel escalation: `Cancel` → AlertModal → confirm enqueues `cancel_soft`, row reflects `cancelling`, a `Force kill` (enqueues `cancel_hard`) appears after ~10s. Timer cleared on unmount/settle; covered with fake timers.
