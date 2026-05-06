import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Logger } from 'pino';

/**
 * 0002 adds the `state_transitions` table — one row per derived state flip
 * for an agent — and backfills it from existing `tool_calls`. Slice 1c only
 * emits init/running/pr_open/error/finished, but the CHECK list is
 * forward-compatible: idle and waiting are included so a later slice can
 * publish them without a follow-up migration.
 *
 * The `up()` signature accepts an optional logger. The migrator framework
 * passes a `Kysely` instance only; tests pass an explicit pino logger to
 * assert log behavior. When run through the framework the per-agent skip
 * warnings are silently dropped, which is acceptable for a one-time
 * migration.
 *
 * State derivation is duplicated from `services/state-derivation.ts` rather
 * than imported. Kysely's `FileMigrationProvider` dynamic-imports the
 * compiled migration via Node's native loader; vite-node's `.js` → `.ts`
 * resolver does not intercept those nested imports, so a `.js`-suffixed
 * relative import here would fail to resolve at test time. Keeping the
 * helper inline in the migration sidesteps that without coupling tests to
 * loader internals. The canonical helper for IngestService (CREW-100) lives
 * in `services/state-derivation.ts` and is re-exported from `AgentsService`.
 */
export async function up(db: Kysely<unknown>, logger?: Logger): Promise<void> {
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

  await backfill(db, logger);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS state_transitions`.execute(db);
}

type TransitionState = 'init' | 'running' | 'pr_open';

interface AgentKeyRow {
  agent_key: string;
}

interface ToolCallRow {
  tool_name: string;
  input_summary: string | null;
  occurred_at: string;
}

interface TransitionRow {
  from_state: TransitionState | null;
  to_state: TransitionState;
  ts: number;
}

async function backfill(db: Kysely<unknown>, logger?: Logger): Promise<void> {
  const agents = await sql<AgentKeyRow>`
    SELECT DISTINCT agent_key FROM runs
  `.execute(db);

  for (const { agent_key } of agents.rows) {
    try {
      await db.transaction().execute(async (trx) => {
        const calls = await sql<ToolCallRow>`
          SELECT tool_calls.tool_name, tool_calls.input_summary, tool_calls.occurred_at
          FROM tool_calls
          INNER JOIN runs ON runs.id = tool_calls.run_id
          WHERE runs.agent_key = ${agent_key}
          ORDER BY tool_calls.occurred_at ASC
        `.execute(trx);

        const rows = computeTransitions(calls.rows);

        for (const row of rows) {
          await sql`
            INSERT INTO state_transitions (agent_key, from_state, to_state, ts)
            VALUES (${agent_key}, ${row.from_state}, ${row.to_state}, ${row.ts})
          `.execute(trx);
        }
      });
    } catch (err) {
      logger?.warn(
        { err, agent_key },
        'state_transitions backfill skipped agent due to per-agent failure',
      );
    }
  }
}

function deriveStateFromToolCallsLocal(
  calls: readonly Pick<ToolCallRow, 'tool_name' | 'input_summary'>[],
): TransitionState {
  if (calls.length === 0) return 'init';
  const hasPrCreate = calls.some(
    (c) => c.tool_name === 'Bash' && (c.input_summary ?? '').startsWith('gh pr create'),
  );
  return hasPrCreate ? 'pr_open' : 'running';
}

function computeTransitions(calls: readonly ToolCallRow[]): TransitionRow[] {
  const rows: TransitionRow[] = [];
  let prev: TransitionState | null = null;

  for (let i = 0; i <= calls.length; i++) {
    const slice = calls.slice(0, i);
    const state = deriveStateFromToolCallsLocal(slice);
    if (state === prev) continue;

    const last = slice.at(-1);
    const ts = last ? parseTs(last.occurred_at) : 0;
    rows.push({ from_state: prev, to_state: state, ts });
    prev = state;
  }
  return rows;
}

function parseTs(occurredAt: string): number {
  const ms = Date.parse(occurredAt);
  if (!Number.isFinite(ms)) {
    throw new Error(`unparseable occurred_at: ${occurredAt}`);
  }
  return ms;
}
