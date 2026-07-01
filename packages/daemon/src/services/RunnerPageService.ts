import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type {
  EndedKind,
  EndedRunView,
  FailedStartView,
  QueuedActionView,
  ReconcileRollup,
  RunFailure,
  RunRef,
  RunnerCommandName,
  RunnerPage,
} from 'crew-shared';
import type { DaemonDatabase } from '../db.js';
import type { AgentsService, AgentState } from './AgentsService.js';

export interface RunnerPageServiceDeps {
  db: Kysely<DaemonDatabase>;
  /**
   * Reused by `reconcile()` for its state derivation — the roll-up filters
   * `list()` by state (the `activeTicketKeys` pattern) rather than
   * reimplementing the terminal/override guards.
   */
  agentsService: AgentsService;
}

/** The housekeeping states the reconcile roll-up buckets. */
const RECONCILE_STATES = new Set<AgentState>(['queued', 'orphaned']);

/** Cap on the recently-ended history list — the most recent terminal runs. */
const RECENTLY_ENDED_LIMIT = 50;

/** ActionKind (`fix_pr`) → RunnerCommandName (`fix-pr`); others pass through. */
function actionKindToCommand(kind: string): RunnerCommandName {
  return kind === 'fix_pr' ? 'fix-pr' : (kind as RunnerCommandName);
}

/** Parse the trailing PR number out of a `.../pull/<n>` GitHub URL. */
function prNumberFromUrl(prUrl: string): number | undefined {
  const m = /\/pull\/(\d+)/.exec(prUrl);
  return m ? Number(m[1]) : undefined;
}

/**
 * Read-only Runner-page data surface (Epic CREW-249 / T2). Backs
 * `GET /api/runner/page` with the three sections that shipped stubbed in
 * CREW-245:
 *
 * - `failedToStart` — unacknowledged `failed-start` runs (the attention queue;
 *   `RunFailureService` owns the write + acknowledge side).
 * - `queued` — pending `action_requests`, a **read-only** view distinct from
 *   `GET /api/actions/pending`, which *claims*.
 * - `recentlyEnded` — terminal runs ordered by `completed_at desc`, limited.
 *
 * All three are plain Kysely reads joined to `agents` for the project label;
 * the service holds no state, matching the other DB-backed query services.
 */
