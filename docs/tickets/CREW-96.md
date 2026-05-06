# CREW-96 — state_transitions table + idempotent backfill (migration 0002)

Jira: https://safturento.atlassian.net/browse/CREW-96

## Goal

Add migration 0002 creating `state_transitions(agent_key, from_state, to_state, ts)` plus
an `(agent_key, ts)` index, with a forward-compatible CHECK list
(`init`, `running`, `pr_open`, `error`, `finished`, `idle`, `waiting`). Backfill
walks every existing agent's `tool_calls` once, derives state per accumulating
slice, and inserts one row per state flip. Per-agent transactions: a single
agent's failure logs and skips, never rolls back the migration.

## Relevant files

- `packages/daemon/src/migrations/0002_state_transitions.ts` — new; schema +
  backfill in `up()`.
- `packages/daemon/src/migrations/0002_state_transitions.test.ts` — new; schema
  shape, idempotency, and backfill trail assertions.
- `packages/daemon/src/services/AgentsService.ts` — exports
  `deriveStateFromToolCalls` so the backfill (and CREW-100's IngestService) can
  share a single state-derivation helper.

## Decisions

- **`init` (transitions table) ≠ `initializing` (AgentsService.list state).** The
  CHECK list in the spec/plan uses `init`; existing `AgentsService.AgentState`
  uses `initializing` for its UI label. Renaming the union cascades into ingest,
  dashboard, and tests (CREW-100's territory). Keep the divergence: the new
  `deriveStateFromToolCalls` helper returns `init | running | pr_open` — the
  vocabulary of the transitions table — and `AgentsService.list` is left alone.
- **Raw SQL for the schema.** The plan's test inspects `sqlite_master.sql` with
  regexes (`agent_key TEXT NOT NULL`, etc.); the easiest way to keep that shape
  predictable is to issue the `CREATE TABLE` as raw `sql\`...\``. Kysely's
  schema builder would emit different formatting and force the test to be
  rewritten.
- **`ts INTEGER` even though `runs.started_at` / `tool_calls.occurred_at` are
  `TEXT`.** The plan's CHECK / index design and the spec's transitions table
  treat `ts` as an integer epoch-ms. The backfill stores `Date.parse(occurred_at)`.
- **Backfill idempotency = "rerun on clean DB doesn't throw".** Plan's
  idempotency test exercises the `IF NOT EXISTS` guard only (no agents seeded).
  The migrator framework already prevents double-runs via its own bookkeeping
  table; deeper idempotency (skip agents already backfilled) is unnecessary for
  this slice and would complicate the per-agent transaction shape.
- **Per-agent failure → log+skip, no rethrow.** The Kysely `transaction().execute(...)`
  call is wrapped in `.catch(err => logger.warn(...))`; the loop continues with
  the next agent.

## Notes

Plan tasks 3–4 of `docs/superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md`.
CREW-100 (IngestService writes to state_transitions) and CREW-98 (state-history
endpoint) consume this migration; both are blocked by CREW-96.
