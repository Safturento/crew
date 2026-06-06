import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0008_agent_app_url.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

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
      const cols = await sql<{ name: string }>`PRAGMA table_info(agents)`.execute(db);
      expect(cols.rows.map((c) => c.name)).toContain('app_url');
    } finally {
      await db.destroy();
    }
  });

  it('round-trips a stored app_url value', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'CREW-1',
          project_name: 'demo',
          ticket_title: null,
          worktree_path: '/x/CREW-1',
          branch: 'CREW-1',
          pr_url: null,
          app_url: 'http://localhost:51234',
          created_at: '2026-06-05T12:00:00Z',
        })
        .execute();
      const row = await db
        .selectFrom('agents')
        .select(['app_url'])
        .where('key', '=', 'CREW-1')
        .executeTakeFirstOrThrow();
      expect(row.app_url).toBe('http://localhost:51234');
    } finally {
      await db.destroy();
    }
  });

  it('defaults app_url to null when omitted on insert', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'CREW-2',
          project_name: 'demo',
          ticket_title: null,
          worktree_path: '/x/CREW-2',
          branch: 'CREW-2',
          pr_url: null,
          created_at: '2026-06-05T12:00:00Z',
        })
        .execute();
      const row = await db
        .selectFrom('agents')
        .select(['app_url'])
        .where('key', '=', 'CREW-2')
        .executeTakeFirstOrThrow();
      expect(row.app_url).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('down drops the app_url column', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      const cols = await sql<{ name: string }>`PRAGMA table_info(agents)`.execute(db);
      expect(cols.rows.map((c) => c.name)).not.toContain('app_url');
    } finally {
      await db.destroy();
    }
  });
});
