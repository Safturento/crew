import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface ColumnRow {
  name: string;
}

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0008-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0008 — agent app_url', () => {
  it('adds a nullable app_url column to agents', async () => {
    const db = await freshDb();
    try {
      const cols = await sql<ColumnRow>`PRAGMA table_info(agents)`.execute(db);
      expect(cols.rows.map((c) => c.name)).toContain('app_url');
    } finally {
      await db.destroy();
    }
  });

  it('defaults app_url to null and round-trips a stored value', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-1',
          project_name: 'demo',
          ticket_title: null,
          worktree_path: '/x/KAN-1',
          branch: 'KAN-1',
          pr_url: null,
          app_url: null,
          created_at: '2026-06-05T12:00:00Z',
        })
        .execute();
      const before = await db
        .selectFrom('agents')
        .select('app_url')
        .where('key', '=', 'KAN-1')
        .executeTakeFirst();
      expect(before?.app_url).toBeNull();

      await db
        .updateTable('agents')
        .set({ app_url: 'http://localhost:51234' })
        .where('key', '=', 'KAN-1')
        .execute();
      const after = await db
        .selectFrom('agents')
        .select('app_url')
        .where('key', '=', 'KAN-1')
        .executeTakeFirst();
      expect(after?.app_url).toBe('http://localhost:51234');
    } finally {
      await db.destroy();
    }
  });
});