export class RunnerPageService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly agentsService: AgentsService;

  constructor(deps: RunnerPageServiceDeps) {
    this.db = deps.db;
    this.agentsService = deps.agentsService;
  }

  /**
   * CREW-310 (plan task D): the housekeeping roll-up backing
   * `GET /api/runner/reconcile` — every agent whose *derived* state is
   * `queued` or `orphaned`, across all projects, bucketed. Reuses
   * `AgentsService.list()` for derivation (the `activeTicketKeys` pattern) so
   * the terminal/override guards aren't reimplemented, then joins each match's
   * latest `state_transitions.ts` for `since` (the moment it entered the
   * state — `startedAt` is empty for a queued agent that has no run row yet).
   * `running` (and every other state) is excluded. This is the read surface the
   * dashboard supervisor drawer (F) and runner chip badge (E) consume.
   */
  async reconcile(): Promise<ReconcileRollup> {
    const matches = (await this.agentsService.list()).filter((a) => RECONCILE_STATES.has(a.state));
    if (matches.length === 0) return { queued: [], orphaned: [] };

    const sinceByKey = await this.sinceByKey(matches.map((a) => a.key));

    const refs: RunRef[] = matches.map((a) => ({
      key: a.key,
      projectName: a.projectName,
      state: a.state as RunRef['state'],
      since: sinceByKey.get(a.key) ?? a.startedAt,
    }));
    // Oldest-waiting first, so the longest-queued / oldest-orphan tops the drawer.
    refs.sort((x, y) => x.since.localeCompare(y.since));

    return {
      queued: refs.filter((r) => r.state === 'queued'),
      orphaned: refs.filter((r) => r.state === 'orphaned'),
    };
  }

  /**
   * Latest `state_transitions.ts` per key, as an ISO string — the timestamp
   * the agent entered its current (queued/orphaned) state. `MAX(ts)` is the
   * entry into the newest state, which is the one `list()` derived.
   */
  private async sinceByKey(keys: string[]): Promise<Map<string, string>> {
    const rows = await this.db
      .selectFrom('state_transitions')
      .select(['agent_key', sql<number>`MAX(ts)`.as('ts')])
      .where('agent_key', 'in', keys)
      .groupBy('agent_key')
      .execute();
    return new Map(rows.map((r) => [r.agent_key, new Date(Number(r.ts)).toISOString()]));
  }

  async getPage(): Promise<RunnerPage> {
    const [failedToStart, queued, recentlyEnded] = await Promise.all([
      this.getFailedToStart(),
      this.getQueued(),
      this.getRecentlyEnded(),
    ]);
    return { failedToStart, queued, recentlyEnded };
  }

  private async getFailedToStart(): Promise<FailedStartView[]> {
    const rows = await this.db
      .selectFrom('runs')
      .innerJoin('agents', 'agents.key', 'runs.agent_key')
      .select([
        'runs.agent_key as key',
        'runs.command as command',
        'agents.project_name as project',
        'runs.completed_at as completed_at',
        'runs.failure_check as failure_check',
        'runs.failure_headline as failure_headline',
        'runs.failure_remediation as failure_remediation',
        'runs.failure_output as failure_output',
      ])
      .where('runs.status', '=', 'failed-start')
      .where('runs.acknowledged', '=', 0)
      .orderBy('runs.completed_at', 'desc')
      .execute();

    return rows.map((r) => ({
      key: r.key,
      command: r.command,
      project: r.project,
      // A failed-start always carries a completed_at; fall back to '' for the
      // (impossible) null so the wire shape stays a string.
      failedAt: r.completed_at ?? '',
      failure: this.toFailure(r),
    }));
  }

  private async getQueued(): Promise<QueuedActionView[]> {
    const rows = await this.db
      .selectFrom('action_requests')
      .select(['ticket_key', 'kind', 'project', 'created_at'])
      .where('status', '=', 'pending')
      .orderBy('id', 'asc') // FIFO — oldest queued first.
      .execute();

    return rows.map((r) => ({
      key: r.ticket_key,
      command: actionKindToCommand(r.kind),
      project: r.project,
      queuedAt: r.created_at,
    }));
  }

  private async getRecentlyEnded(): Promise<EndedRunView[]> {
    const rows = await this.db
      .selectFrom('runs')
      .innerJoin('agents', 'agents.key', 'runs.agent_key')
      .select([
        'runs.agent_key as key',
        'runs.command as command',
        'agents.project_name as project',
        'agents.pr_url as pr_url',
        'runs.completed_at as completed_at',
        'runs.exit_code as exit_code',
        'runs.status as status',
        'runs.failure_check as failure_check',
        'runs.failure_headline as failure_headline',
        'runs.failure_remediation as failure_remediation',
        'runs.failure_output as failure_output',
      ])
      .where('runs.completed_at', 'is not', null)
      .orderBy('runs.completed_at', 'desc')
      .limit(RECENTLY_ENDED_LIMIT)
      .execute();

    return rows.map((r) => {
      const kind = endedKind(r.status, r.exit_code);
      const view: EndedRunView = {
        key: r.key,
        command: r.command,
        project: r.project,
        endedAt: r.completed_at ?? '',
        kind,
      };
      if (kind === 'finished' && r.pr_url) {
        view.prUrl = r.pr_url;
        const n = prNumberFromUrl(r.pr_url);
        if (n !== undefined) view.prNumber = n;
      }
      if (r.failure_check !== null) view.failure = this.toFailure(r);
      return view;
    });
  }

  /** Assemble the `RunFailure` from a row's `failure_*` columns. */
  private toFailure(r: {
    failure_check: string | null;
    failure_headline: string | null;
    failure_remediation: string | null;
    failure_output: string | null;
  }): RunFailure {
    return {
      check: r.failure_check ?? '',
      headline: r.failure_headline ?? '',
      remediation: r.failure_remediation ?? '',
      output: r.failure_output ?? '',
    };
  }
}

/**
 * Classify a terminal run for the history pill. `failed-start` is explicit on
 * the row; otherwise the legacy derivation applies — exit 0 finished, non-zero
 * errored, and a null exit on a completed run reads as cancelled.
 */
function endedKind(status: string | null, exitCode: number | null): EndedKind {
  if (status === 'failed-start') return 'failed-start';
  if (exitCode === 0) return 'finished';
  if (exitCode === null) return 'cancelled';
  return 'error';
}
