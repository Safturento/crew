# Runner per-entity log drawers + supervisor controls (CREW-249)

**Status:** design approved (in-session, 2026-06-25), ready for planning
**Epic:** [CREW-249](https://safturento.atlassian.net/browse/CREW-249) (was parked pre-brainstorm)
**Builds on:** CREW-235 runner-control v1 (`docs/superpowers/specs/2026-06-16-crew-235-runner-control-design.md`) — the Runner page, failed-start capture, `runner_commands` reverse-queue, and per-key startup-events that this Epic completes.

## Context

The Runner page (CREW-245) shipped with three of its six sections live and three stubbed (`failedToStart`/`queued`/`recentlyEnded` return `[]` in `useRunnerPageData` — no daemon read endpoint), the failed-start "View output" as a thin modal, and the supervisor Restart/Stop/Start buttons rendered-but-disabled. CREW-235 deliberately built *toward* a per-entity drawer end-state ("no-orphaned-logs": every log is keyed to an entity and reached by clicking it). This Epic delivers that end-state.

**Driver:** make startup errors/issues visible — especially the silent class. A run that dies *before* it registers (e.g. the CREW-287 worktree wedge: `git worktree add -b` fails on an orphan branch) currently leaves **no captured output at all** — the runner spawns `crew run` detached and ignores its stdio. That is the #1 thing to fix.

## Goals

- Any run row (live / failed-start / recently-ended / unmanaged) is clickable → a **run drawer** showing that run's diagnosis, metadata, and **raw startup console log** (incl. silent pre-registration deaths).
- A **supervisor drawer** surfaces process-management logs (spawn/respawn/heartbeat/reap).
- The three stubbed Runner-page sections get a real read surface.
- Supervisor **Stop/Restart** controls are wired (cold Start stays a CLI hint).
- The failed-start "View output" modal is absorbed into the run drawer.

## Architecture

Five pillars (capture → serve → consume), foundational-first.

### 1. Raw startup-log capture (the new infrastructure)

The runner's `executor.launch` (`packages/cli/src/lib/runner/executor.ts`) currently spawns `crew run` detached with ignored stdio. Change it to open `~/.crew/startup/<key>.log` and redirect the detached child's **stdout + stderr** into it (file-descriptor redirect — no piping through the runner). Capture the **whole `crew run` lifetime** (simplest + robust; also catches post-registration crashes). Overlap with the agent transcript is harmless — the transcript is a separate data source (the daemon's transcript watcher); this file is the `crew run` wrapper's own console.

- Mirrors existing patterns: the structured `~/.crew/startup/<key>.jsonl` events and `runner.log` already live here and are host-mounted into the daemon read-only.
- Rejected alternatives: **pipe + forward to daemon** (more plumbing, redundant with the mount pattern); **structured-events only** (the silent class still shows nothing — fails the driver).

### 2. Daemon read + log-serving surfaces

- **`GET /api/runner/page`** → `{ failedToStart, queued, recentlyEnded }`:
  - `failedToStart` — `runs` where `status='failed-start'` and unacknowledged (`RunFailureService` already stores + acknowledges).
  - `recentlyEnded` — `runs` in terminal states ordered by `completed_at desc`, limited.
  - `queued` — a **new read-only** list of pending `action_requests` (distinct from `GET /api/actions/pending`, which *claims*).
- **`GET /api/runs/:key/startup-log`** — serves `~/.crew/startup/<key>.log`: full body for ended runs, SSE-tailed for in-flight. Requires mounting `~/.crew/startup` read-only into the daemon (the `<key>.jsonl` events already imply this dir; confirm the `.log` is served too).
- **`GET /api/runner/supervisor-log`** — serves/tails the supervisor management stream from `runner.log` (filtered to spawn/respawn/heartbeat/reap lines).
- All new routes get Bruno coverage.

### 3. Run drawer

A sibling to the agent drawer, reusing the existing drawer shell. Opened by clicking any run row (live / failed-start / recently-ended / unmanaged). Content:

- **Header** — `agentKey`, command badge, state pill.
- **Meta** — PID/PGID, project, started/ended timestamps, state.
- **Diagnosis** (failed-start only) — the structured `check` name, `headline`, amber `→ remediation`, `details` map. **Absorbs the View-output modal** (its Diagnosis+Output content moves here).
- **Console log** — the §1 startup log: SSE-tailed while in-flight, static when ended.

Row→drawer affordance already hinted in v1 rows (hover/clickable). The failed-start `View output` button becomes "open drawer".

### 4. Supervisor drawer

Opened from the `SupervisorCard`. Tails the supervisor's management log (§2 supervisor-log endpoint) — spawn / respawn / heartbeat / reap. Mostly serving + a filtered view over the existing `runner.log`.

### 5. Supervisor controls (Stop / Restart wired; cold Start = CLI)

- Extend the `runner_commands` reverse-queue with **supervisor-level** commands (`supervisor_stop`, `supervisor_restart`) the supervisor process drains and applies to itself (stop = exit; restart = re-exec the worker, or exit-and-respawn).
- **Cold Start** (supervisor fully stopped → nothing draining the queue, and the containerized daemon can't spawn a host process): the Start button shows a `run \`crew runner start\` on the host` hint rather than acting. No new always-on host component.
- Daemon control route + Bruno; dashboard `SupervisorCard` `onRestart`/`onStop` handlers wired, `onStart` → hint.

## Data flow

```
crew run (child) ──stdout/stderr──▶ ~/.crew/startup/<key>.log ──(ro mount)──▶ daemon ──GET /api/runs/:key/startup-log──▶ run drawer
runs / action_requests ──────────────────────────────────────▶ daemon ──GET /api/runner/page──▶ Runner page sections
runner.log (supervisor) ──(ro mount)──▶ daemon ──GET /api/runner/supervisor-log──▶ supervisor drawer
SupervisorCard (Stop/Restart) ──POST control──▶ daemon ──runner_commands──▶ supervisor drains + applies
```

## Decomposition (child tickets)

| # | Ticket | Depends on | Notes |
|---|---|---|---|
| T1 | **Startup-log capture** — runner redirects detached child stdio → `~/.crew/startup/<key>.log` (+ test) | — | Foundational; pure CLI. Unblocks T2's log endpoint. |
| T2 | **Daemon read + log-serving** — `GET /api/runner/page`, `GET /api/runs/:key/startup-log` (static+SSE), `GET /api/runner/supervisor-log`, queued read query, startup-dir ro mount (+ Bruno) | T1 (for the startup-log endpoint) | Page-data + recently-ended/failed/queued queries don't need T1; the startup-log endpoint does. |
| T3 | **Run drawer** — clickable run rows → drawer (header/meta/diagnosis/console log); absorb View-output; wire `failedToStart`/`recentlyEnded` sections to T2 | T2 | Consumes `/api/runner/page` + `/api/runs/:key/startup-log`. |
| T4 | **Supervisor drawer** — `SupervisorCard` → drawer tailing the supervisor-log endpoint | T2 | Consumes `/api/runner/supervisor-log`. |
| T5 | **Supervisor controls** — `runner_commands` supervisor_stop/restart + runner support + daemon route + `SupervisorCard` Stop/Restart wired, Start→CLI hint (+ Bruno) | — (parallel with T1) | Independent of the log/drawer pillars; touches runner + daemon + dashboard. |
| T6 | **Queued section wiring** — `QueuedActions` consumes T2's `queued` | T2 | Small; could fold into T3. |

## Parallelism plan

| Phase | Tickets | Sequence |
|---|---|---|
| 1 | **T1**, **T5** | Parallel. T1 (capture) is the log foundation; T5 (controls) is independent (reverse-queue + controls). |
| 2 | **T2** | After T1 (its startup-log endpoint needs the captured files). The page/queued/recently-ended queries could start earlier but ship together as the read surface. |
| 3 | **T3**, **T4**, **T6** | Parallel after T2 — three dashboard consumers of the read/log endpoints. Merge one-at-a-time (shared `useRunnerPageData` + Runner page wiring are append-points). |

Jira links: T1 blocks T2; T2 blocks T3/T4/T6; T5 unlinked (parallel). All are `crew run` tickets except the canonical Figma build of the drawers into `Dashboard Screens`, which is **interactive** (visual judge) per the CREW-235 precedent — the run/supervisor drawers need a Figma source before visual-fidelity can validate.

## Testing

- **CLI:** startup-log file is created and receives the child's stdout/stderr; a run that dies pre-registration still leaves a non-empty log (the worktree-wedge case).
- **Daemon:** `/api/runner/page` returns the three lists from `runs`/`action_requests`; startup-log endpoint serves static + tails; supervisor-log endpoint filters management lines; supervisor control route enqueues the reverse-queue command. Bruno per route.
- **Dashboard:** run row → drawer renders diagnosis + console log; failed-start drawer shows the structured check; the three sections render real data; supervisor Stop/Restart enqueue, Start shows the CLI hint.
- **Visual fidelity:** run + supervisor drawers vs the Figma source once built.

## Open questions

- **Startup-log retention/rotation.** Keep until the ticket is re-run (like failed-start auto-clear), or size/age-rotate `~/.crew/startup/<key>.log`? Lean: clear on re-run + a coarse age cap.
- **Supervisor-log filtering.** Is `runner.log` already tagged enough to filter management lines (spawn/respawn/heartbeat/reap), or does the supervisor need to emit a structured management-event stream? Resolve in T4 against the actual log format.
- **Restart semantics.** Does `supervisor_restart` re-exec in place or exit-and-rely-on-respawn? Depends on the supervisor's current self-respawn design (`supervisor.ts`).
