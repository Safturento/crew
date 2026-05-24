import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { deriveAppUrl, deriveJiraUrl, loadProjectConfigByName } from 'crew-shared';
import type { DaemonDatabase } from '../db.js';
import type { TimelineService } from './TimelineService.js';

/** Synthetic tool-row label for the model's own output tokens (CREW-191). */
const ASSISTANT_TOOL_LABEL = 'Assistant';

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

export interface AgentDetailRun {
  id: string;
  command: 'run' | 'fix-pr' | 'finish';
  started_at: string;
  completed_at: string | null;
  // Layer-1 metrics (CREW-164) — null until the run is measured on completion.
  doc_load_coverage_pct: number | null;
  cleanliness_pass: number | null;
  pr_claim_input_tokens: number | null;
  parity_violations: number | null;
}

export interface AgentDetailTokens {
  total: number;
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export interface AgentDetailTokensByTool {
  tool: string;
  tokens: number;
  /** Share of the agent's total tool-call tokens, 0–100, rounded to 0.01. */
  percent: number;
}

export interface AgentDetail {
  key: string;
  project: string;
  ticket_key: string;
  ticket_title: string | null;
  state: AgentState;
  worktree_path: string;
  pr_url: string | null;
  /** Browsable app URL (playwright.app_url, falling back to bruno_smoke.base_url). Null when neither is configured. */
  app_url: string | null;
  /** `<jira.site>/browse/<ticket_key>`. Null when ticket key is empty. */
  jira_url: string | null;
  /** Per-tool token aggregate across all of the agent's runs, ordered by tokens desc. */
  tokens_by_tool: AgentDetailTokensByTool[];
  runs: AgentDetailRun[];
  tokens: AgentDetailTokens;
  tool_call_count: number;
}

export type StateTransitionState =
  | 'init'
  | 'running'
  | 'pr_open'
  | 'error'
  | 'finished'
  | 'idle'
  | 'waiting';

export interface StateHistoryTransition {
  from: StateTransitionState | null;
  to: StateTransitionState;
  ts: number;
}

export interface StateHistoryResponse {
  transitions: StateHistoryTransition[];
}

export interface AgentsServiceDeps {
  db: Kysely<DaemonDatabase>;
  /**
   * Absolute path to per-project TOML configs. `getByKey` reads
   * `<projectsDir>/<projectName>.toml` to resolve `app_url` + `jira_url`
   * for `AgentDetail`. Optional so unit tests that only exercise `list`
   * or `countByProject` don't need to materialise a directory.
   * `loadProjectConfigByName`'s loader-default kicks in when omitted.
   */
  projectsDir?: string;
  /**
   * Optional transcript reader. When provided, `getByKey` re-parses the
   * agent's JSONL and prepends an "Assistant" row to `tokens_by_tool`
   * summing `usage.output_tokens` across every assistant event (CREW-191).
   * Omitted in tests that only exercise the DB-backed shape; production
   * wires the cradle's `timelineService`.
   */
  timelineService?: TimelineService;
}

export class AgentsService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly projectsDir: string | undefined;
  private readonly timelineService: TimelineService | undefined;

  constructor(deps: AgentsServiceDeps) {
    this.db = deps.db;
    this.projectsDir = deps.projectsDir;
    this.timelineService = deps.timelineService;
  }

