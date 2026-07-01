import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { RunFailure } from 'crew-shared';
import type { DaemonDatabase, RunsTable, StateTransitionsTable } from '../db.js';
import type { EventBus } from './EventBus.js';

/** The dispatch command a run row records — mirrors `RunsTable['command']`. */
type RunCommand = RunsTable['command'];

export interface RunFailureServiceDeps {
  db: Kysely<DaemonDatabase>;
  eventBus: EventBus;
}

export interface RecordLaunchingInput {
  key: string;
  projectName: string;
  command: RunCommand;
  worktreePath: string;
  branch: string;
  startedAt: string;
  ticketTitle?: string;
  appUrl?: string | null;
}

export interface RecordFailedStartInput {
  key: string;
  projectName: string;
  command: RunCommand;
  failure: RunFailure;
  /** Optional — only used on the insert-fresh path (no launching row). */
  worktreePath?: string;
  branch?: string;
  ticketTitle?: string;
  startedAt?: string;
}

/** CREW-307: the row-birth inputs shared by `birthQueued`/`recordInitializing`. */
export interface BirthAgentInput {
  key: string;
  projectName: string;
  worktreePath: string;
  branch: string;
  ticketTitle?: string;
  appUrl?: string | null;
}

export interface ReapStuckLaunchingOptions {
  /** A launching row older than this many ms (by `started_at`) is settled. */
  olderThanMs: number;
  /** Injectable clock — defaults to `Date.now`. */
  now?: () => number;
}

/** The generic failure stamped on a reaped (timed-out) launching row. */
const LAUNCHING_TIMEOUT_FAILURE: RunFailure = {
  check: 'launching-timeout',
  headline: 'Run never started',
  remediation: 'The launch process exited before registering. Re-run the ticket.',
  output: '',
};

/**
 * Makes init/preflight failures visible (CREW-244 / Epic CREW-235).
 *
 * Today a `crew run` that dies in preflight leaves zero trace — registration
 * only happens after Claude spawns. This service backs the
 * register-before-preflight flow:
 *
 * - `recordLaunching` pre-registers the run as `launching` before preflight.
 * - `recordFailedStart` converts that placeholder (or inserts a fresh row) to
 *   a structured `failed-start` carrying the `RunFailure` diagnosis.
 * - `acknowledge` / `onNewRunRegistered` dismiss a failed-start, the latter
 *   automatically when a fresh run for the same key registers.
 * - `reapStuckLaunching` settles a launching row that never progressed.
 *
 * Routes are thin wrappers over these methods (daemon route/service split).
 * Every failed-start transition publishes `run.failed_start` so the Runner
 * page's "Failed to start" section reflects it without polling.
 */
