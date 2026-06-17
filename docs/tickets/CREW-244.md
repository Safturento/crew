# CREW-244 — Register-before-preflight + structured failed-start capture

Jira: https://safturento.atlassian.net/browse/CREW-244

Ticket **D** of Epic CREW-235 (runner control parity). Plan: `docs/superpowers/plans/2026-06-16-crew-235-runner-control.md` Task 7.

## Goal

Make init/preflight failures visible. Today a `crew run` that dies in
preflight (missing remote, failed health check) leaves **zero trace** in the
daemon — registration only happens after Claude spawns. This ticket:

1. Registers the run as `launching` **before** preflight, so a failure has a
   row to convert.
2. On a `PreflightError`, records a structured **failed-start** (check /
   headline / remediation / rendered output) instead of exiting silently.
3. Auto-acknowledges a prior failed-start when a new run for the same key
   registers, and lets the operator acknowledge one explicitly.
4. A time-based reaper settles a stuck `launching` row to `failed-start`.

## Relevant files

- `packages/daemon/src/migrations/0010_run_failure_fields.ts` — new columns on `runs`.
- `packages/daemon/src/db.ts` — `RunsTable` columns.
- `packages/shared/src/runner/types.ts` — `RUN_STATUSES` / `RunStatus`, existing `RunFailure`.
- `packages/daemon/src/services/RunFailureService.ts` — record/acknowledge/reap.
- `packages/daemon/src/routes/runner.ts`, `routes/runs.ts` — new routes + auto-ack hook.
- `packages/cli/src/commands/run.ts`, `lib/run/agent-environment.ts` — register-before-preflight reorder.
- `packages/cli/src/lib/daemon-client/index.ts` — `reportLaunching` / `reportFailedStart` / `acknowledgeRun`.
- `bruno/endpoints/runner/`, `bruno/endpoints/runs/` — `.bru` for the new routes.

## Decisions

- **Migration is `0010`, not `0009`.** The plan was written assuming `0009`
  for these fields, but `0009_runner_commands` (CREW-241) and
  `0008_agent_app_url` (CREW-233) already shipped. Next free number is `0010`.
- **`runs` gains a nullable `status` column.** The plan assumed a `status`
  column already existed ("text column — no DDL needed"); it did not. `runs`
  derived state from `completed_at`/`exit_code`/transitions. `status` is
  additive and nullable: legacy + normal runs leave it `null` (derivation
  unchanged); only the launching/failed-start lifecycle writes it.
- **`failure_output` carries the rendered preflight error.** `RunFailure`
  (shared) is `{check, headline, remediation, output}`. The `PreflightError`'s
  `details` map is folded into `output` via `renderPreflightError`, so no
  separate `details` column is needed.
- **Launching rows are placeholders cleared on successful registration.** A
  `launching` row is keyed by `agent_key` with a synthesized `session_id`
  (`launching:<key>:<ts>`) so it satisfies the NOT-NULL/unique session
  constraint without a real transcript. On successful `registerRun` the
  placeholder is deleted (the real run replaces it) and any prior unacked
  failed-start is auto-acknowledged. On `PreflightError` the placeholder is
  converted in place to `failed-start`.
- **Reaper is time-based, not snapshot-based.** A `launching` row older than a
  threshold with no completion is settled to `failed-start`
  ("process exited before registering"). This satisfies the acceptance
  criterion without depending on B's live-process snapshot.
- **Failed-start agents surface as `error` in the main grid (intended,
  interim).** `recordFailedStart` upserts an `agents` row so the failure is
  attributable (key/project). `AgentsService` derives state purely from
  `completed_at`/`exit_code`/transitions (it never reads `status`), so a
  failed-start run (`exit_code=1`) projects as `error` and a `launching`
  placeholder as `initializing` in the main agents grid. That is consistent
  with this ticket's goal — _make init failures visible_ — and strictly better
  than the prior zero-trace behavior. The dedicated "Failed to start" Runner-
  page section + any grid exclusion is CREW-245's job; see followup
  `2026-06-17 — failed-start rows render as plain error agents in the grid`.

## Ruled out / deferred (cross-ticket dependencies)

CREW-244 "Depends on: A" only and runs **parallel** to B (CREW-242, snapshot)
and C (CREW-243, runner registry). Neither B nor C has landed, so two pieces
the plan mentions under Task 7 are deferred to where they actually belong:

- **Per-run startup-log capture in the runner executor.** The plan's
  "capture the spawned crew-command child's stdout/stderr keyed by agentKey"
  lives in `lib/runner/executor.ts`, which CREW-243 owns and rewrites. `crew
run` already tees Claude's stdout/stderr to `runLogPathFor(key)`; the
  _runner-spawned_ child capture is C's territory. Folding it in here would
  conflict with C's executor changes.
- **Snapshot-driven orphan reaping.** "Stuck running with no live process"
  requires B's `RunnerStatusService` snapshot, which is not yet on `main`. The
  time-based `launching` reaper above covers the acceptance criterion; the
  snapshot-aware "running orphan" settle is left to B/C to wire to the
  reaper method this ticket introduces.

## Notes

- `POST /api/runner/launching` (pre-register), `POST /api/runner/failed-start`,
  `POST /api/runs/:key/acknowledge`.
- SSE: `run.failed_start` (`{ key }`) so CREW-245's Runner page can invalidate.
