import { sql, type Kysely } from 'kysely';

/**
 * 0006 adds the `action_requests` table (CREW-214 / Epic CREW-208).
 *
 * The dashboard enqueues an action (`run` / `fix_pr` / `finish`) here; the
 * daemon exposes it over HTTP and a host-side runner long-polls, claims a
 * pending row, shells the matching CLI verb, and reports the launch status
 * back. The `status` column walks the lifecycle
 * `pending → claimed → launching → launched | failed`, and each transition
 * publishes an `action.changed` SSE event from `ActionService`.
 *
 * `payload` is the per-kind JSON envelope (e.g. the `fix_pr` review comment);
 * it defaults to `'{}'` so a `run`/`finish` row needs no explicit payload.
 * The CHECK constraints mirror the `ACTION_KINDS` / `ACTION_STATUSES` tuples
 * in `crew-shared` — keep them in sync if the contract grows.
 *
 * No foreign key on `ticket_key`/`project`: a request can be enqueued for a
 * ticket the daemon has never seen an agent for (that's the whole point —
 * the runner is what brings the agent into being).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS action_requests (
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
    CREATE INDEX IF NOT EXISTS action_requests_status
      ON action_requests (status)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS action_requests_status`.execute(db);
  await sql`DROP TABLE IF EXISTS action_requests`.execute(db);
}
