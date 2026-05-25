import { sql, type Kysely } from 'kysely';

/**
 * 0005 adds `pr_merged` to the state_transitions CHECK constraint (CREW-202).
 *
 * SQLite has no `ALTER TABLE ... ALTER CONSTRAINT`, so we recreate the table
 * with the wider CHECK and copy rows across. The `(agent_key, ts)` index is
 * dropped with the old table and re-created against the new one.
 *
 * PRAGMA foreign_keys is OFF/ON-wrapped to avoid the recreate hitting any
 * downstream FK on the temp table. The 0001 schema doesn't enforce an FK
 * from state_transitions, but the wrapper costs nothing and matches the
 * recommended SQLite pattern for table redefinition.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await sql`
    CREATE TABLE state_transitions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      from_state TEXT
        CHECK (from_state IN ('init','running','pr_open','pr_merged','error','finished','idle','waiting')),
      to_state TEXT NOT NULL
        CHECK (to_state IN ('init','running','pr_open','pr_merged','error','finished','idle','waiting')),
      ts INTEGER NOT NULL
    )
  `.execute(db);

  await sql`
    INSERT INTO state_transitions_new (id, agent_key, from_state, to_state, ts)
    SELECT id, agent_key, from_state, to_state, ts FROM state_transitions
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
  // Down recreates the pre-pr_merged CHECK. Any existing pr_merged rows
  // would fail the narrowed constraint, so we drop them first — the
  // migration is irreversible for data, but the schema rolls back cleanly.
  await sql`PRAGMA foreign_keys = OFF`.execute(db);
  await sql`
    DELETE FROM state_transitions
    WHERE to_state = 'pr_merged' OR from_state = 'pr_merged'
  `.execute(db);

  await sql`
    CREATE TABLE state_transitions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      from_state TEXT
        CHECK (from_state IN ('init','running','pr_open','error','finished','idle','waiting')),
      to_state TEXT NOT NULL
        CHECK (to_state IN ('init','running','pr_open','error','finished','idle','waiting')),
      ts INTEGER NOT NULL
    )
  `.execute(db);

  await sql`
    INSERT INTO state_transitions_new (id, agent_key, from_state, to_state, ts)
    SELECT id, agent_key, from_state, to_state, ts FROM state_transitions
  `.execute(db);

  await sql`DROP TABLE state_transitions`.execute(db);
  await sql`ALTER TABLE state_transitions_new RENAME TO state_transitions`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS state_transitions_agent_ts
      ON state_transitions (agent_key, ts)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}
