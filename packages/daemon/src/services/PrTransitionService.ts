import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonDatabase } from '../db.js';
import type { EventBus } from './EventBus.js';

/**
 * Canonicalize a GitHub PR URL for cross-source comparison. The webhook's
 * `pull_request.html_url` and the stored `agents.pr_url` (written by the
 * pr_created hook, CREW-261) should already be identical canonical forms;
 * this defends against trivial scheme/host-casing or trailing-slash drift.
 * The path (owner/repo/pull/n) is preserved verbatim — repo names are
 * case-sensitive on GitHub, so we only lowercase scheme + host.
 */
export function normalizePrUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  const m = /^([a-zA-Z]+):\/\/([^/]+)(\/.*)?$/.exec(trimmed);
  if (!m) return trimmed;
  const [, scheme, host, path = ''] = m;
  return `${scheme.toLowerCase()}://${host.toLowerCase()}${path}`;
}

export interface PrTransitionDeps {
  db: Kysely<DaemonDatabase>;
  eventBus: EventBus;
  logger: Logger;
}

export interface MarkMergedOpts {
  /**
   * Provenance recorded on the `state_transitions.source` column (CREW-259).
   * The poller passes `'poller'`; the webhook (CREW-267 child C) will pass
   * `'webhook'`. Omitted ⇒ null source.
   */
  source?: string;
}

/**
 * Owns the single, idempotent `pr_open → pr_merged` transition. Shared by
 * PrPoller (poll backstop), the webhook (fast path), and the drawer's manual
 * refresh. `pr_merged` is terminal and intentionally outside the concrete
 * state-events reducer — this is its dedicated daemon-side path.
 */
export class PrTransitionService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly eventBus: EventBus;
  private readonly logger: Logger;

  constructor(deps: PrTransitionDeps) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger;
  }

  /**
   * Transition the agent to pr_merged iff its latest state_transitions row is
   * pr_open. The precondition makes double-delivery and webhook-vs-poll races
   * collapse to one transition. Returns `{ changed }`.
   */
  async markMerged(agentKey: string, opts: MarkMergedOpts = {}): Promise<{ changed: boolean }> {
    const current = await this.latestState(agentKey);
    if (current !== 'pr_open') return { changed: false };
    const ts = Date.now();
    await this.db
      .insertInto('state_transitions')
      .values({
        agent_key: agentKey,
        from_state: 'pr_open',
        to_state: 'pr_merged',
        ts,
        source: opts.source ?? null,
      })
      .execute();
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: agentKey, from: 'pr_open', to: 'pr_merged', ts },
    });
    this.logger.info(
      { agentKey, source: opts.source ?? null },
      'agent transitioned pr_open → pr_merged',
    );
    return { changed: true };
  }

  /**
   * Find the agent key whose stored pr_url matches `prUrl` (normalized) and
   * whose latest state is pr_open. Returns null when nothing matches —
   * including an already-merged / unknown PR (a valid delivery with nothing
   * to do). Normalizes in JS because pr_url is stored verbatim.
   */
  async resolveOpenPrAgentByUrl(prUrl: string): Promise<string | null> {
    const target = normalizePrUrl(prUrl);
    const rows = await this.db
      .selectFrom('agents')
      .select(['key', 'pr_url'])
      .where('pr_url', 'is not', null)
      .execute();
    for (const row of rows) {
      if (row.pr_url && normalizePrUrl(row.pr_url) === target) {
        if ((await this.latestState(row.key)) === 'pr_open') return row.key;
      }
    }
    return null;
  }

  private async latestState(agentKey: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('state_transitions')
      .select('to_state')
      .where('agent_key', '=', agentKey)
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    return row?.to_state ?? null;
  }
}