  async list(): Promise<AgentSummary[]> {
    // One row per agent. The `latest` join uses a correlated subquery to
    // pick the agent's highest run id among non-finish runs (autoincrement
    // → newest), so a `crew finish` run does not poison the latest-run
    // signal that drives state derivation. `totals` aggregates token
    // columns and computes two boolean flags across ALL of the agent's
    // runs: whether any tool_call ever matched `gh pr create` (drives
    // `pr_open`), and whether the LATEST non-finish run has any tool_calls
    // (distinguishes `initializing` from `running` for an open run).
    // `finish_status.has_finish_completed_ok` rolls up whether any finish
    // run has completed cleanly — that's the signal that an agent is
    // `finished`.
    const rows = await this.db
      .selectFrom('agents as a')
      .leftJoin(
        this.db
          .selectFrom('runs as r')
          .selectAll()
          .where(
            'r.id',
            '=',
            sql<number>`(SELECT id FROM runs r2 WHERE r2.agent_key = r.agent_key AND r2.command IN ('run', 'fix-pr') ORDER BY r2.id DESC LIMIT 1)`,
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
            sql<number>`MAX(CASE WHEN tc.run_id = (SELECT id FROM runs r3 WHERE r3.agent_key = r.agent_key AND r3.command IN ('run', 'fix-pr') ORDER BY r3.id DESC LIMIT 1) THEN 1 ELSE 0 END)`.as(
              'latest_has_tool_calls',
            ),
          ])
          .groupBy('r.agent_key')
          .as('totals'),
        (join) => join.onRef('totals.agent_key', '=', 'a.key'),
      )
      .leftJoin(
        this.db
          .selectFrom('runs as r')
          .select([
            'r.agent_key as agent_key',
            sql<number>`MAX(CASE WHEN r.command = 'finish' AND r.completed_at IS NOT NULL AND r.exit_code = 0 THEN 1 ELSE 0 END)`.as(
              'has_finish_completed_ok',
            ),
          ])
          .groupBy('r.agent_key')
          .as('finish_status'),
        (join) => join.onRef('finish_status.agent_key', '=', 'a.key'),
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
        'finish_status.has_finish_completed_ok',
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
        finishCompletedOk: Boolean(row.has_finish_completed_ok),
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

  /**
   * Single-agent detail. Returns null when no run exists for the key
   * (an agents row alone is not enough — a run is the signal that the
   * agent actually started). State derivation reuses the same machinery
   * as `list()`: latest run's completion + cross-run `gh pr create`
   * detection. The caller renders 404 on null.
   */
  async getByKey(key: string): Promise<AgentDetail | null> {
    const runRows = await this.db
      .selectFrom('runs')
      .select([
        'id',
        'agent_key',
        'command',
        'started_at',
        'completed_at',
        'exit_code',
        'doc_load_coverage_pct',
        'cleanliness_pass',
        'pr_claim_input_tokens',
        'parity_violations',
      ])
      .where('agent_key', '=', key)
      .orderBy('id', 'asc')
      .execute();

    if (runRows.length === 0) return null;

    const agent = await this.db
      .selectFrom('agents')
      .select(['key', 'project_name', 'ticket_title', 'worktree_path', 'pr_url'])
      .where('key', '=', key)
      .executeTakeFirst();

    // The runs row exists, so there should always be an agents row too —
    // but defend against an inconsistent DB rather than crashing the
    // request. An empty record is preferable to a 500.
    const project = agent?.project_name ?? '';
    const worktreePath = agent?.worktree_path ?? '';
    const ticketTitle = agent?.ticket_title ?? null;
    const prUrl = agent?.pr_url ?? null;

    const totals = await this.db
      .selectFrom('tool_calls as tc')
      .innerJoin('runs as r', 'r.id', 'tc.run_id')
      .select([
        sql<number>`COALESCE(SUM(tc.output_tokens), 0)`.as('output'),
        sql<number>`COALESCE(SUM(tc.input_tokens), 0)`.as('input'),
        sql<number>`COALESCE(SUM(tc.cache_read_tokens), 0)`.as('cache_read'),
        sql<number>`COALESCE(SUM(tc.cache_creation_tokens), 0)`.as('cache_creation'),
        sql<number>`COUNT(*)`.as('tool_call_count'),
        sql<number>`MAX(CASE WHEN tc.tool_name = 'Bash' AND tc.input_summary LIKE 'gh pr create%' THEN 1 ELSE 0 END)`.as(
          'has_pr_create',
        ),
      ])
      .where('r.agent_key', '=', key)
      .executeTakeFirst();

    const output = totals?.output ?? 0;
    const input = totals?.input ?? 0;
    const cacheRead = totals?.cache_read ?? 0;
    const cacheCreation = totals?.cache_creation ?? 0;
    const toolCallCount = totals?.tool_call_count ?? 0;
    const hasPrCreate = Boolean(totals?.has_pr_create);

    // Pick the latest non-finish run for state derivation: a `crew finish`
    // run does not represent the meaningful work of the agent, so it must
    // not feed `completedAt`/`exitCode`/`latestHasToolCalls`. Whether
    // finish itself completed ok is handled separately below.
    const meaningfulRuns = runRows.filter((r) => r.command !== 'finish');
    const latest = meaningfulRuns[meaningfulRuns.length - 1] ?? runRows[runRows.length - 1];
    const latestHasToolCalls = await this.db
      .selectFrom('tool_calls')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('run_id', '=', latest.id)
      .executeTakeFirst();
    const finishCompletedOk = runRows.some(
      (r) => r.command === 'finish' && r.completed_at !== null && r.exit_code === 0,
    );

    const state = deriveState({
      completedAt: latest.completed_at,
      exitCode: latest.exit_code,
      latestHasToolCalls: (latestHasToolCalls?.n ?? 0) > 0,
      hasPrCreate,
      finishCompletedOk,
    });

    // Project config is optional plumbing for the drawer's app + Jira pills.
    // Missing or invalid config leaves the pills hidden rather than failing
    // the request — the agent row alone is more useful than a 500.
    let appUrl: string | null = null;
    let jiraUrl: string | null = null;
    if (project) {
      try {
        const cfg = loadProjectConfigByName(project, this.projectsDir);
        appUrl = deriveAppUrl(cfg);
        jiraUrl = deriveJiraUrl(cfg, key);
      } catch {
        // swallow — pills hide when URLs are null
      }
    }

    // Per-tool token aggregate. Sums every token column so a tool's row
    // reflects its full footprint (input + output + both cache buckets),
    // matching the agent-wide `tokens.total`. Percent is computed server-
    // side from the row total so the dashboard never has to re-derive it.
    const tokensByToolRows = await this.db
      .selectFrom('tool_calls as tc')
      .innerJoin('runs as r', 'r.id', 'tc.run_id')
      .select([
        'tc.tool_name as tool',
        sql<number>`COALESCE(SUM(tc.input_tokens + tc.output_tokens + tc.cache_read_tokens + tc.cache_creation_tokens), 0)`.as(
          'tokens',
        ),
      ])
      .where('r.agent_key', '=', key)
      .groupBy('tc.tool_name')
      .orderBy('tokens', 'desc')
      .execute();

    const toolRowTotal = tokensByToolRows.reduce((s, r) => s + Number(r.tokens), 0);

    // CREW-191: re-parse the JSONL transcript to surface the model's own
    // output tokens. Text-only / thinking-only assistant turns never make
    // it to `tool_calls`, so the SQL aggregate alone understates the panel.
    // Tool rows are left as-is; F (CREW-195) will introduce per-category
    // attribution that splits the overlap with `tool_calls.output_tokens`.
    const assistantTokens = await this.computeAssistantOutputTokens(key);

    const combinedTotal = toolRowTotal + assistantTokens;
    const toolRows: AgentDetailTokensByTool[] = tokensByToolRows.map((r) => {
      const t = Number(r.tokens);
      return {
        tool: r.tool,
        tokens: t,
        percent: combinedTotal === 0 ? 0 : Math.round((t / combinedTotal) * 10000) / 100,
      };
    });
    const tokensByTool: AgentDetailTokensByTool[] =
      assistantTokens > 0
        ? [
            {
              tool: ASSISTANT_TOOL_LABEL,
              tokens: assistantTokens,
              percent:
                combinedTotal === 0
                  ? 0
                  : Math.round((assistantTokens / combinedTotal) * 10000) / 100,
            },
            ...toolRows,
          ]
        : toolRows;

    return {
      key,
      project,
      ticket_key: key,
      ticket_title: ticketTitle,
      state,
      worktree_path: worktreePath,
      pr_url: prUrl,
      app_url: appUrl,
      jira_url: jiraUrl,
      tokens_by_tool: tokensByTool,
      runs: runRows.map((r) => ({
        id: String(r.id),
        command: r.command,
        started_at: r.started_at,
        completed_at: r.completed_at,
        doc_load_coverage_pct: r.doc_load_coverage_pct,
        cleanliness_pass: r.cleanliness_pass,
        pr_claim_input_tokens: r.pr_claim_input_tokens,
        parity_violations: r.parity_violations,
      })),
      tokens: {
        total: output + input + cacheRead + cacheCreation,
        input,
        output,
        cache_read: cacheRead,
        cache_creation: cacheCreation,
      },
      tool_call_count: toolCallCount,
    };
  }

  /**
   * Per-project agent count. Single GROUP BY pass over the `agents` table —
   * avoids the N+1 trap of calling `list()` (which carries heavy state-
   * derivation joins). Used by ProjectsService.list() to populate the
   * activeCount column on the projects API.
   */
  async countByProject(): Promise<Map<string, number>> {
    const rows = await this.db
      .selectFrom('agents')
      .select(['project_name as projectName', sql<number>`COUNT(*)`.as('count')])
      .groupBy('project_name')
      .execute();
    return new Map(rows.map((r) => [r.projectName, Number(r.count)]));
  }

  /**
   * Update an agent's `ticket_title`. Backs the `PATCH /api/agents/:key`
   * endpoint that `crew backfill-titles` uses to fill in titles missing on
   * agents that were registered before the CLI started fetching Jira
   * summaries. Returns `false` when no agent matches the key (caller maps
   * to 404); never updates anything else on the row.
   */
  async updateTicketTitle(key: string, ticketTitle: string): Promise<boolean> {
    const result = await this.db
      .updateTable('agents')
      .set({ ticket_title: ticketTitle === '' ? null : ticketTitle })
      .where('key', '=', key)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0) > 0;
  }

