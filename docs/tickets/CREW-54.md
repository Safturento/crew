# CREW-54 — Dashboard wiring: HttpDaemonClient + polling, drop Hybrid

Jira: https://safturento.atlassian.net/browse/CREW-54

## Goal

Replace the temporary `HttpProjectsClient` + `HybridDaemonClient` pair from
slice 1a with a single `HttpDaemonClient` implementing both `listProjects()`
and `listAgents()` against the daemon's HTTP API (each method Zod-validates
its response). `App.tsx`'s `defaultClient` becomes `new HttpDaemonClient()`,
and both `useQuery` calls gain `refetchInterval: 2000` so the dashboard
polls every 2s. SSE / live push is slice 1c.

## Relevant files

- `packages/dashboard/src/data/HttpDaemonClient.ts` — new; implements both
  methods of `DaemonClient` with per-endpoint Zod schemas. Throws on
  non-2xx and on schema mismatch.
- `packages/dashboard/src/data/HttpDaemonClient.test.ts` — new; six cases
  (3 per method: happy path, non-2xx, schema mismatch).
- `packages/dashboard/src/App.tsx` — MOD; `defaultClient` now
  `new HttpDaemonClient()`; both queries get `refetchInterval: 2000`.
- `packages/dashboard/src/App.test.tsx` — MOD; drops the now-unused
  `globalThis.fetch` spy + `FIXTURE_PROJECTS` import — `MockDaemonClient`
  is injected directly, no HTTP layer to mock.
- `packages/dashboard/src/data/HttpProjectsClient.{ts,test.ts}` — DELETED.
- `packages/dashboard/src/data/HybridDaemonClient.{ts,test.ts}` — DELETED.

## Plan reference

Task 8 in `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md`.
Blocked by the `GET /api/agents` ticket (CREW-51) for a real endpoint to
fetch from. Independent of the runs-endpoints + CLI integration tickets.

## Decisions

- **`AgentSchema.state` enum mirrors the full `AgentState` union from
  `data/types.ts`** (`initializing` | `running` | `idle` | `waiting` |
  `pr_open` | `error` | `finished`), not just the five states the daemon
  derives today. Slice 1c will start emitting `idle` and `waiting`; the
  schema accepting them now means no follow-up wire-format change is
  needed when the daemon side ships.
- **No manual refresh button.** `refetchInterval: 2000` is enough for the
  personal-tool scope. `query.refetch()` is one line if we ever decide to
  surface a manual refresh later.

## Verification

- New client tests:
  `npm run test:run --workspace=crew-dashboard -- HttpDaemonClient`.
- Full dashboard suite + typecheck:
  `npm run test:run --workspace=crew-dashboard` and
  `npm run typecheck --workspace=crew-dashboard`.
- Repo-wide: `npm run lint`, `npm run typecheck`, `npm run test:run`.

## Out of scope

- SSE subscription / live push — slice 1c.
- Manual refresh button.
