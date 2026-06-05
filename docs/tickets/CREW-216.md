# CREW-216 — T4: Runner process + crew runner/up/down lifecycle

Jira: https://safturento.atlassian.net/browse/CREW-216

## Goal

Host-side runner process that long-polls the daemon action queue, claims an
action, `cd`s into the target project repo, shells the matching CLI verb
(`run` / `gh pr comment` then `fix-pr --from-pr` / `finish`), reports launch
status, and heartbeats. Plus `crew runner start|stop|restart|status|logs`
(daemonized, PID file, auto-restart on crash) and `crew up`/`down` convenience
wrappers. Plain `docker compose up` stays standalone.

Implements **Task T4** of `docs/superpowers/plans/2026-06-03-dashboard-agent-actions.md`.

## Relevant files

- `packages/cli/src/lib/daemon-client/index.ts` — add `claimPendingAction`, `reportActionResult`, `heartbeat`.
- `packages/cli/src/lib/runner/executor.ts` — pure `ActionRequest` → execution mapping.
- `packages/cli/src/lib/runner/loop.ts` — poll → claim → report(launching) → execute → report(launched|failed); heartbeat interval; log lines.
- `packages/cli/src/lib/runner/supervisor.ts` — detached spawn + PID file + crash-respawn lifecycle.
- `packages/cli/src/commands/runner.ts` — `crew runner start|stop|restart|status|logs`.
- `packages/cli/src/commands/up.ts`, `down.ts` — compose + runner orchestration.
- `packages/cli/src/index.ts` — register the three commands.

## Decisions

- **No new HTTP routes / Bruno endpoints.** T4 only *consumes* the T2/T3 routes
  (`/api/actions/pending`, `/api/actions/:id/result`, `/api/runner/heartbeat`).
  CLI-only; no dashboard/UI surface, so no visual-fidelity work.
- **daemon-client never-throws convention.** New methods return
  `DaemonResult<T>` (`{ ok: false, reason }` on failure), discriminated by an
  `in`-check like the existing `listAgents` caller idiom.
- **repoDir resolution.** `executor` resolves the target repo from the action's
  `project` slug via `loadProjectConfigByName(project).repo_path`.
- **Supervisor shape.** `crew runner start` writes a small wrapper loop that
  re-spawns the long-poll worker on non-zero exit (crash-respawn), detached and
  unref'd, PID file at `~/.config/crew/runner.pid`, stdout/stderr → `~/.crew/runner/runner.log`.

## Notes

Blocked by T2 (CREW-214, merged) + T3 (CREW-215, merged). Contracts in
`crew-shared` (`ActionRequest`, `ActionKind`, `ActionStatus`, `ActionPayload`).
