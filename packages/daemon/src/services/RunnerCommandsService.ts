import type { Kysely, Selectable } from 'kysely';
import type { RunnerCommand, RunnerCommandKind, RunnerCommandPayload } from 'crew-shared';
import type { DaemonDatabase, RunnerCommandsTable } from '../db.js';
import type { EventBus } from './EventBus.js';

/** The terminal statuses the host runner reports back after applying. */
export type ReportResultStatus = Extract<RunnerCommand['status'], 'applied' | 'failed'>;

export interface EnqueueRunnerCommand {
  agentKey: string | null;
  kind: RunnerCommandKind;
  payload: RunnerCommandPayload | null;
}

export interface RunnerCommandsServiceDeps {
  db: Kysely<DaemonDatabase>;
  eventBus: EventBus;
}

/**
 * Owns the reverse-command queue lifecycle (CREW-241 / Epic CREW-235). The
 * operator `enqueue`s a control command (cancel / dequeue / ...), the host
 * runner `claimPending` (atomically, so a command is never double-claimed)
 * each heartbeat cycle, applies it against the tracked process group, then
 * `reportResult`s the outcome. Every transition publishes a
 * `runner.command_changed` SSE event so the dashboard reflects progress
 * without polling.
 *
 * Routes are thin wrappers over these methods — all the queue logic lives
 * here, per the daemon's route/service split. Mirrors `ActionService`.
 */
export class RunnerCommandsService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly eventBus: EventBus;

  constructor(deps: RunnerCommandsServiceDeps) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
  }

  /** Insert a `pending` command, emit `runner.command_changed`, return the row. */
  async enqueue(input: EnqueueRunnerCommand): Promise<RunnerCommand> {
    const now = new Date().toISOString();
    const inserted = await this.db
      .insertInto('runner_commands')
      .values({
        agent_key: input.agentKey,
        kind: input.kind,
        payload: input.payload ? JSON.stringify(input.payload) : null,
        status: 'pending',
        error: null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const command = rowToRunnerCommand(inserted);
    this.publish(command);
    return command;
  }

  /**
   * Atomically claim the oldest `pending` command, flipping it to `claimed`.
   * Returns `null` when the queue is empty. The claim runs inside a
   * transaction and the `UPDATE` re-asserts `status = 'pending'` in its
   * `WHERE`, so two racing claims can never both win the same row — the
   * loser's update matches zero rows and yields `null`. Mirrors
   * `ActionService.claimNextPending`.
   */
  async claimPending(): Promise<RunnerCommand | null> {
    const claimed = await this.db.transaction().execute(async (trx) => {
      const next = await trx
        .selectFrom('runner_commands')
        .select('id')
        .where('status', '=', 'pending')
        .orderBy('id', 'asc')
        .limit(1)
        .executeTakeFirst();
      if (!next) return null;

      const updated = await trx
        .updateTable('runner_commands')
        .set({ status: 'claimed', updated_at: new Date().toISOString() })
        .where('id', '=', next.id)
        .where('status', '=', 'pending')
        .returningAll()
        .executeTakeFirst();
      return updated ?? null;
    });

    if (!claimed) return null;
    const command = rowToRunnerCommand(claimed);
    this.publish(command);
    return command;
  }

  /**
   * Record the apply outcome (`applied` / `failed`) and emit
   * `runner.command_changed`. `error` is persisted only for `failed`.
   */
  async reportResult(id: number, status: ReportResultStatus, error?: string): Promise<void> {
    const updated = await this.db
      .updateTable('runner_commands')
      .set({
        status,
        error: status === 'failed' ? (error ?? null) : null,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (!updated) return;
    this.publish(rowToRunnerCommand(updated));
  }

  private publish(command: RunnerCommand): void {
    this.eventBus.publish({
      type: 'runner.command_changed',
      data: { id: command.id, status: command.status },
    });
  }
}

/** Map a DB row to the wire `RunnerCommand`, parsing the JSON payload. */
function rowToRunnerCommand(row: Selectable<RunnerCommandsTable>): RunnerCommand {
  return {
    id: row.id,
    agentKey: row.agent_key,
    kind: row.kind,
    payload: row.payload ? (JSON.parse(row.payload) as RunnerCommandPayload) : null,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
