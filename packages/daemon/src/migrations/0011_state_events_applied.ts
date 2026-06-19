import { sql, type Kysely } from 'kysely';

/**
 * 0011 — dedup ledger for the concrete state-events log (CREW-254 / Epic
 * CREW-252, Concrete State Triggers).
 *
 * The daemon tails each `~/.crew/state-events/<key>.jsonl` and re-reads it from
 * offset 0 on restart. Recording every applied `eventId` here makes the reduce
 * exactly-once: a replayed line whose `event_id` already exists is a no-op, so
 * no duplicate `state_transitions` row is written across the restart window.
 *
 * `event_id` is the client-generated uuid from the `StateEvent` contract;
 * `agent_key` + `ts` (epoch-ms) are carried for observability only.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS state_events_applied (
      event_id  TEXT PRIMARY KEY,
      agent_key TEXT NOT NULL,
      ts        INTEGER NOT NULL
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS state_events_applied`.execute(db);
}
