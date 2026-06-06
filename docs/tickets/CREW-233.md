# CREW-233 — Dashboard polish C: per-worktree APP_URL on the drawer

Jira: https://safturento.atlassian.net/browse/CREW-233

Implements Task 5 (#4) of `docs/superpowers/plans/2026-06-05-dashboard-polish.md`.

## Goal

The agent drawer's app pill must link to the **actual per-worktree port** the agent
runs on, not the static `playwright.app_url` from project config. The CLI already
materializes a deterministic `APP_URL` per worktree (`env.toml` → `.env`); we now
persist it at run registration and surface it from `getByKey`, falling back to
`deriveAppUrl(cfg)` when null so the canonical main stack is unchanged.

## Relevant files

- `packages/daemon/src/migrations/0008_agent_app_url.ts` (NEW) — adds `agents.app_url`.
- `packages/daemon/src/db.ts` — `AgentsTable.app_url`.
- `packages/daemon/src/routes/runs.ts` — `RegisterRunBody.appUrl` + COALESCE upsert.
- `packages/daemon/src/services/AgentsService.ts` — `getByKey` reads stored `app_url`,
  falls back to `deriveAppUrl(cfg)`; the bare `try/catch {}` swallow becomes a pino warn.
- `packages/daemon/src/container.ts` — inject `logger` into `AgentsService`.
- `packages/cli/src/lib/daemon-client/index.ts` — `RegisterRunInput.appUrl`.
- `packages/cli/src/commands/run.ts`, `fix-pr.ts` — pass the materialized `APP_URL`.
- `bruno/endpoints/agents/get-by-key.bru` — assert `app_url` on the detail shape.

## Decisions

- **Path (a): the CLI passes the URL.** The daemon never re-derives the per-worktree
  port from disk — it trusts the CLI to send the materialized `APP_URL` (matches the
  daemon AGENTS.md "trust the CLI" rule).
- **COALESCE on upsert** — `app_url = COALESCE(excluded.app_url, agents.app_url)` so a
  later `fix-pr` registration with a null/absent URL preserves the value from the
  original `run`.
- **`logger` is optional on `AgentsService`** — existing unit tests construct the
  service without one; production wires the pino logger via the DI container.

## Notes

- Migration number confirmed `0008` (last shipped is `0007_finish_steps`). This batch's
  only migration — land without a competing migration-adder (merge note on the ticket).
- Overlaps CREW-234's `AgentsService.deriveState` edit (already merged) — the app_url
  change is isolated to the URL-pill block in `getByKey`, no state-derivation conflict.
