# CREW-49 — First migration: agents, runs, tool_calls tables

Jira: https://safturento.atlassian.net/browse/CREW-49

## Goal

Author the daemon's first Kysely migration (`0001_agents_runs_tool_calls.ts`),
creating `agents`, `runs`, `tool_calls` per slice-1b spec §3 plus the unique
`uniq_tool_calls_run_event` index that keeps `IngestService`'s
`INSERT OR IGNORE` idempotent across restarts. Update `DaemonDatabase` in
`db.ts` with the table types Kysely needs for typed queries.

## Relevant files

- `packages/daemon/src/migrations/0001_agents_runs_tool_calls.ts` — new
  migration; `up` creates tables + indexes, `down` drops in reverse FK order.
- `packages/daemon/src/migrations/0001_agents_runs_tool_calls.test.ts` — new
  Vitest suite asserting tables + named indexes appear in `sqlite_master`
  after `runMigrations`.
- `packages/daemon/src/db.ts` — replaces the placeholder `DaemonDatabase`
  with `AgentsTable`/`RunsTable`/`ToolCallsTable` interfaces plus the
  composite `DaemonDatabase` mapping. `Generated<number>` for autoincrement
  PKs.

## Plan reference

Task 2 in `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md`
(branch `docs/agents-data-spec`, commit `b8218e3`). Spec §3 in
`docs/superpowers/specs/2026-04-29-agents-data-end-to-end-design.md`.

## Decisions

- **`uniq_tool_calls_run_event` is in this slice, not deferred.** Spec §10
  open question 2 noted the choice; the plan resolved it in favour of
  shipping the index now so `IngestService` can lean on `INSERT OR IGNORE`
  from day one without a follow-up migration.
- **`runs.command` includes `'finish'` already.** Slice 1b doesn't wire
  `crew finish`, but baking the value into the CHECK list now avoids a
  schema migration when finish integration lands later.
- **Ticket title is nullable in the table type.** SQLite stores NULL when
  the CLI passes an empty string and `COALESCE` upserts (added in CREW-50)
  preserve a previously-set title.
- **`runMigrations` filters `.test.ts`/`.test.js` files via a custom
  `readdir`.** Kysely's stock `FileMigrationProvider` dynamic-imports every
  file in the migrations folder; the plan's co-located test file would be
  picked up by both the in-process suite and the tsx-driven prod boot
  (`serve.ts` reads the same directory). Filtering at the provider level
  keeps the plan-specified test layout viable and prevents future
  `0002_*.test.ts` siblings from breaking the daemon's startup migration
  pass.

## Verification

- Migration test green: `npm run test:run --workspace=crew-daemon -- migrations`.
- Daemon suite green + types clean: `npm run test:run --workspace=crew-daemon`
  and `npm run typecheck --workspace=crew-daemon`.
- Full repo: `npm run lint`, `npm run format:check`, `npm run typecheck`,
  `npm run test:run`.

## Out of scope

- Any subsequent migration (slice 1c is expected to add `state_transitions`).
- `IngestService`, route handlers, CLI client — those land in CREW-50+.
