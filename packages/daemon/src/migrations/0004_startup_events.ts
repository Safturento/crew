import { sql, type Kysely } from 'kysely';

/**
 * 0004 adds the `startup_events` table (CREW-201).
 *
 * The CLI writes per-phase startup events to `~/.crew/startup/<key>.jsonl`
 * during `crew run` / `crew fix-pr`; the daemon's chokidar watcher
 * ingests them into this table. `AgentsService.getTimeline` merges
 * per-phase started+terminal pairs into one StartupPhaseRow per phase.
 *
 * UNIQUE(agent_key, subtype, status, ts) makes the ingest dedupe
 * naturally — chokidar may re-fire on the same line during a single
 * append, but the upsert handles it.
 *
 * No foreign key on `agent_key`: startup events arrive BEFORE the
 * agent's run is registered with the daemon (the CLI writes them at
 * preflight time; registration happens after the claude spawn). The
 * column is semantically `agents.key` but enforcement would break the
 * ordering.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS startup_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      subtype TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
      ts INTEGER NOT NULL,
      summary TEXT NOT NULL,
      duration_ms INTEGER,
      log_path TEXT,
      UNIQUE(agent_key, subtype, status, ts)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS startup_events_agent_ts
      ON startup_events (agent_key, ts)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS startup_events_agent_ts`.execute(db);
  await sql`DROP TABLE IF EXISTS startup_events`.execute(db);
}
