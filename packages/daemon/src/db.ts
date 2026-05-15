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

export interface AgentsTable {
  key: string;
  project_name: string;
  ticket_title: string | null;
  worktree_path: string;
  branch: string | null;
  pr_url: string | null;
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
  from_state: 'init' | 'running' | 'pr_open' | 'error' | 'finished' | 'idle' | 'waiting' | null;
  to_state: 'init' | 'running' | 'pr_open' | 'error' | 'finished' | 'idle' | 'waiting';
  ts: number;
}

export interface DaemonDatabase {
  agents: AgentsTable;
  runs: RunsTable;
  tool_calls: ToolCallsTable;
  state_transitions: StateTransitionsTable;
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
