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

/**
 * CREW-308: an early preflight-gate failure. Extends the birth inputs (so the
 * agent row can be upserted as a fallback when the birth call was lost) with the
 * failing `phase` + `summary`. The operator-facing reason itself lives on the
 * `~/.crew/startup/<key>.jsonl` `failed` phase (written by the CLI before exit);
 * these fields let the daemon log/annotate the `error` transition.
 */
export interface EarlyFailureInput extends BirthAgentInput {
  phase: string;
  summary: string;
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
   *
   * Guarded against clobbering a **live** agent: a duplicate `run` enqueue for a
   * key that is already in-flight (`init`/`running`/`pr_open`) is a no-op, so its
   * badge never regresses to `queued`. Terminal/idle/orphaned agents are
   * re-runnable, so birth proceeds (the transition's `from` records the prior
   * state).
   */
  async birthQueued(input: BirthAgentInput): Promise<void> {
    const previous = await this.latestState(input.key);
    if (previous === 'init' || previous === 'running' || previous === 'pr_open') return;
    await this.upsertAgent({
      key: input.key,
      projectName: input.projectName,
      ticketTitle: input.ticketTitle,
      worktreePath: input.worktreePath,
      branch: input.branch,
      appUrl: input.appUrl ?? null,
    });
    await this.writeBirthTransition(input.key, 'queued', 'enqueue', previous);
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

  /**
   * CREW-308 — record an early preflight-gate death as a visible `error` row.
   * Called by the CLI (via `POST /api/runner/early-failure`) when a
   * tool/gh-auth/worktree gate fails, *before* the process exits. The agent row
   * was normally already birthed as `init` by `recordInitializing` (Task 5), so
   * this is a transition write; the `upsertAgent` is a fallback for the rare
   * case that birth call was lost to a downed daemon. It never regresses a run
   * that already advanced past the early gate — a birth (`init`/`queued`) or a
   * re-run over an `idle`/`orphaned` row settles to `error`, but a live
   * (`running`/`pr_open`) or terminal (`pr_merged`/`finished`/`error`) run is
   * left alone (also makes a duplicate call idempotent). In the real flow the
   * gate always runs pre-spawn, so `previous` is `null`/`queued`/`init`; the
   * guard just makes future misuse safe. The failure `phase`/`summary` ride on
   * the startup log the CLI wrote — the transition just carries the state.
   */
  async recordEarlyFailure(input: EarlyFailureInput): Promise<void> {
    await this.upsertAgent({
      key: input.key,
      projectName: input.projectName,
      ticketTitle: input.ticketTitle,
      worktreePath: input.worktreePath,
      branch: input.branch,
      appUrl: input.appUrl ?? null,
    });
    const previous = await this.latestState(input.key);
    const advanced: StateTransitionsTable['to_state'][] = [
      'running',
      'pr_open',
      'pr_merged',
      'finished',
      'error',
    ];
    if (previous !== null && advanced.includes(previous)) return;
    await this.writeBirthTransition(input.key, 'error', 'startup-failure', previous);
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
  private async latestState(agentKey: string): Promise<StateTransitionsTable['to_state'] | null> {
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
   * CREW-307 — write a birth/settle transition (`queued`/`init`, or `error` for
   * an early-gate death — CREW-308) + publish the `agent.state_changed` SSE. The
   * row-birth counterpart to `IngestService`'s transition writers.
   *
   * It does **not** update `IngestService`'s in-memory `agentStateCache`. For a
   * brand-new key — the common birth case — that is fully coherent: ingest
   * lazily loads from the DB on first touch, so it reads this birth row. For a
   * re-run of a key whose prior run ingest already cached, the cache can hold a
   * stale terminal state until the daemon restarts — a **pre-existing** re-run
   * cache limitation independent of birth (the cache was never invalidated on
   * re-run), tracked in `docs/followups/daemon-cli-dispatch.md`.
   */
  private async writeBirthTransition(
    agentKey: string,
    to: 'queued' | 'init' | 'error',
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