  /**
   * Sum `usage.output_tokens` across every assistant event in the agent's
   * JSONL transcript. Returns 0 when no `timelineService` was injected, the
   * transcript can't be located, or no assistant events carry output tokens.
   * Backs the "Assistant" row CREW-191 prepends to `tokens_by_tool`.
   */
  private async computeAssistantOutputTokens(agentKey: string): Promise<number> {
    if (!this.timelineService) return 0;
    const { events } = await this.timelineService.getTimeline(agentKey);
    let total = 0;
    for (const evt of events) {
      if (evt.type !== 'assistant') continue;
      total += evt.message.usage.output_tokens ?? 0;
    }
    return total;
  }

  /**
   * Ordered state-transition trail for an agent. Reads directly from the
   * `state_transitions` table populated by CREW-96's backfill (and, in
   * future, by IngestService writes). Returns an empty list for agents
   * with no transitions; never 404s.
   */
  async getStateHistory(key: string): Promise<StateHistoryResponse> {
    const rows = await this.db
      .selectFrom('state_transitions')
      .select(['from_state', 'to_state', 'ts'])
      .where('agent_key', '=', key)
      .orderBy('ts', 'asc')
      .execute();

    return {
      transitions: rows.map((r) => ({
        from: r.from_state,
        to: r.to_state,
        ts: r.ts,
      })),
    };
  }
}

interface DeriveStateInput {
  completedAt: string | null;
  exitCode: number | null;
  latestHasToolCalls: boolean;
  hasPrCreate: boolean;
  /**
   * Whether any `crew finish` run for this agent has completed cleanly
   * (`exit_code = 0`). When true, the agent is `finished` regardless of
   * whether `gh pr create` was ever observed — the original `crew run`
   * makes `hasPrCreate` true forever, so this flag is the only signal that
   * the agent is past its merged-PR state. Drives CREW-116 acceptance.
   */
  finishCompletedOk: boolean;
}

function deriveState(input: DeriveStateInput): AgentState {
  if (input.finishCompletedOk) return 'finished';
  if (input.completedAt === null) {
    return input.latestHasToolCalls ? 'running' : 'initializing';
  }
  if (input.exitCode !== null && input.exitCode !== 0) return 'error';
  if (input.hasPrCreate) return 'pr_open';
  return 'finished';
}

export {
  deriveStateFromToolCalls,
  type TransitionState,
  type ToolCallSlice,
} from './state-derivation.js';