export class RunFailureService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly eventBus: EventBus;

  constructor(deps: RunFailureServiceDeps) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
  }

  /**
   * CREW-307 — birth the agent row as `queued` at enqueue (the dashboard path).
   * Idempotent upsert of the agents row + a `queued` state transition, so the
   * run is visible in the grid from the moment it is requested — before the
   * runner has claimed it. The `worktree_path` is derived by the caller
   * (`ActionService.enqueue`) via `worktreePathFor(repoPath, key)`.
   */
  async birthQueued(input: BirthAgentInput): Promise<void> {
    await this.upsertAgent({
      key: input.key,
      projectName: input.projectName,
      ticketTitle: input.ticketTitle,
      worktreePath: input.worktreePath,
      branch: input.branch,
      appUrl: input.appUrl ?? null,
    });
    await this.writeBirthTransition(input.key, 'queued', 'enqueue');
  }

  /**
   * CREW-307 — birth (or advance) the agent row to `init` on the direct-CLI
   * path, called immediately after config resolves and before the preflight
   * gate. Idempotent: the agents row is always upserted (refreshing
   * worktree/app-url), but the `init` transition is written only when the row
   * is fresh (no prior transition) or still `queued` — so re-calling it, or
   * calling it on a run already past init (running/pr_open/...), never
   * regresses the state.
   */
  async recordInitializing(input: BirthAgentInput): Promise<void> {
    await this.upsertAgent({
      key: input.key,
      projectName: input.projectName,
      ticketTitle: input.ticketTitle,
      worktreePath: input.worktreePath,
      branch: input.branch,
      appUrl: input.appUrl ?? null,
    });
    const previous = await this.latestState(input.key);
    if (previous === null || previous === 'queued') {
      await this.writeBirthTransition(input.key, 'init', 'initializing', previous);
    }
  }

  /** Pre-register a run as `launching` before preflight. Returns the run id. */
  async recordLaunching(input: RecordLaunchingInput): Promise<{ runId: number }> {
    await this.upsertAgent({
      key: input.key,
      projectName: input.projectName,
      ticketTitle: input.ticketTitle,
      worktreePath: input.worktreePath,
      branch: input.branch,
      appUrl: input.appUrl ?? null,
    });
    const inserted = await this.db
      .insertInto('runs')
      .values({
        agent_key: input.key,
        command: input.command,
        // Synthesized session id: no transcript exists yet, but session_id is
        // NOT NULL UNIQUE. The random suffix keeps two same-key, same-ms
        // pre-registers from colliding on the constraint. The launching row is
        // a placeholder cleared on successful registration (onNewRunRegistered).
        session_id: `launching:${input.key}:${Date.now()}:${randomUUID()}`,
        started_at: input.startedAt,
        completed_at: null,
        exit_code: null,
        status: 'launching',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { runId: inserted.id };
  }

  /**
   * Record a structured failed-start. Converts the most-recent `launching`
   * placeholder for the key in place; if none exists, inserts a fresh
   * failed-start row (upserting the agent so the Runner page can name it).
   */
  async recordFailedStart(input: RecordFailedStartInput): Promise<{ runId: number }> {
    const now = new Date().toISOString();
    // Convert the most-recent launching placeholder for the key. The one-key-
    // one-dispatch invariant means there's normally exactly one; if an earlier
    // pre-register ever left an extra, the time-based reaper settles it.
    const launching = await this.db
      .selectFrom('runs')
      .select('id')
      .where('agent_key', '=', input.key)
      .where('status', '=', 'launching')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();

    let runId: number;
    if (launching) {
      await this.db
        .updateTable('runs')
        .set({
          status: 'failed-start',
          completed_at: now,
          exit_code: 1,
          acknowledged: 0,
          failure_check: input.failure.check,
          failure_headline: input.failure.headline,
          failure_remediation: input.failure.remediation,
          failure_output: input.failure.output,
        })
        .where('id', '=', launching.id)
        .execute();
      runId = launching.id;
    } else {
      await this.upsertAgent({
        key: input.key,
        projectName: input.projectName,
        ticketTitle: input.ticketTitle,
        worktreePath: input.worktreePath ?? '',
        branch: input.branch ?? input.key,
        appUrl: null,
      });
      const startedAt = input.startedAt ?? now;
      const inserted = await this.db
        .insertInto('runs')
        .values({
          agent_key: input.key,
          command: input.command,
          session_id: `failed-start:${input.key}:${Date.now()}:${randomUUID()}`,
          started_at: startedAt,
          completed_at: now,
          exit_code: 1,
          status: 'failed-start',
          failure_check: input.failure.check,
          failure_headline: input.failure.headline,
          failure_remediation: input.failure.remediation,
          failure_output: input.failure.output,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      runId = inserted.id;
    }

    this.publishFailedStart(input.key);
    return { runId };
  }

  /**
   * Acknowledge (dismiss) all unacknowledged failed-start rows for a key.
   * Returns the number of rows acknowledged; emits `run.failed_start` so the
   * Runner page's section clears.
   */
  async acknowledge(key: string): Promise<number> {
    const result = await this.db
      .updateTable('runs')
      .set({ acknowledged: 1 })
      .where('agent_key', '=', key)
      .where('status', '=', 'failed-start')
      .where('acknowledged', '=', 0)
      .executeTakeFirst();
    const count = Number(result.numUpdatedRows ?? 0);
    if (count > 0) this.publishFailedStart(key);
    return count;
  }

  /**
   * Reconcile prior runner-failure state when a fresh run registers for the
   * key: auto-acknowledge any unacknowledged failed-start, and clear any
   * lingering `launching` placeholder (the real run replaces it). Called from
   * the register-run route.
   */
  async onNewRunRegistered(key: string): Promise<void> {
    const acked = await this.acknowledge(key);
    await this.db
      .deleteFrom('runs')
      .where('agent_key', '=', key)
      .where('status', '=', 'launching')
      .execute();
    // `acknowledge` already published when it acked something; nothing more to
    // do — the deleted launching placeholder was never surfaced.
    void acked;
  }

  /**
   * Settle `launching` rows that never progressed: any launching row whose
   * `started_at` is older than `olderThanMs` is converted to a `failed-start`
   * with a generic timeout diagnosis. Returns the number reaped.
   */
  async reapStuckLaunching(opts: ReapStuckLaunchingOptions): Promise<number> {
    const now = opts.now ?? Date.now;
    const cutoffIso = new Date(now() - opts.olderThanMs).toISOString();
    const stuck = await this.db
      .selectFrom('runs')
      .select(['id', 'agent_key'])
      .where('status', '=', 'launching')
      .where('started_at', '<', cutoffIso)
      .execute();
    if (stuck.length === 0) return 0;

    const completedAt = new Date(now()).toISOString();
    await this.db
      .updateTable('runs')
      .set({
        status: 'failed-start',
        completed_at: completedAt,
        exit_code: 1,
        acknowledged: 0,
        failure_check: LAUNCHING_TIMEOUT_FAILURE.check,
        failure_headline: LAUNCHING_TIMEOUT_FAILURE.headline,
        failure_remediation: LAUNCHING_TIMEOUT_FAILURE.remediation,
        failure_output: LAUNCHING_TIMEOUT_FAILURE.output,
      })
      .where(
        'id',
        'in',
        stuck.map((r) => r.id),
      )
      .execute();

    for (const key of new Set(stuck.map((r) => r.agent_key))) {
      this.publishFailedStart(key);
    }
    return stuck.length;
  }

  /** Upsert the agents row, preserving an existing non-empty ticket_title. */
  private async upsertAgent(input: {
    key: string;
    projectName: string;
    ticketTitle?: string;
    worktreePath: string;
    branch: string;
    appUrl: string | null;
  }): Promise<void> {
    await this.db
      .insertInto('agents')
      .values({
        key: input.key,
        project_name: input.projectName,
        ticket_title: input.ticketTitle ? input.ticketTitle : null,
        worktree_path: input.worktreePath,
        branch: input.branch,
        pr_url: null,
        app_url: input.appUrl,
        created_at: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          project_name: (eb) => eb.ref('excluded.project_name'),
          worktree_path: (eb) => eb.ref('excluded.worktree_path'),
          branch: (eb) => eb.ref('excluded.branch'),
          ticket_title: sql`COALESCE(NULLIF(excluded.ticket_title, ''), agents.ticket_title)`,
          app_url: sql`COALESCE(excluded.app_url, agents.app_url)`,
        }),
      )
      .execute();
  }

  /** Latest `state_transitions.to_state` for a key (null when none). */
  private async latestState(
    agentKey: string,
  ): Promise<StateTransitionsTable['to_state'] | null> {
    const row = await this.db
      .selectFrom('state_transitions')
      .select('to_state')
      .where('agent_key', '=', agentKey)
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    return row?.to_state ?? null;
  }

  /**
   * CREW-307 — write a birth transition (`queued`/`init`) + publish the
   * `agent.state_changed` SSE. This is the row-birth counterpart to
   * `IngestService`'s transition writers; it is safe re: that service's
   * in-memory state cache because the cache lazily loads from the DB on first
   * touch of a key, and a birthed key has not yet been touched by ingest.
   */
  private async writeBirthTransition(
    agentKey: string,
    to: 'queued' | 'init',
    source: string,
    from: StateTransitionsTable['from_state'] = null,
  ): Promise<void> {
    const ts = Date.now();
    await this.db
      .insertInto('state_transitions')
      .values({ agent_key: agentKey, from_state: from, to_state: to, ts, source })
      .execute();
    this.eventBus.publish({ type: 'agent.state_changed', data: { key: agentKey, from, to, ts } });
  }

  private publishFailedStart(key: string): void {
    this.eventBus.publish({ type: 'run.failed_start', data: { key } });
  }
}
