import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Logger } from 'pino';
import { deriveAppUrl, deriveJiraUrl, loadProjectConfigByName } from 'crew-shared';
import type { DaemonDatabase } from '../db.js';
import type { TimelineService } from './TimelineService.js';
import { currentStateFromTransitions, type TransitionTarget } from './state-derivation.js';

/** Synthetic tool-row label for the model's own output tokens (CREW-191). */
const ASSISTANT_TOOL_LABEL = 'Assistant';

export type AgentState =
  | 'initializing'
  | 'running'
  | 'idle'
  | 'waiting'
  | 'pr_open'
  | 'pr_merged'
  | 'error'
  | 'finished';

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

/** Per-category token bucket (CREW-195) — drives cost-weighted display. */
export interface TokenCategoryBucket {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export interface AgentDetailTokensByTool {
  tool: string;
  /** Per-category bucket — multiply by per-model rates for USD cost. */
  tokens: TokenCategoryBucket;
  /** Sum of all bucket entries — convenience for sort + bar widths. */
  totalTokens: number;
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
  /** Per-tool token aggregate across all of the agent's runs, ordered by totalTokens desc. */
  tokens_by_tool: AgentDetailTokensByTool[];
  /**
   * Dominant model across the agent's transcript events (mode of
   * `message.model`). Empty string when no transcript or no model field —
   * pricing helpers fall back to Sonnet rates in that case.
   */
  model: string;
  runs: AgentDetailRun[];
  tokens: AgentDetailTokens;
  tool_call_count: number;
}

export type StateTransitionState =
  | 'init'
  | 'running'
  | 'pr_open'
  | 'pr_merged'
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
  /**
   * Optional pino logger. `getByKey` warns through it when a project config
   * load fails (CREW-233) rather than silently swallowing — a degraded URL
   * pill should leave a trace. Optional so unit tests can omit it; production
   * wires the cradle logger via the DI container.
   */
  logger?: Logger;
}

