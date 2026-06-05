# CREW-215 — T3: Daemon runner-ops + finish-step intake

Jira: https://safturento.atlassian.net/browse/CREW-215

## Goal

Daemon-side runner-ops + finish-step intake, Task T3 of the dashboard-triggered
agent actions epic (CREW-208):

- A runner heartbeat route + online/offline tracking, emitting `runner.status_changed`
  on the rising/falling edge with a staleness threshold.
- `GET /api/runner/logs?tail=N` tailing the mounted runner log file.
- A `finish_steps` table + `POST /api/agents/:key/finish-step` (store + emit
  `finish_step.changed`) + `GET /api/agents/:key/finish-steps` (ordered).
- The canonical `~/.crew/runner` read-only compose mount.

## Relevant files

- `packages/daemon/src/services/EventBus.ts` — two new SSE variants.
- `packages/daemon/src/services/RunnerStatusService.ts` — heartbeat/staleness/edge tracking.
- `packages/daemon/src/routes/runner.ts` — heartbeat + status + logs.
- `packages/daemon/src/routes/finish-steps.ts` — finish-step POST + GET.
- `packages/daemon/src/migrations/0006_finish_steps.ts` — the table.
- `packages/daemon/src/db.ts` — `FinishStepsTable`.
- `packages/daemon/src/config.ts` — `runnerLogDir` (CREW_RUNNER_LOG_DIR).
- `packages/daemon/src/container.ts`, `app.ts` — wiring + lifecycle.
- `docker-compose.yml`, `.agents/local-dev.md` — runner-log mount.
- `bruno/endpoints/runner/*.bru`, `bruno/endpoints/agents/{post-finish-step,get-finish-steps}.bru`.

## Decisions

- **`GET /api/runner/status` added alongside heartbeat/logs.** T5 (dashboard action
  layer) explicitly seeds `useRunnerStatus()` from `GET /api/runner/status` on mount,
  so the read route ships here in the runner-ops ticket rather than blocking T5.
- **`finish_steps.ts` stores `ts` as INTEGER, not TEXT.** The plan's migration sketch
  said `ts text`, but the shipped shared contract (`finishStepSchema`) sends `ts` as a
  `number`. INTEGER matches the wire type and keeps the `FinishStepEvent.ts: number`
  contract intact end-to-end. Body field `index` maps to the `idx` column (SQLite
  reserves no keyword issue, but `idx` mirrors the plan's column name).
- **Single compose file — no separate worktree override exists.** The repo has one
  `docker-compose.yml`; worktree stacks reuse it with hashed ports (see
  `.agents/local-dev.md`). The existing `~/.crew/startup` mount is shared the same way.
  The runner-log mount is added to the daemon service to mirror that pattern; since all
  stacks share `${HOME}`, they bind the same host `~/.crew/runner` (one runner per host).
  The plan's "worktree override omits it" describes an override mechanism that does not
  exist in code today; the honest implementation mirrors the startup-mount precedent.

## Notes

Falling-edge offline detection uses a periodic staleness check (timer started in the
app's `onReady`, stopped in `onClose`), mirroring `PrPoller`'s lifecycle. The service
takes an injectable `now()` clock so edge/staleness tests are deterministic without
fake timers.
