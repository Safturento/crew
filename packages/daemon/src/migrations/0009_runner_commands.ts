import { sql, type Kysely } from 'kysely';

/**
 * 0009 adds the `runner_commands` reverse-command queue (CREW-241 / Epic
 * CREW-235).
 *
 * Control flows from the operator back to the host runner through this
 * persisted queue: the dashboard/daemon enqueues a command, the runner
 * drains pending rows each heartbeat cycle, signals the tracked process
 * group (or settles a pending action), and reports the result. The `status`
 * column walks `pending → claimed → applied | failed`, and each transition
 * publishes a `runner.command_changed` SSE event from `RunnerCommandsService`.
 *
 * `agent_key` is nullable: queue-level kinds like `dequeue` target a pending
 * action request rather than a live process, so they carry no agent key.
 * `payload` is an optional JSON envelope (the steering message for
 * `message`/`resume`); `error` is set only on the `failed` terminal status.
 *
 * The CHECK constraints mirror the `RUNNER_COMMAND_KINDS` /
 * `RUNNER_COMMAND_STATUSES` tuples in `crew-shared` — keep them in sync if
 * the contract grows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS runner_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT,
      kind TEXT NOT NULL CHECK (
        kind IN ('cancel_soft', 'cancel_hard', 'dequeue', 'reap', 'pause', 'resume', 'message')
      ),
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'claimed', 'applied', 'failed')),
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS runner_commands_status
      ON runner_commands (status)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS runner_commands_status`.execute(db);
  await sql`DROP TABLE IF EXISTS runner_commands`.execute(db);
}
