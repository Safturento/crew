import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { DaemonDatabase } from '../db.js';

export type AgentState = 'initializing' | 'running' | 'pr_open' | 'error' | 'finished';

export interface AgentSummary {
  key: string;
  projectName: string;
  ticketTitle: string;
  state: AgentState;
  startedAt: string;
  tokens: number;
  prUrl?: string;
}

export interface AgentsServiceDeps {
  db: Kysely<DaemonDatabase>;
}

export class AgentsService {
  private readonly db: Kysely<DaemonDatabase>;

  constructor(deps: AgentsServiceDeps) {
    this.db = deps.db;
  }

  async list(): Promise<AgentSummary[]> {
    // One row per agent. The `latest` join uses a correlated subquery to
    // pick the agent's highest run id (autoincrement → newest). The
    // `totals` join aggregates token columns and computes two boolean
    // flags across ALL of the agent's runs: whether any tool_call ever
    // matched `gh pr create` (drives `pr_open`), and whether the LATEST
    // run has any tool_calls (distinguishes `initializing` from `running`
    // for an open run).
    const rows = await this.db
      .selectFrom('agents as a')
      .leftJoin(
        this.db
          .selectFrom('runs as r')
          .selectAll()
          .where(
            'r.id',
            '=',
            sql<number>`(SELECT id FROM runs r2 WHERE r2.agent_key = r.agent_key ORDER BY r2.id DESC LIMIT 1)`,
          )
          .as('latest'),
        (join) => join.onRef('latest.agent_key', '=', 'a.key'),
      )
      .leftJoin(
        this.db
          .selectFrom('tool_calls as tc')
          .innerJoin('runs as r', 'r.id', 'tc.run_id')
          .select([
            'r.agent_key as agent_key',
            sql<number>`COALESCE(SUM(tc.output_tokens), 0) + COALESCE(SUM(tc.input_tokens), 0) + COALESCE(SUM(tc.cache_read_tokens), 0) + COALESCE(SUM(tc.cache_creation_tokens), 0)`.as(
              'tokens',
            ),
            sql<number>`MAX(CASE WHEN tc.tool_name = 'Bash' AND tc.input_summary LIKE 'gh pr create%' THEN 1 ELSE 0 END)`.as(
              'has_pr_create',
            ),
            sql<number>`MAX(CASE WHEN tc.run_id = (SELECT id FROM runs r3 WHERE r3.agent_key = r.agent_key ORDER BY r3.id DESC LIMIT 1) THEN 1 ELSE 0 END)`.as(
              'latest_has_tool_calls',
            ),
          ])
          .groupBy('r.agent_key')
          .as('totals'),
        (join) => join.onRef('totals.agent_key', '=', 'a.key'),
      )
      .select([
        'a.key',
        'a.project_name as projectName',
        'a.ticket_title as ticketTitle',
        'a.pr_url as prUrl',
        'latest.started_at as startedAt',
        'latest.completed_at as completedAt',
        'latest.exit_code as exitCode',
        'totals.tokens',
        'totals.has_pr_create',
        'totals.latest_has_tool_calls',
      ])
      .orderBy('a.key', 'asc')
      .execute();

    return rows.map((row) => {
      const tokens = row.tokens ?? 0;
      const state = deriveState({
        completedAt: row.completedAt,
        exitCode: row.exitCode,
        latestHasToolCalls: Boolean(row.latest_has_tool_calls),
        hasPrCreate: Boolean(row.has_pr_create),
      });
      const summary: AgentSummary = {
        key: row.key,
        projectName: row.projectName,
        ticketTitle: row.ticketTitle ?? '',
        state,
        startedAt: row.startedAt ?? '',
        tokens,
      };
      if (row.prUrl) summary.prUrl = row.prUrl;
      return summary;
    });
  }
}

interface DeriveStateInput {
  completedAt: string | null;
  exitCode: number | null;
  latestHasToolCalls: boolean;
  hasPrCreate: boolean;
}

function deriveState(input: DeriveStateInput): AgentState {
  if (input.completedAt === null) {
    return input.latestHasToolCalls ? 'running' : 'initializing';
  }
  if (input.exitCode !== null && input.exitCode !== 0) return 'error';
  if (input.hasPrCreate) return 'pr_open';
  return 'finished';
}
