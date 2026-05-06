# CREW-98 — GET /api/agents/:key + /state-history endpoints

Jira: https://safturento.atlassian.net/browse/CREW-98

Plan: [docs/superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md](../superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md)
— this ticket lands plan tasks 8 and 9.

## Goal

Two thin Kysely queries on `AgentsService` exposed as two daemon routes:

- `GET /api/agents/:key` returns the `AgentDetail` shape (key, project,
  ticket fields, state, worktree_path, pr_url, runs[], tokens
  total/input/output/cache_read/cache_creation, tool_call_count). 404
  when no run exists for that key.
- `GET /api/agents/:key/state-history` returns the ordered transitions
  from the `state_transitions` table (introduced in CREW-96), ordered
  ascending by `ts`.

## Relevant files

- `packages/daemon/src/services/AgentsService.ts` — adds `getByKey`
  and `getStateHistory`.
- `packages/daemon/src/services/AgentsService.test.ts` — service-level
  coverage for both queries.
- `packages/daemon/src/routes/agents.ts` — registers the two new GET
  routes with Zod-validated response schemas.
- `packages/daemon/src/routes/agents.test.ts` — route tests covering
  200/404 and an integration-style end-to-end through a seeded DB.
- `bruno/endpoints/agents/get-by-key.bru`,
  `bruno/endpoints/agents/get-state-history.bru` — Bruno reference
  cards for the two new routes.
- `bruno/flows/main-smoke.bru` — extended to exercise the new routes
  off a seeded agent.

## Decisions

- **`tokens` shape.** The detail endpoint exposes a `{ total, input,
  output, cache_read, cache_creation }` breakdown (the spec §5.1
  shape). The list endpoint's flat `tokens: number` stays as is —
  changing it is out of scope here.
- **`tool_call_count` is a single COUNT(*) aggregate** across all of
  the agent's `tool_calls`, joined via `runs.agent_key`. Cheap on
  SQLite and matches what the dashboard displays.
- **404 on detail uses the typed `NotFoundError`** so the central
  error handler renders it. Keeps `reply.send` strictly typed to the
  200 schema, same pattern as `routes/runs.ts`.
- **State-history serializes `from`/`to` as the API field names**
  (the spec calls them `from`/`to`, not `from_state`/`to_state`).
  Internal column names stay the same; the route maps at the edge.
- **`run.id` is serialized as a string** to match the spec §5.1 type
  (`runs: Array<{ id: string; ... }>`).

## Out of scope (handled in sibling tickets)

- `GET /api/agents/:key/timeline` — plan task 10, separate ticket.
- IngestService writing `state_transitions` rows live and publishing
  SSE events — plan tasks 11–13.
- PR URL extraction from `gh pr create` tool_results — plan task 13.

## Notes

- The detail query joins through `runs` and `tool_calls` to derive
  state via the same machinery as `list()`. State derivation reuses
  the `deriveStateFromToolCalls` helper re-exported from
  `AgentsService`.
- State-history reads from the `state_transitions` table directly —
  no derivation. CREW-96 backfilled historical rows; this endpoint
  trusts what's there.
