import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import SqliteDatabase from 'better-sqlite3';
import {
  Kysely,
  SqliteDialect,
  Migrator,
  FileMigrationProvider,
  type Generated,
  type MigrationResultSet,
} from 'kysely';
import type { ActionKind, ActionStatus, RunnerCommandKind, RunnerCommandStatus } from 'crew-shared';

export interface AgentsTable {
  key: string;
  project_name: string;
  ticket_title: string | null;
  worktree_path: string;
  branch: string | null;
  pr_url: string | null;
  /** Per-worktree browsable app URL passed by the CLI at run registration
   *  (CREW-233). Null for pre-0008 agents / registrations that omit it —
   *  AgentsService.getByKey falls back to `deriveAppUrl(cfg)`. */
  app_url: string | null;
  created_at: string;
}

export interface RunsTable {
  id: Generated<number>;
  agent_key: string;
  command: 'run' | 'fix-pr' | 'finish';
  session_id: string;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
  // Layer-1 metrics — added by migration 0003 (CREW-164).
  doc_load_coverage_pct: number | null;
  cleanliness_pass: number | null;
  pr_claim_input_tokens: number | null;
  parity_violations: number | null;
  baseline: Generated<number>; // 0 | 1; DB default 0
}

export interface ToolCallsTable {
  id: Generated<number>;
  run_id: number;
  tool_name: string;
  input_summary: string | null;
  output_tokens: number;
  input_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  occurred_at: string;
}

/** Slice 1c: one row per derived agent-state flip. CHECK on `to_state` is
 *  forward-compatible — `idle` and `waiting` are allowed even though slice 1c
 *  never emits them. `from_state` is null on the very first row for an agent. */
export interface StateTransitionsTable {
  id: Generated<number>;
  agent_key: string;
  from_state:
    | 'init'
    | 'running'
    | 'pr_open'
    | 'pr_merged'
    | 'error'
    | 'finished'
    | 'idle'
    | 'waiting'
    | null;
  to_state:
    | 'init'
    | 'running'
    | 'pr_open'
    | 'pr_merged'
    | 'error'
    | 'finished'
    | 'idle'
    | 'waiting';
  ts: number;
}

/** CREW-201: per-phase startup events captured by the CLI's dispatch flow.
 *  Insert path: IngestService.ingestStartupEvent (chokidar watcher on
 *  ~/.crew/startup/<key>.jsonl). Read path: AgentsService.getTimeline
 *  merges started+terminal pairs into StartupPhaseRow per phase. */
export interface StartupEventsTable {
  id: Generated<number>;
  agent_key: string;
  subtype: string;
  status: 'started' | 'completed' | 'failed';
  ts: number;
  summary: string;
  duration_ms: number | null;
  log_path: string | null;
}

/** CREW-215: one row per `crew finish` step, fed by
 *  POST /api/agents/:key/finish-step and read back as an ordered checklist
 *  by the dashboard drawer. `idx` is the step ordinal (wire field `index`);
 *  `ts` is epoch-ms. */
export interface FinishStepsTable {
  id: Generated<number>;
  agent_key: string;
  idx: number;
  label: string;
  status: 'ok' | 'skip' | 'error';
  detail: string | null;
  ts: number;
}
/** CREW-214: queued dashboard-triggered actions, drained by the host runner.
 *  Insert/transition path: ActionService (enqueue → claim → report), each
 *  flip publishing an `action.changed` SSE event. `payload` is the per-kind
 *  JSON envelope (e.g. the `fix_pr` review comment); `error` is set only on
 *  the `failed` terminal status. See migration 0006. */
export interface ActionRequestsTable {
  id: Generated<number>;
  kind: ActionKind;
  ticket_key: string;
  project: string;
  payload: Generated<string>; // JSON ActionPayload; DB default '{}'
  status: Generated<ActionStatus>; // DB default 'pending'
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** CREW-241: reverse-command queue drained by the host runner, the control
 *  half of runner parity (Epic CREW-235). Insert/transition path:
 *  RunnerCommandsService (enqueue → claimPending → reportResult), each flip
 *  publishing a `runner.command_changed` SSE event. `agent_key` is null for
 *  queue-level kinds (`dequeue`); `payload` is an optional JSON envelope;
 *  `error` is set only on the `failed` terminal status. See migration 0009. */
export interface RunnerCommandsTable {
  id: Generated<number>;
  agent_key: string | null;
  kind: RunnerCommandKind;
  payload: string | null; // JSON RunnerCommandPayload or null
  status: Generated<RunnerCommandStatus>; // DB default 'pending'
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DaemonDatabase {
  agents: AgentsTable;
  runs: RunsTable;
  tool_calls: ToolCallsTable;
  state_transitions: StateTransitionsTable;
  startup_events: StartupEventsTable;
  finish_steps: FinishStepsTable;
  action_requests: ActionRequestsTable;
  runner_commands: RunnerCommandsTable;
}

/**
 * Open a Kysely-backed SQLite database. Pass `:memory:` for tests.
 * Callers own the lifetime — call `db.destroy()` to close the underlying
 * better-sqlite3 handle.
 */
export function createDb(dbFile: string): Kysely<DaemonDatabase> {
  return new Kysely<DaemonDatabase>({
    dialect: new SqliteDialect({
      database: new SqliteDatabase(dbFile),
    }),
  });
}

// Vitest co-locates `.test.ts` next to the migration it covers; tsx runs the
// daemon straight off the same `src/migrations/` folder. Kysely's stock
// FileMigrationProvider tries to dynamic-import every file in the folder, so
// stripping test files here protects both the in-process test and the prod
// boot path from loading them as migrations.
function isMigrationFile(name: string): boolean {
  return /\.(?:m?js|m?ts)$/.test(name) && !/\.(?:d|test)\.(?:m?ts|m?js)$/.test(name);
}

/**
 * Run any pending migrations from `migrationsPath` to the latest version.
 * Returns the list of applied migration results (empty when the folder
 * contains no migrations). Throws if any migration fails.
 */
export async function runMigrations(
  db: Kysely<DaemonDatabase>,
  migrationsPath: string,
): Promise<NonNullable<MigrationResultSet['results']>> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs: {
        readdir: async (folder) => {
          const entries = await fs.readdir(folder);
          return entries.filter(isMigrationFile);
        },
      },
      path,
      migrationFolder: migrationsPath,
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return results ?? [];
}
