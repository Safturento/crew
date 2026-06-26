import { sql, type Kysely } from 'kysely';

/**
 * 0014 widens the `runner_commands.kind` CHECK to include the supervisor-level
 * commands `supervisor_stop` and `supervisor_restart` (CREW-293).
 *
 * These are queue-level commands (null `agent_key`) the host worker drains and
 * applies to the supervisor process itself: stop = graceful exit, restart =
 * exit-and-respawn via the runner's self-respawn loop. Unlike the per-process
 * cancel/pause kinds, they don't target a tracked process.
 *
 * SQLite has no `ALTER TABLE ... ALTER CONSTRAINT`, so we recreate the table
 * with the wider CHECK and copy rows across (the 0013 pattern). The
 * `runner_commands_status` index is dropped with the old table and re-created
 * against the new one. PRAGMA foreign_keys is OFF/ON-wrapped per the
 * recommended SQLite table-redefinition recipe.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await sql`
    CREATE TABLE runner_commands_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT,
      kind TEXT NOT NULL CHECK (
        kind IN (
          'cancel_soft', 'cancel_hard', 'dequeue', 'reap', 'pause', 'resume',
          'message', 'supervisor_stop', 'supervisor_restart'
        )
      ),
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'claimed', 'applied', 'failed')),
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `.execute(db);

  await sql`
    INSERT INTO runner_commands_new
      (id, agent_key, kind, payload, status, error, created_at, updated_at)
    SELECT id, agent_key, kind, payload, status, error, created_at, updated_at
    FROM runner_commands
  `.execute(db);

  await sql`DROP TABLE runner_commands`.execute(db);
  await sql`ALTER TABLE runner_commands_new RENAME TO runner_commands`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS runner_commands_status
      ON runner_commands (status)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Down recreates the pre-supervisor CHECK. Any existing supervisor_* rows
  // would fail the narrowed constraint, so we drop them first — irreversible
  // for that data, but the schema rolls back cleanly.
  await sql`PRAGMA foreign_keys = OFF`.execute(db);
  await sql`
    DELETE FROM runner_commands WHERE kind IN ('supervisor_stop', 'supervisor_restart')
  `.execute(db);

  await sql`
    CREATE TABLE runner_commands_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT,
      kind TEXT NOT NULL CHECK (
        kind IN ('cancel_soft', 'cancel_hard', 'dequeue', 'reap', 'pause', 'resume', 'message')
      ),
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'claimed', 'applied', 'failed')),
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `.execute(db);

  await sql`
    INSERT INTO runner_commands_new
      (id, agent_key, kind, payload, status, error, created_at, updated_at)
    SELECT id, agent_key, kind, payload, status, error, created_at, updated_at
    FROM runner_commands
  `.execute(db);

  await sql`DROP TABLE runner_commands`.execute(db);
  await sql`ALTER TABLE runner_commands_new RENAME TO runner_commands`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS runner_commands_status
      ON runner_commands (status)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}
