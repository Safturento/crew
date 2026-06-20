import { sql, type Kysely } from 'kysely';

/**
 * 0013 widens the `action_requests.kind` CHECK to include `resume` (CREW-275).
 *
 * The dashboard's **Resume** button on an idle agent now enqueues a `resume`
 * action so the host runner shells `crew resume <key>` — continuing an
 * interrupted run on its existing worktree — rather than `crew run`, which
 * bounces off the "worktree already exists" preflight.
 *
 * SQLite has no `ALTER TABLE ... ALTER CONSTRAINT`, so we recreate the table
 * with the wider CHECK and copy rows across (the `0005` pattern). The
 * `action_requests_status` index is dropped with the old table and re-created
 * against the new one. PRAGMA foreign_keys is OFF/ON-wrapped per the
 * recommended SQLite table-redefinition recipe.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await sql`
    CREATE TABLE action_requests_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('run', 'fix_pr', 'finish', 'resume')),
      ticket_key TEXT NOT NULL,
      project TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'claimed', 'launching', 'launched', 'failed')),
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `.execute(db);

  await sql`
    INSERT INTO action_requests_new
      (id, kind, ticket_key, project, payload, status, error, created_at, updated_at)
    SELECT id, kind, ticket_key, project, payload, status, error, created_at, updated_at
    FROM action_requests
  `.execute(db);

  await sql`DROP TABLE action_requests`.execute(db);
  await sql`ALTER TABLE action_requests_new RENAME TO action_requests`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS action_requests_status
      ON action_requests (status)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Down recreates the pre-resume CHECK. Any existing resume rows would fail
  // the narrowed constraint, so we drop them first — the migration is
  // irreversible for that data, but the schema rolls back cleanly.
  await sql`PRAGMA foreign_keys = OFF`.execute(db);
  await sql`DELETE FROM action_requests WHERE kind = 'resume'`.execute(db);

  await sql`
    CREATE TABLE action_requests_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('run', 'fix_pr', 'finish')),
      ticket_key TEXT NOT NULL,
      project TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'claimed', 'launching', 'launched', 'failed')),
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `.execute(db);

  await sql`
    INSERT INTO action_requests_new
      (id, kind, ticket_key, project, payload, status, error, created_at, updated_at)
    SELECT id, kind, ticket_key, project, payload, status, error, created_at, updated_at
    FROM action_requests
  `.execute(db);

  await sql`DROP TABLE action_requests`.execute(db);
  await sql`ALTER TABLE action_requests_new RENAME TO action_requests`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS action_requests_status
      ON action_requests (status)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}
