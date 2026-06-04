import type { Kysely } from 'kysely';
import type { FinishStepEvent, FinishStepInput } from 'crew-shared';
import type { DaemonDatabase } from '../db.js';
import type { EventBus } from './EventBus.js';

export interface FinishStepsServiceDeps {
  db: Kysely<DaemonDatabase>;
  eventBus: EventBus;
}

/**
 * A stored step as read back. Identical to the wire `FinishStepEvent`
 * except `detail` is `string | null` (NULL in the DB) rather than the
 * optional `string | undefined` the emit side accepts.
 */
export type StoredFinishStep = Omit<FinishStepEvent, 'detail'> & { detail: string | null };

/**
 * CREW-215 — stores `crew finish` step results and reads them back as an
 * ordered checklist for the agent drawer.
 *
 * `record` inserts one row and pings `finish_step.changed{key}` so the
 * dashboard refetches. `list` returns rows in emission (insertion) order —
 * ordering by `id`, not `idx`, so re-runs of `crew finish` append
 * chronologically instead of interleaving by per-run ordinal.
 */
export class FinishStepsService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly eventBus: EventBus;

  constructor(deps: FinishStepsServiceDeps) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
  }

  async record(key: string, input: FinishStepInput): Promise<StoredFinishStep> {
    const detail = input.detail ?? null;
    await this.db
      .insertInto('finish_steps')
      .values({
        agent_key: key,
        idx: input.index,
        label: input.label,
        status: input.status,
        detail,
        ts: input.ts,
      })
      .execute();
    this.eventBus.publish({ type: 'finish_step.changed', data: { key } });
    // Return the normalized (`detail: string | null`) shape so the wire
    // format matches `list()` without the route re-coercing undefined→null.
    return {
      key,
      index: input.index,
      label: input.label,
      status: input.status,
      detail,
      ts: input.ts,
    };
  }

  async list(key: string): Promise<Array<StoredFinishStep>> {
    const rows = await this.db
      .selectFrom('finish_steps')
      .select(['idx', 'label', 'status', 'detail', 'ts'])
      .where('agent_key', '=', key)
      .orderBy('id', 'asc')
      .execute();
    return rows.map((r) => ({
      key,
      index: r.idx,
      label: r.label,
      status: r.status,
      detail: r.detail,
      ts: r.ts,
    }));
  }
}
