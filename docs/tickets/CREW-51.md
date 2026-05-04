# CREW-51 — AgentsService.list + GET /api/agents

Jira: https://safturento.atlassian.net/browse/CREW-51

## Goal

Implement `AgentsService.list()` (single Kysely query joining `agents` →
latest `runs` row → token aggregates across all the agent's runs, with state
derivation done in TS) and the `GET /api/agents` route. State derivation per
spec §6 — `initializing` / `running` / `pr_open` / `finished` / `error`;
`idle` and `waiting` are deferred (slice 1c+).

## Relevant files

- `packages/daemon/src/services/AgentsService.ts` — new; `list()` returns
  `AgentSummary[]` with TS-side `deriveState` helper.
- `packages/daemon/src/services/AgentsService.test.ts` — new; the seven
  describe cases from the plan (one per state + token aggregation across
  runs + empty list).
- `packages/daemon/src/routes/agents.ts` — new; `GET /api/agents` with Zod
  response schema, resolves `agentsService` from `req.diScope`.
- `packages/daemon/src/routes/agents.test.ts` — new; empty + populated cases
  via `app.inject`.
- `packages/daemon/src/container.ts` — MOD; register `agentsService` as
  `asFunction(...).scoped()`, extend `DaemonCradle`.
- `packages/daemon/src/app.ts` — MOD; `await registerAgentsRoutes(app)`
  after the projects route.
- `bruno/endpoints/agents/get-list.bru` — new; reference card for the new
  route per `bruno-collection-maintenance`.

## Plan reference

Task 4 in `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md`.
Spec §6 in `docs/superpowers/specs/2026-04-29-agents-data-end-to-end-design.md`.
Blocked by CREW-49 (migration); independent of `IngestService` (tests insert
rows directly via Kysely).

## Decisions

- **Token aggregation is the sum of all four token columns
  (`output_tokens` + `input_tokens` + `cache_read_tokens` +
  `cache_creation_tokens`) across every run of the agent**, not just the
  latest run. Matches spec §6 — keeps the dashboard's "tokens" badge a
  cumulative cost figure across resumes/fix-pr loops.
- **`pr_open` looks back across all runs**, not just the latest. A
  `gh pr create` from any earlier `crew run` flips the agent into
  `pr_open` once that run completes successfully — the dashboard then
  shows the PR badge until the agent's state changes again.
- **`prUrl` is omitted (not `null`) when absent.** The Zod response schema
  uses `.optional()`, so JSON serialization drops the field entirely when
  `agents.pr_url` is NULL. Keeps the wire format aligned with the
  `AgentSummary` interface where `prUrl?: string`.
- **`ticketTitle` defaults to empty string when the column is NULL.**
  Aligns with the route schema (`z.string()` non-optional). Spec §3 has the
  column nullable; we coalesce at the service boundary so the API contract
  stays simple.
- **State derivation lives in TypeScript, not SQL.** The query returns the
  raw inputs (`completed_at`, `exit_code`, `latest_has_tool_calls`,
  `has_pr_create`); a pure `deriveState` function in the same module turns
  them into the literal union. Easier to unit-test, easier to extend with
  `idle`/`waiting` in slice 1c.

## Verification

- New service tests green: `npm run test:run --workspace=crew-daemon -- AgentsService`.
- New route tests green: `npm run test:run --workspace=crew-daemon -- routes/agents`.
- Full daemon suite + typecheck:
  `npm run test:run --workspace=crew-daemon` and
  `npm run typecheck --workspace=crew-daemon`.
- Repo-wide: `npm run lint`, `npm run format:check`, `npm run typecheck`,
  `npm run test:run`.

## Out of scope

- `GET /api/agents/:key` (single agent + transcript) — slice 1c.
- Pagination — defer until needed.
- `IngestService` (chokidar/tail-driven JSONL ingest) — CREW-50.
- `POST /api/agents/runs` + `POST .../runs/:runId/complete` — later ticket.
