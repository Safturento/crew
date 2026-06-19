import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonDatabase } from '../db.js';
import type { EventBus } from './EventBus.js';
import { fetchPrStateViaGh } from './github/fetch-pr-state.js';
import type { AgentState } from './AgentsService.js';

export interface CheckResult {
  stateChanged: boolean;
  newState?: AgentState;
}

export interface PrPollerDeps {
  db: Kysely<DaemonDatabase>;
  eventBus: EventBus;
  logger: Logger;
  /** Polling cadence in ms. Defaults to 5 minutes (CREW-202 spec). */
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 5 * 60_000;

/**
 * CREW-202 — background + on-demand PR-status poller.
 *
 * `start()` kicks off an immediate poll, then re-polls on a fixed interval
 * (5 min by default). Every round walks all agents whose latest state
 * transition is `pr_open` AND who have a non-null `pr_url`, asks GitHub
 * for the PR's current state via `gh pr view`, and inserts a
 * `pr_open → pr_merged` transition + emits `agent.state_changed` when
 * the PR is no longer OPEN (merged or closed).
 *
 * `checkAgent(key)` is the public hook for the manual "Refresh PR status"
 * button in the drawer. Same pipeline, single agent. The precondition
 * check (must currently be in `pr_open`) protects against a manual refresh
 * fired against an already-merged or never-opened agent.
 *
 * Errors from `gh` are caught per-agent and logged; one broken PR never
 * aborts the round.
 */
export class PrPoller {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: PrPollerDeps) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger;
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  start(): void {
    // Kick an immediate round so a daemon restart with an already-merged PR
    // doesn't wait `intervalMs` before noticing.
    this.pollOnce().catch((err) => {
      this.logger.warn({ err }, 'initial PR poll round failed');
    });
    this.timer = setInterval(() => {
      this.pollOnce().catch((err) => {
        this.logger.warn({ err }, 'PR poll round failed');
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * On-demand check for a single agent. Wraps the internal pipeline so an
   * unexpected throw becomes a logged no-op instead of a 500 to the route.
   */
  async checkAgent(agentKey: string): Promise<CheckResult> {
    try {
      return await this.checkOneInternal(agentKey);
    } catch (err) {
      this.logger.warn({ err, agentKey }, 'PR check failed for agent');
      return { stateChanged: false };
    }
  }

  /** Test seam — drives the same code path the interval fires. */
  async pollOnceForTest(): Promise<void> {
    await this.pollOnce();
  }

  private async checkOneInternal(agentKey: string): Promise<CheckResult> {
    const agent = await this.db
      .selectFrom('agents')
      .select(['key', 'pr_url'])
      .where('key', '=', agentKey)
      .executeTakeFirst();
    if (!agent?.pr_url) return { stateChanged: false };

    const currentState = await this.getCurrentTransitionState(agentKey);
    // Precondition: only transition out of pr_open. Manual Refresh from any
    // other state is a clean no-op; the daemon doesn't second-guess Finish
    // (finished) or pre-PR work (init / running).
    if (currentState !== 'pr_open') return { stateChanged: false };

    const prState = await fetchPrStateViaGh(agent.pr_url);
    if (prState === 'OPEN') return { stateChanged: false };

    const ts = Date.now();
    await this.db
      .insertInto('state_transitions')
      .values({
        agent_key: agentKey,
        from_state: 'pr_open',
        to_state: 'pr_merged',
        ts,
        source: 'poller',
      })
      .execute();
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: agentKey, from: 'pr_open', to: 'pr_merged', ts },
    });
    return { stateChanged: true, newState: 'pr_merged' };
  }

  /**
   * Read the agent's latest state_transitions.to_state. Distinct from
   * AgentsService.deriveState — PrPoller only cares about the precondition,
   * not the full UI-facing state. Returns null when no transitions exist
   * yet for the agent.
   */
  private async getCurrentTransitionState(agentKey: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('state_transitions')
      .select('to_state')
      .where('agent_key', '=', agentKey)
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    return row?.to_state ?? null;
  }

  private async pollOnce(): Promise<void> {
    // Pick agents whose LATEST state_transitions row is pr_open and that
    // have a pr_url. The correlated subquery in the WHERE clause picks the
    // max-id transition per agent — mirrors AgentsService.list's "latest
    // per agent" idiom but read-only and limited to the state field.
    const rows = await this.db
      .selectFrom('agents as a')
      .innerJoin('state_transitions as st', 'st.agent_key', 'a.key')
      .where('a.pr_url', 'is not', null)
      .where(
        'st.id',
        '=',
        sql<number>`(
          SELECT id FROM state_transitions st2
          WHERE st2.agent_key = a.key
          ORDER BY st2.ts DESC, st2.id DESC
          LIMIT 1
        )`,
      )
      .where('st.to_state', '=', 'pr_open')
      .select(['a.key'])
      .execute();

    for (const row of rows) {
      await this.checkAgent(row.key);
    }
  }
}
