import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Logger } from 'pino';

/**
 * 0002 adds the `state_transitions` table — one row per derived state flip
 * for an agent. Slice 1c only emits init/running/pr_open/error/finished, but
 * the CHECK list is forward-compatible: idle and waiting are included so a
 * later slice can publish them without a follow-up migration.
 *
 * The `up()` signature accepts an optional logger. The migrator framework
 * passes a `Kysely` instance only; tests pass an explicit pino logger to
 * assert log behavior. When run through the framework the (eventual)
 * backfill warnings are silently dropped, which is acceptable for a
 * one-time migration.
 */
export async function up(db: Kysely<unknown>, _logger?: Logger): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS state_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      from_state TEXT,
      to_state TEXT NOT NULL,
      ts INTEGER NOT NULL,
      CHECK (to_state IN ('init','running','pr_open','error','finished','idle','waiting'))
    )
  `.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS state_transitions_agent_ts ON state_transitions (agent_key, ts)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS state_transitions`.execute(db);
}
