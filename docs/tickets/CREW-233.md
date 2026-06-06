# CREW-233 — Dashboard polish C: per-worktree APP_URL on the drawer

Jira: https://safturento.atlassian.net/browse/CREW-233

Implements Task 5 (#4) of the Dashboard polish batch (Epic CREW-230), per
`docs/superpowers/plans/2026-06-05-dashboard-polish.md`.

## Goal

A worktree agent's drawer app pill links to that agent's *actual* running app
(the per-worktree port), not the static config port. Null falls back to the
static config; the canonical main stack is unchanged. A config-load failure is
logged, not swallowed.

## Relevant files

- `packages/daemon/src/migrations/0008_agent_app_url.ts` — adds the nullable
  `agents.app_url` column.
- `packages/daemon/src/db.ts` — `AgentsTable.app_url` (`Generated` — implicit
  NULL default, optional on insert).
- `packages/daemon/src/routes/runs.ts` — `RegisterRunBody.appUrl` + upsert that
  COALESCEs so a later `fix-pr` register can't wipe the stored value.
- `packages/daemon/src/services/AgentsService.ts` — `getByKey` returns the
  stored `app_url`, falling back to `deriveAppUrl(cfg)` only when null; the bare
  `try/catch {}` around the project-config load is now a `logger.warn`.
- `packages/daemon/src/container.ts` — injects the pino logger into
  `AgentsService`.
- `packages/cli/src/lib/daemon-client/index.ts` — `RegisterRunInput.appUrl`.
- `packages/cli/src/commands/run.ts` — captures the materialized `APP_URL`
  (env-spec or legacy path) and passes it at registerRun.
- `packages/cli/src/commands/fix-pr.ts` — re-sends the worktree `.env` `APP_URL`.
- `bruno/endpoints/agents/post-register-run.bru` + `get-by-key.bru` — coverage.

## Decisions

- **Path (a): CLI passes it.** The daemon never reads the worktree disk for
  what the CLI can send (per `packages/daemon/AGENTS.md`). The CLI already
  materializes `APP_URL`, so it sends it at registration.
- **`Generated<string | null>` for the column** rather than a required field —
  the column has an implicit NULL default, so this keeps it optional on insert
  and avoids churning ~25 existing `insertInto('agents')` sites.
- **COALESCE on the upsert** mirrors the existing `ticket_title` preservation:
  a `fix-pr` register that omits `appUrl` preserves the value the original
  `crew run` stored.

## Notes

The dashboard already renders `AgentDetail.app_url` as the drawer app pill
(CREW-178); no dashboard code change was needed — this ticket only changes the
data the daemon serves. Observable end-to-end via the drawer pill.
