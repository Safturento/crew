import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0003_run_metrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const METRIC_COLUMNS = [
  'doc_load_coverage_pct',
  'cleanliness_pass',
  'pr_claim_input_tokens',
  'parity_violations',
  'baseline',
];

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0003-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

async function runsColumns(db: Kysely<DaemonDatabase>): Promise<string[]> {
  const cols = await sql<{ name: string }>`PRAGMA table_info(runs)`.execute(db);
  return cols.rows.map((c) => c.name);
}

describe('migration 0003 — run_metrics', () => {
  it('adds the five metric columns to runs', async () => {
    const db = await freshDb();
    try {
      const names = await runsColumns(db);
      for (const col of METRIC_COLUMNS) {
        expect(names).toContain(col);
      }
    } finally {
      await db.destroy();
    }
  });

  it('defaults baseline to 0 for a freshly inserted run', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-1',
          project_name: 'demo',
          ticket_title: 'Demo',
          worktree_path: '/x',
          branch: 'KAN-1',
          pr_url: null,
          created_at: '2026-05-13T12:00:00Z',
        })
        .execute();
      await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-1',
          command: 'run',
          session_id: 's1',
          started_at: '2026-05-13T12:00:00Z',
          completed_at: null,
          exit_code: null,
        })
        .execute();
      const row = await db
        .selectFrom('runs')
        .select(['baseline', 'doc_load_coverage_pct'])
        .executeTakeFirstOrThrow();
      expect(row.baseline).toBe(0);
      expect(row.doc_load_coverage_pct).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('rolls back cleanly — down() drops every metric column', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      const names = await runsColumns(db);
      for (const col of METRIC_COLUMNS) {
        expect(names).not.toContain(col);
      }
      // The pre-existing columns survive the rollback.
      expect(names).toContain('agent_key');
      expect(names).toContain('session_id');
    } finally {
      await db.destroy();
    }
  });
});
