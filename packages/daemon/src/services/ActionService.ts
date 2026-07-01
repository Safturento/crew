import type { Kysely, Selectable } from 'kysely';
import type { Logger } from 'pino';
import {
  worktreePathFor,
  type ActionPayload,
  type ActionRequest,
  type ActionStatus,
  type EnqueueAction,
} from 'crew-shared';
import type { ActionRequestsTable, DaemonDatabase } from '../db.js';
import { NotFoundError } from '../errors.js';
import type { EventBus } from './EventBus.js';

/** The non-pending, non-claimed statuses the host runner reports back. */
export type ReportStatus = Extract<ActionStatus, 'launching' | 'launched' | 'failed'>;

/**
 * Narrow slices of the collaborators `enqueue` needs to birth the `queued`
 * agent row (CREW-307). Defined here (structural) so unit tests can stub them
 * without dragging the full ProjectsService / RunFailureService in.
 */
export interface ProjectRepoResolver {
  getBySlug(slug: string): { repo_path: string };
}
export interface QueuedRowBirther {
  birthQueued(input: {
    key: string;
    projectName: string;
    worktreePath: string;
    branch: string;
  }): Promise<void>;
}

export interface ActionServiceDeps {
  db: Kysely<DaemonDatabase>;
  eventBus: EventBus;
  /**
   * CREW-307 row-birth collaborators. Optional so the queue-mechanics unit
   * tests need not wire them; production (`container.ts`) always injects both,
   * so a `kind:'run'` enqueue births a `queued` agent row. When absent, birth
   * is skipped and the run is still enqueued (pre-CREW-307 behavior).
   */
  projects?: ProjectRepoResolver;
  runFailure?: QueuedRowBirther;
  logger?: Logger;
}

/**
 * Owns the queued-action lifecycle for dashboard-triggered agent actions
 * (CREW-214). The dashboard `enqueue`s a request, the host runner
 * `claimNextPending` (atomically, so a request is never double-claimed),
 * runs the matching CLI verb, then `report`s the launch outcome. Every
 * transition publishes an `action.changed` SSE event so the dashboard can
 * reflect status without polling.
 *
 * Routes are thin wrappers over these methods — all the queue logic lives
 * here, per the daemon's route/service split.
 */
export class ActionService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly eventBus: EventBus;
  private readonly projects: ProjectRepoResolver | undefined;
  private readonly runFailure: QueuedRowBirther | undefined;
  private readonly logger: Logger | undefined;

  constructor(deps: ActionServiceDeps) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
    this.projects = deps.projects;
    this.runFailure = deps.runFailure;
    this.logger = deps.logger;
  }

  /** Insert a `pending` request, emit `action.changed`, return the row. */
  async enqueue(input: EnqueueAction): Promise<ActionRequest> {
    const payload = toPayload(input);
    const now = new Date().toISOString();
    const inserted = await this.db
      .insertInto('action_requests')
      .values({
        kind: input.kind,
        ticket_key: input.ticketKey,
        project: input.project,
        payload: JSON.stringify(payload),
        status: 'pending',
        error: null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const action = rowToActionRequest(inserted);
    this.publish(action);
    // CREW-307: a fresh run is born visible in the grid as `queued` the moment
    // it is requested — before the runner has claimed it. Only `kind:'run'`
    // births a row: fix_pr/finish/resume target an existing agent, so re-birthing
    // would clobber its live state.
    if (input.kind === 'run') await this.birthQueuedRow(input.ticketKey, input.project);
    return action;
  }

  /**
   * Birth the `queued` agent row for a run enqueue. Best-effort: a failure to
   * resolve the project or write the row is logged but never fails the enqueue
   * — the action is already queued and the runner will still pick it up.
   */
  private async birthQueuedRow(key: string, project: string): Promise<void> {
    if (!this.projects || !this.runFailure) return;
    try {
      const { repo_path } = this.projects.getBySlug(project);
      const worktreePath = worktreePathFor(repo_path, key);
      await this.runFailure.birthQueued({ key, projectName: project, worktreePath, branch: key });
    } catch (err) {
      this.logger?.warn({ err, key, project }, 'queued-row birth failed; run still enqueued');
    }
  }

  /**
   * Atomically claim the oldest `pending` request, flipping it to `claimed`.
   * Returns `null` when the queue is empty. The claim runs inside a
   * transaction and the `UPDATE` re-asserts `status = 'pending'` in its
   * `WHERE`, so two racing claims can never both win the same row — the
   * loser's update matches zero rows and yields `null`.
   */
  async claimNextPending(): Promise<ActionRequest | null> {
    const claimed = await this.db.transaction().execute(async (trx) => {
      const next = await trx
        .selectFrom('action_requests')
        .select('id')
        .where('status', '=', 'pending')
        .orderBy('id', 'asc')
        .limit(1)
        .executeTakeFirst();
      if (!next) return null;

      const updated = await trx
        .updateTable('action_requests')
        .set({ status: 'claimed', updated_at: new Date().toISOString() })
        .where('id', '=', next.id)
        .where('status', '=', 'pending')
        .returningAll()
        .executeTakeFirst();
      return updated ?? null;
    });

    if (!claimed) return null;
    const action = rowToActionRequest(claimed);
    this.publish(action);
    return action;
  }

  /**
   * Record a host-side launch outcome (`launching` / `launched` / `failed`)
   * and emit `action.changed`. `error` is persisted only for `failed`.
   * Throws `NotFoundError` (→ HTTP 404) when the id is unknown.
   */
  async report(id: number, status: ReportStatus, error?: string): Promise<void> {
    const updated = await this.db
      .updateTable('action_requests')
      .set({
        status,
        error: status === 'failed' ? (error ?? null) : null,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw new NotFoundError('action_not_found', { resource: 'action', id: String(id) });
    }
    this.publish(rowToActionRequest(updated));
  }

  private publish(action: ActionRequest): void {
    this.eventBus.publish({
      type: 'action.changed',
      data: {
        id: action.id,
        kind: action.kind,
        key: action.ticketKey,
        status: action.status,
      },
    });
  }
}

/** Build the per-kind JSON payload stored alongside the request envelope. */
function toPayload(input: EnqueueAction): ActionPayload {
  if (input.kind === 'fix_pr') return { kind: 'fix_pr', comment: input.comment };
  return { kind: input.kind };
}

/** Map a DB row to the wire `ActionRequest`, parsing the JSON payload. */
function rowToActionRequest(row: Selectable<ActionRequestsTable>): ActionRequest {
  return {
    id: row.id,
    kind: row.kind,
    ticketKey: row.ticket_key,
    project: row.project,
    payload: JSON.parse(row.payload) as ActionPayload,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
