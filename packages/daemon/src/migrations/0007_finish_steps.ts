import { sql, type Kysely } from 'kysely';

/**
 * 0006 adds the `finish_steps` table (CREW-215).
 *
 * `crew finish` POSTs one row per step to `/api/agents/:key/finish-step`;
 * the daemon stores it and pings `finish_step.changed`, and the dashboard
 * drawer renders the ordered rows as a live checklist.
 *
 * `idx` is the step ordinal within a finish run (the wire field is
 * `index`). `ts` is epoch-ms — stored INTEGER to match the shared
 * `FinishStepEvent.ts: number` contract (the plan's sketch said TEXT, but
 * the shipped `finishStepSchema` sends a number; INTEGER keeps the type
 * intact end-to-end). No FK on `agent_key`: like `startup_events`, finish
 * steps can be reported for an agent the daemon hasn't otherwise indexed,
 * and the route layer doesn't gate on agent existence.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS finish_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      idx INTEGER NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ok', 'skip', 'error')),
      detail TEXT,
      ts INTEGER NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS finish_steps_agent_key
      ON finish_steps (agent_key, id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS finish_steps_agent_key`.execute(db);
  await sql`DROP TABLE IF EXISTS finish_steps`.execute(db);
}
