import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('agents')
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('project_name', 'text', (col) => col.notNull())
    .addColumn('ticket_title', 'text')
    .addColumn('worktree_path', 'text', (col) => col.notNull())
    .addColumn('branch', 'text')
    .addColumn('pr_url', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('runs')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('agent_key', 'text', (col) => col.notNull().references('agents.key'))
    .addColumn('command', 'text', (col) =>
      col.notNull().check(sql`command IN ('run','fix-pr','finish')`),
    )
    .addColumn('session_id', 'text', (col) => col.notNull().unique())
    .addColumn('started_at', 'text', (col) => col.notNull())
    .addColumn('completed_at', 'text')
    .addColumn('exit_code', 'integer')
    .execute();

  await db.schema.createIndex('idx_runs_agent_key').on('runs').column('agent_key').execute();

  await db.schema
    .createTable('tool_calls')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('run_id', 'integer', (col) => col.notNull().references('runs.id'))
    .addColumn('tool_name', 'text', (col) => col.notNull())
    .addColumn('input_summary', 'text')
    .addColumn('output_tokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('input_tokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('cache_read_tokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('cache_creation_tokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('occurred_at', 'text', (col) => col.notNull())
    .execute();

  await db.schema.createIndex('idx_tool_calls_run_id').on('tool_calls').column('run_id').execute();

  // Idempotency for daemon-restart recovery: the same (run, occurred_at,
  // tool_name) tuple should never be ingested twice. INSERT OR IGNORE in
  // IngestService relies on this index.
  await db.schema
    .createIndex('uniq_tool_calls_run_event')
    .unique()
    .on('tool_calls')
    .columns(['run_id', 'occurred_at', 'tool_name'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tool_calls').execute();
  await db.schema.dropTable('runs').execute();
  await db.schema.dropTable('agents').execute();
}