export class AgentsService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly projectsDir: string | undefined;
  private readonly timelineService: TimelineService | undefined;
  private readonly logger: Logger | undefined;

  constructor(deps: AgentsServiceDeps) {
    this.db = deps.db;
    this.projectsDir = deps.projectsDir;
    this.timelineService = deps.timelineService;
    this.logger = deps.logger;
  }

  async list(): Promise<AgentSummary[]> {
    // One row per agent. The `latest` join uses a correlated subquery to
    // pick the agent's highest run id among non-finish runs (autoincrement
    // → newest), so a `crew finish` run does not poison the latest-run
    // signal that drives state derivation. `totals` aggregates token columns
    // and a single flag — whether the LATEST non-finish run has any tool_calls
    // (distinguishes `initializing` from `running` only for pre-0002 agents
    // that have no transition log). `latest_to_state` is the agent's most
    // recent `state_transitions.to_state` — the CREW-234 source of truth for
    // the non-terminal badge (it follows IngestService's live `gh pr create`
    // detection + the fix-pr `pr_open → running` cycle).
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
      // CREW-202: surface PrPoller's `pr_merged` transition. We don't need
      // the full latest-row machinery — a single MAX flag is sufficient
      // because pr_merged is monotonic in the current state machine (no
      // outbound transitions from pr_merged exist in v1; manual Refresh of
      // a re-opened PR would write a new row but the dashboard's response
      // is still "merged" until the user acts via Finish).
      .leftJoin(
        this.db
          .selectFrom('state_transitions as st')
          .select([
            'st.agent_key as agent_key',
            sql<number>`MAX(CASE WHEN st.to_state = 'pr_merged' THEN 1 ELSE 0 END)`.as('pr_merged'),
          ])
          .groupBy('st.agent_key')
          .as('transition_status'),
        (join) => join.onRef('transition_status.agent_key', '=', 'a.key'),
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
        'totals.latest_has_tool_calls',
        'finish_status.has_finish_completed_ok',
        'transition_status.pr_merged',
        // CREW-234: latest transition's to_state — drives the non-terminal badge.
        sql<TransitionTarget | null>`(SELECT st.to_state FROM state_transitions st WHERE st.agent_key = a.key ORDER BY st.ts DESC, st.id DESC LIMIT 1)`.as(
          'latest_to_state',
        ),
        // CREW-264: the `source` of that same latest row (identical ORDER/LIMIT
        // selects the same transition) — lets deriveState honor an override
        // out of a terminal state.
        sql<
          string | null
        >`(SELECT st.source FROM state_transitions st WHERE st.agent_key = a.key ORDER BY st.ts DESC, st.id DESC LIMIT 1)`.as(
          'latest_source',
        ),
      ])
      .orderBy('a.key', 'asc')
      .execute();

    return rows.map((row) => {
      const tokens = row.tokens ?? 0;
      const state = deriveState({
        completedAt: row.completedAt,
        exitCode: row.exitCode,
        latestHasToolCalls: Boolean(row.latest_has_tool_calls),
        currentState: latestToAgentState(row.latest_to_state),
        finishCompletedOk: Boolean(row.has_finish_completed_ok),
        prMerged: Boolean(row.pr_merged),
        latestIsOverride: row.latest_source === 'override',
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
   * as `list()`: terminal guards (finish/error/pr_merged) over a
   * non-terminal state projected from the `state_transitions` log
   * (CREW-234). The caller renders 404 on null.
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
      .select(['key', 'project_name', 'ticket_title', 'worktree_path', 'pr_url', 'app_url'])
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
      ])
      .where('r.agent_key', '=', key)
      .executeTakeFirst();

    const output = totals?.output ?? 0;
    const input = totals?.input ?? 0;
    const cacheRead = totals?.cache_read ?? 0;
    const cacheCreation = totals?.cache_creation ?? 0;
    const toolCallCount = totals?.tool_call_count ?? 0;

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

    // CREW-202: check for a `pr_merged` transition written by PrPoller.
    // A single existence check is enough — see list()'s comment for the
    // monotonicity rationale.
    const prMergedRow = await this.db
      .selectFrom('state_transitions')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('agent_key', '=', key)
      .where('to_state', '=', 'pr_merged')
      .executeTakeFirst();
    const prMerged = (prMergedRow?.n ?? 0) > 0;

    // CREW-234: the non-terminal badge follows the transition log, not the
    // cruder per-detail `gh pr create` SQL flag that used to disagree with
    // list()'s ⏎-aware detection. One source of truth for list + drawer.
    const latestTransition = await this.db
      .selectFrom('state_transitions')
      .select(['to_state', 'source'])
      .where('agent_key', '=', key)
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();

    const state = deriveState({
      completedAt: latest.completed_at,
      exitCode: latest.exit_code,
      latestHasToolCalls: (latestHasToolCalls?.n ?? 0) > 0,
      currentState: latestToAgentState(latestTransition?.to_state ?? null),
      finishCompletedOk,
      prMerged,
      latestIsOverride: latestTransition?.source === 'override',
    });

    // Project config is optional plumbing for the drawer's app + Jira pills.
    // Missing or invalid config leaves the pills degraded rather than failing
    // the request — the agent row alone is more useful than a 500.
    //
    // CREW-233: the stored per-worktree `app_url` (passed by the CLI at run
    // registration) wins — it points at the agent's actual running port. Fall
    // back to the static `deriveAppUrl(cfg)` only when none was stored, so the
    // canonical main stack and pre-0008 agents are unchanged.
    let appUrl: string | null = agent?.app_url ?? null;
    let jiraUrl: string | null = null;
    if (project) {
      try {
        const cfg = loadProjectConfigByName(project, this.projectsDir);
        if (appUrl === null) appUrl = deriveAppUrl(cfg);
        jiraUrl = deriveJiraUrl(cfg, key);
      } catch (err) {
        // Don't swallow — a degraded URL pill should leave a trace.
        this.logger?.warn({ err, project, key }, 'project config load failed; URL pills degraded');
      }
    }

    // Per-tool, per-category token aggregate. CREW-195 surfaces the
    // input/output/cache_creation/cache_read split so the dashboard can
    // weight each row by per-model API pricing. Attribution is already
    // first-tool-in-turn — IngestService stores each assistant turn's full
    // usage under its first tool_use block, so summing here preserves that.
    const tokensByToolRows = await this.db
      .selectFrom('tool_calls as tc')
      .innerJoin('runs as r', 'r.id', 'tc.run_id')
      .select([
        'tc.tool_name as tool',
        sql<number>`COALESCE(SUM(tc.input_tokens), 0)`.as('input'),
        sql<number>`COALESCE(SUM(tc.output_tokens), 0)`.as('output'),
        sql<number>`COALESCE(SUM(tc.cache_creation_tokens), 0)`.as('cacheCreation'),
        sql<number>`COALESCE(SUM(tc.cache_read_tokens), 0)`.as('cacheRead'),
      ])
      .where('r.agent_key', '=', key)
      .groupBy('tc.tool_name')
      .execute();

    // CREW-191: re-parse the JSONL transcript to surface the model's own
    // tokens from text-only / thinking-only assistant turns — these never
    // make it to `tool_calls`, so SQL alone understates the panel.
    // CREW-195: extended to per-category buckets + dominant model.
    const { assistantBucket, dominantModel } = await this.computeAssistantBucketAndModel(key);

    const toolRows: AgentDetailTokensByTool[] = tokensByToolRows.map((r) => {
      const bucket: TokenCategoryBucket = {
        input: Number(r.input),
        output: Number(r.output),
        cacheCreation: Number(r.cacheCreation),
        cacheRead: Number(r.cacheRead),
      };
      return {
        tool: r.tool,
        tokens: bucket,
        totalTokens: bucket.input + bucket.output + bucket.cacheCreation + bucket.cacheRead,
      };
    });
    toolRows.sort((a, b) => b.totalTokens - a.totalTokens);

    const assistantTotal =
      assistantBucket.input +
      assistantBucket.output +
      assistantBucket.cacheCreation +
      assistantBucket.cacheRead;
    const tokensByTool: AgentDetailTokensByTool[] =
      assistantTotal > 0
        ? [
            { tool: ASSISTANT_TOOL_LABEL, tokens: assistantBucket, totalTokens: assistantTotal },
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
      model: dominantModel,
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
   * Single transcript pass producing:
   *   - the Assistant bucket: per-category usage summed across text-only /
   *     thinking-only assistant turns (turns with no tool_use blocks).
   *     IngestService already attributes tool-bearing turns to their first
   *     tool_use via `tool_calls`, so subtracting them here avoids double
   *     counting in the panel.
   *   - the dominant model: mode of `message.model` across all assistant
   *     events. Empty string when none carry a model field. The dashboard's
   *     pricing helper falls back to Sonnet when this is empty.
   *
   * Returns the empty bucket + empty model when no `timelineService` was
   * injected or the transcript can't be located.
   */
  private async computeAssistantBucketAndModel(
    agentKey: string,
  ): Promise<{ assistantBucket: TokenCategoryBucket; dominantModel: string }> {
    const empty = { assistantBucket: emptyBucket(), dominantModel: '' };
    if (!this.timelineService) return empty;
    const { events } = await this.timelineService.getTimeline(agentKey);
    const bucket = emptyBucket();
    const modelCounts = new Map<string, number>();
    for (const evt of events) {
      if (evt.type !== 'assistant') continue;
      const model = evt.message.model;
      if (model) modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
      const hasToolUse = evt.message.content.some((c) => c.type === 'tool_use');
      if (hasToolUse) continue;
      const usage = evt.message.usage;
      bucket.input += usage.input_tokens ?? 0;
      bucket.output += usage.output_tokens ?? 0;
      bucket.cacheCreation += usage.cache_creation_input_tokens ?? 0;
      bucket.cacheRead += usage.cache_read_input_tokens ?? 0;
    }
    // Strict `>` means ties go to the chronologically-first model — JS Map
    // iteration is insertion-order, and assistant events feed in transcript
    // order. Stable + predictable; sufficient since the price brackets
    // (Sonnet/Opus/Haiku) only matter at the model boundary, not within ties.
    let dominantModel = '';
    let bestCount = 0;
    for (const [model, count] of modelCounts) {
      if (count > bestCount) {
        bestCount = count;
        dominantModel = model;
      }
    }
    return { assistantBucket: bucket, dominantModel };
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
  /**
   * Whether the latest non-finish run has any tool_calls. Only consulted as a
   * fallback for pre-0002 agents that have no transition log at all — for
   * everyone else `currentState` carries the running/initializing distinction.
   */
  latestHasToolCalls: boolean;
  /**
   * CREW-234: the non-terminal state projected from the `state_transitions`
   * log (`currentStateFromTransitions`). `initializing` when the agent has no
   * transitions. This replaces the forever-true `gh pr create` SQL flag and is
   * what lets the badge follow the fix-pr `pr_open → running` cycle and agree
   * with the timeline. The terminal guards below still take precedence because
   * the CREW-96 backfill never wrote `finished`/`error`/`pr_merged` for
   * historical agents.
   */
  currentState: AgentState;
  /**
   * Whether any `crew finish` run for this agent has completed cleanly
   * (`exit_code = 0`). When true, the agent is `finished` — authoritative over
   * the log because a pre-CREW-116 finish left no `finished` transition.
   * Drives CREW-116 acceptance.
   */
  finishCompletedOk: boolean;
  /**
   * CREW-202: PrPoller writes a `pr_merged` transition when GitHub reports the
   * PR is no longer OPEN. Kept as an explicit guard (rather than relying solely
   * on the log) so the merged state is honored even for historical agents.
   */
  prMerged: boolean;
  /**
   * CREW-264: whether the agent's latest transition (the same row that feeds
   * `currentState`) carries `source='override'` — i.e. the operator escape
   * hatch (`recordStateOverride`, CREW-259) is the newest fact. When true,
   * `currentState` already reflects the override target and must win over the
   * legacy terminal guards so an override OUT of `finished`/`error`/`pr_merged`
   * survives the list/detail re-derive instead of reverting after the SSE flip.
   * Restricted to `source='override'` so the backfill-protection the guards give
   * legacy agents is preserved for every other transition source.
   */
  latestIsOverride: boolean;
}

function emptyBucket(): TokenCategoryBucket {
  return { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
}

/** Map a raw `state_transitions.to_state` (or null when none) to `AgentState`. */
function latestToAgentState(toState: TransitionTarget | null): AgentState {
  return currentStateFromTransitions(toState ? [{ to: toState, ts: 0 }] : []);
}

/**
 * The agent-state badge (CREW-234). Authoritative terminal signals win first —
 * a completed `crew finish`, then a non-zero exit, then a merged PR — because
 * the CREW-96 transition backfill never wrote those terminal states for
 * historical agents, so a raw log projection would regress them. The remaining
 * `initializing`/`running`/`pr_open` distinction comes from the transition log
 * (`currentState`), which follows IngestService's live `gh pr create` detection
 * and the fix-pr `pr_open → running` cycle — fixing both the stuck-PR-Open and
 * false-Finished symptoms. The tool-call heuristic is only a last resort for
 * pre-0002 agents whose log is empty.
 */
function deriveState(input: DeriveStateInput): AgentState {
  // CREW-264 Defect 2: an operator override is the newest transition, so honor
  // it over the legacy terminal guards — `currentState` is projected from that
  // same latest (ts, id) row, so it already holds the override target. This is
  // the read-path counterpart to `recordStateOverride`'s escape hatch: an
  // override OUT of `finished`/`error`/`pr_merged` now survives the re-derive
  // instead of reverting. Gated on `source='override'` (any newer automatic
  // event would write a non-override row and re-take precedence), so legacy
  // backfilled agents keep the guards below.
  //
  // INVARIANT: `latestIsOverride` and `currentState` MUST be read from the same
  // latest `(ts, id)` transition row (see `list()`/`getByKey`). Sourcing them
  // from different rows would let this return a `currentState` that doesn't
  // correspond to the override.
  if (input.latestIsOverride) return input.currentState;
  if (input.finishCompletedOk) return 'finished';
  if (input.completedAt === null) {
    if (input.currentState !== 'initializing') return input.currentState;
    return input.latestHasToolCalls ? 'running' : 'initializing';
  }
  if (input.exitCode !== null && input.exitCode !== 0) return 'error';
  if (input.prMerged) return 'pr_merged';
  if (input.currentState !== 'initializing') return input.currentState;
  // CREW-264 Defect 1: a completed run (exit 0, no PR) whose log is empty or
  // non-terminal is `idle` (run ended with no PR — the state CREW-257 made
  // reachable), never a fabricated `finished`. `finished` is produced solely by
  // the `finishCompletedOk` guard above; the old `return 'finished'` here
  // masqueraded a dropped/missed terminal detection as a clean close-out.
  return 'idle';
}

export {
  deriveStateFromToolCalls,
  type TransitionState,
  type ToolCallSlice,
} from './state-derivation.js';
