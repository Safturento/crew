import { sql, type Kysely } from 'kysely';

/**
 * 0015 adds `queued` + `orphaned` to the state_transitions CHECK constraint
 * (CREW-307, runner-page rework spine).
 *
 * The runner rework introduces two new lifecycle states: `queued` (enqueued but
 * not yet launched — the dashboard birth path) and `orphaned` (DB says running
 * but no live process). Both are written as `state_transitions.to_state`, which
 * carries a hard CHECK constraint (last recreated by 0005). SQLite has no
 * `ALTER TABLE ... ALTER CONSTRAINT`, so — as with 0005/0013 — we recreate the
 * table with the wider CHECK and copy rows across.
 *
 * Unlike 0005 the live table now carries the `source` column (added by 0012 via
 * `ALTER TABLE ADD COLUMN`), so the recreate must preserve it. The
 * `(agent_key, ts)` index is dropped with the old table and re-created.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await sql`
    CREATE TABLE state_transitions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      from_state TEXT
        CHECK (from_state IN ('init','queued','running','pr_open','pr_merged','error','orphaned','finished','idle','waiting')),
      to_state TEXT NOT NULL
        CHECK (to_state IN ('init','queued','running','pr_open','pr_merged','error','orphaned','finished','idle','waiting')),
      ts INTEGER NOT NULL,
      source TEXT
    )
  `.execute(db);

  await sql`
    INSERT INTO state_transitions_new (id, agent_key, from_state, to_state, ts, source)
    SELECT id, agent_key, from_state, to_state, ts, source FROM state_transitions
  `.execute(db);

  await sql`DROP TABLE state_transitions`.execute(db);
  await sql`ALTER TABLE state_transitions_new RENAME TO state_transitions`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS state_transitions_agent_ts
      ON state_transitions (agent_key, ts)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Down recreates the pre-CREW-307 CHECK. Any existing queued/orphaned rows
  // would fail the narrowed constraint, so we drop them first — the migration
  // is irreversible for data, but the schema rolls back cleanly.
  await sql`PRAGMA foreign_keys = OFF`.execute(db);
  await sql`
    DELETE FROM state_transitions
    WHERE to_state IN ('queued','orphaned') OR from_state IN ('queued','orphaned')
  `.execute(db);

  await sql`
    CREATE TABLE state_transitions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      from_state TEXT
        CHECK (from_state IN ('init','running','pr_open','pr_merged','error','finished','idle','waiting')),
      to_state TEXT NOT NULL
        CHECK (to_state IN ('init','running','pr_open','pr_merged','error','finished','idle','waiting')),
      ts INTEGER NOT NULL,
      source TEXT
    )
  `.execute(db);

  await sql`
    INSERT INTO state_transitions_new (id, agent_key, from_state, to_state, ts, source)
    SELECT id, agent_key, from_state, to_state, ts, source FROM state_transitions
  `.execute(db);

  await sql`DROP TABLE state_transitions`.execute(db);
  await sql`ALTER TABLE state_transitions_new RENAME TO state_transitions`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS state_transitions_agent_ts
      ON state_transitions (agent_key, ts)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}
