import { join } from 'node:path';
import type { Kysely } from 'kysely';
import { claudeProjectDirFor } from 'crew-shared';
import type { DaemonDatabase } from '../db.js';

/**
 * Resolves the on-disk JSONL transcript for an agent. Picks the latest
 * non-finish run's session id — `crew finish` registers a synthetic id
 * with no JSONL on disk, and finish does not represent the agent's
 * meaningful work (CREW-116). When an agent has only a finish run (edge
 * case — finish always follows at least one `run`), returns null.
 */
export async function resolveJsonlPathForAgent(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
): Promise<string | null> {
  const row = await db
    .selectFrom('runs')
    .innerJoin('agents', 'agents.key', 'runs.agent_key')
    .select(['runs.session_id as sessionId', 'agents.worktree_path as worktreePath'])
    .where('runs.agent_key', '=', agentKey)
    .where('runs.command', 'in', ['run', 'fix-pr'])
    .orderBy('runs.id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!row) return null;
  return join(claudeProjectDirFor(row.worktreePath), `${row.sessionId}.jsonl`);
}
