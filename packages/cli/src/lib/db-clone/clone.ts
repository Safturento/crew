import { execa } from 'execa';
import { setTimeout as delay } from 'node:timers/promises';
import { findComposeContainer } from '../docker/compose.js';
import { buildRequiredTablesQuery, buildTruncateSql, filterTablesForTruncate } from './sql.js';

export interface DbCloneSettings {
  postgres_service: string;
  postgres_user: string;
  postgres_database: string;
  required_tables: string[];
  exclude_tables: string[];
}

export interface DbCloneOptions {
  canonicalProject: string;
  targetProject: string;
  settings: DbCloneSettings;
  pollIntervalMs?: number;
  timeoutMs?: number;
  log?: (msg: string) => void;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Clone postgres data from a canonical worktree's stack into a target
 * worktree's stack. Both stacks must already be running. The target's tables
 * are truncated first; then `pg_dump --data-only --disable-triggers` is
 * piped from canonical into psql on target.
 */
export async function runDbClone(opts: DbCloneOptions): Promise<void> {
  const {
    canonicalProject,
    targetProject,
    settings,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    log = () => {},
  } = opts;

  const canonicalContainer = await findComposeContainer(
    canonicalProject,
    settings.postgres_service,
  );
  if (!canonicalContainer) {
    throw new Error(
      `canonical postgres container is not running for project '${canonicalProject}' (service '${settings.postgres_service}'). bring it up with: docker compose up -d`,
    );
  }
  log(`canonical postgres: ${canonicalContainer}`);

  const targetContainer = await findComposeContainer(targetProject, settings.postgres_service);
  if (!targetContainer) {
    throw new Error(
      `target postgres container is not running for project '${targetProject}' (service '${settings.postgres_service}'). bring it up first.`,
    );
  }
  log(`target postgres:    ${targetContainer}`);

  if (settings.required_tables.length > 0) {
    log(`waiting for tables: ${settings.required_tables.join(', ')}`);
    await waitForTables(targetContainer, settings, pollIntervalMs, timeoutMs);
    log('migrations ready');
  }

  const tables = await listPublicTables(targetContainer, settings);
  const truncatable = filterTablesForTruncate(tables, settings.exclude_tables);
  const truncateSql = buildTruncateSql(truncatable);
  if (truncateSql) {
    log(`truncating ${truncatable.length} table(s)`);
    await psqlExec(targetContainer, settings, truncateSql);
  } else {
    log('no tables to truncate');
  }

  log(`pg_dump → psql piping`);
  await pipePgDumpToPsql(canonicalContainer, targetContainer, settings);
  log('clone complete');
}

async function waitForTables(
  containerId: string,
  settings: DbCloneSettings,
  pollIntervalMs: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const query = buildRequiredTablesQuery(settings.required_tables);
  const expected = settings.required_tables.length;

  while (true) {
    const { stdout } = await execa('docker', [
      'exec',
      containerId,
      'psql',
      '-U',
      settings.postgres_user,
      '-d',
      settings.postgres_database,
      '-tAc',
      query,
    ]);
    const count = parseInt(stdout.trim(), 10);
    if (count === expected) return;

    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for migration tables (${count}/${expected} present): ${settings.required_tables.join(', ')}`,
      );
    }
    await delay(pollIntervalMs);
  }
}

async function listPublicTables(containerId: string, settings: DbCloneSettings): Promise<string[]> {
  const { stdout } = await execa('docker', [
    'exec',
    containerId,
    'psql',
    '-U',
    settings.postgres_user,
    '-d',
    settings.postgres_database,
    '-tAc',
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;",
  ]);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function psqlExec(
  containerId: string,
  settings: DbCloneSettings,
  sql: string,
): Promise<void> {
  await execa('docker', [
    'exec',
    containerId,
    'psql',
    '-U',
    settings.postgres_user,
    '-d',
    settings.postgres_database,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);
}

async function pipePgDumpToPsql(
  canonicalContainer: string,
  targetContainer: string,
  settings: DbCloneSettings,
): Promise<void> {
  const excludeArgs = settings.exclude_tables.map((p) => `--exclude-table=${p}`);

  const pgDump = execa(
    'docker',
    [
      'exec',
      canonicalContainer,
      'pg_dump',
      '--data-only',
      '--disable-triggers',
      ...excludeArgs,
      '-U',
      settings.postgres_user,
      settings.postgres_database,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const psql = execa(
    'docker',
    [
      'exec',
      '-i',
      targetContainer,
      'psql',
      '-U',
      settings.postgres_user,
      '-d',
      settings.postgres_database,
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { stdin: pgDump.stdout, stderr: 'pipe' },
  );

  const [pgDumpResult, psqlResult] = await Promise.all([pgDump, psql]);

  if ((pgDumpResult.exitCode ?? 0) !== 0) {
    throw new Error(
      `pg_dump exited with code ${pgDumpResult.exitCode}: ${pgDumpResult.stderr ?? ''}`.trim(),
    );
  }
  if ((psqlResult.exitCode ?? 0) !== 0) {
    throw new Error(
      `psql exited with code ${psqlResult.exitCode}: ${psqlResult.stderr ?? ''}`.trim(),
    );
  }
}
