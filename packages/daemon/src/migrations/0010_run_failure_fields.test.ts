import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0010_run_failure_fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0010-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0010 — run failure fields', () => {
  it('adds the failure + status + acknowledged columns to runs', async () => {
    const db = await freshDb();
    try {
      const cols = await sql<{ name: string }>`
        PRAGMA table_info(runs)
      `.execute(db);
      const names = cols.rows.map((c) => c.name);
      expect(names).toContain('status');
      expect(names).toContain('failure_check');
      expect(names).toContain('failure_headline');
      expect(names).toContain('failure_remediation');
      expect(names).toContain('failure_output');
      expect(names).toContain('acknowledged');
    } finally {
      await db.destroy();
    }
  });

  it('round-trips a failed-start run with its diagnosis', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'CREW-9',
          project_name: 'crew',
          ticket_title: null,
          worktree_path: '/tmp/crew-9',
          branch: 'CREW-9',
          pr_url: null,
          app_url: null,
          created_at: '2026-06-17T00:00:00.000Z',
        })
        .execute();
      await db
        .insertInto('runs')
        .values({
          agent_key: 'CREW-9',
          command: 'run',
          session_id: 'failed-start:CREW-9:1',
          started_at: '2026-06-17T00:00:00.000Z',
          completed_at: '2026-06-17T00:00:01.000Z',
          exit_code: 1,
          status: 'failed-start',
          failure_check: 'git-remote',
          failure_headline: 'No git remote configured',
          failure_remediation: 'Add an origin remote and retry.',
          failure_output: '✗ preflight: No git remote configured',
        })
        .execute();
      const row = await db
        .selectFrom('runs')
        .selectAll()
        .where('agent_key', '=', 'CREW-9')
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('failed-start');
      expect(row.failure_check).toBe('git-remote');
      expect(row.failure_headline).toBe('No git remote configured');
      expect(row.failure_remediation).toBe('Add an origin remote and retry.');
      expect(row.failure_output).toContain('No git remote');
    } finally {
      await db.destroy();
    }
  });

  it('defaults status null + acknowledged 0 for a plain run', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'CREW-10',
          project_name: 'crew',
          ticket_title: null,
          worktree_path: '/tmp/crew-10',
          branch: 'CREW-10',
          pr_url: null,
          app_url: null,
          created_at: '2026-06-17T00:00:00.000Z',
        })
        .execute();
      await db
        .insertInto('runs')
        .values({
          agent_key: 'CREW-10',
          command: 'run',
          session_id: 'sess-10',
          started_at: '2026-06-17T00:00:00.000Z',
          completed_at: null,
          exit_code: null,
        })
        .execute();
      const row = await db
        .selectFrom('runs')
        .selectAll()
        .where('agent_key', '=', 'CREW-10')
        .executeTakeFirstOrThrow();
      expect(row.status).toBeNull();
      expect(row.acknowledged).toBe(0);
      expect(row.failure_check).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('rejects an unknown status via the CHECK constraint', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'CREW-11',
          project_name: 'crew',
          ticket_title: null,
          worktree_path: '/tmp/crew-11',
          branch: 'CREW-11',
          pr_url: null,
          app_url: null,
          created_at: '2026-06-17T00:00:00.000Z',
        })
        .execute();
      await expect(
        db
          .insertInto('runs')
          .values({
            agent_key: 'CREW-11',
            command: 'run',
            session_id: 'sess-11',
            started_at: '2026-06-17T00:00:00.000Z',
            completed_at: null,
            exit_code: null,
            // @ts-expect-error — exercising the runtime CHECK with an invalid status
            status: 'detonating',
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });

  it('down() drops the added columns', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      const cols = await sql<{ name: string }>`
        PRAGMA table_info(runs)
      `.execute(db);
      const names = cols.rows.map((c) => c.name);
      expect(names).not.toContain('status');
      expect(names).not.toContain('failure_check');
      expect(names).not.toContain('acknowledged');
    } finally {
      await db.destroy();
    }
  });
});
