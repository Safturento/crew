import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0006_finish_steps.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0006-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0006 — finish_steps', () => {
  it('creates the finish_steps table with the documented columns', async () => {
    const db = await freshDb();
    try {
      const cols = await sql<{ name: string }>`PRAGMA table_info(finish_steps)`.execute(db);
      expect(cols.rows.map((c) => c.name)).toEqual([
        'id',
        'agent_key',
        'idx',
        'label',
        'status',
        'detail',
        'ts',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('insert + select round-trips a row', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('finish_steps')
        .values({
          agent_key: 'CREW-1',
          idx: 0,
          label: 'lint',
          status: 'ok',
          detail: null,
          ts: 1_700_000_000_000,
        })
        .execute();
      const row = await db
        .selectFrom('finish_steps')
        .selectAll()
        .where('agent_key', '=', 'CREW-1')
        .executeTakeFirstOrThrow();
      expect(row.idx).toBe(0);
      expect(row.label).toBe('lint');
      expect(row.status).toBe('ok');
      expect(row.detail).toBeNull();
      expect(row.ts).toBe(1_700_000_000_000);
    } finally {
      await db.destroy();
    }
  });

  it('rejects a status outside ok|skip|error', async () => {
    const db = await freshDb();
    try {
      await expect(
        db
          .insertInto('finish_steps')
          .values({
            agent_key: 'CREW-1',
            idx: 0,
            label: 'bad',
            // @ts-expect-error — exercising the CHECK constraint at runtime
            status: 'bogus',
            detail: null,
            ts: 1,
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });

  it('rolls back cleanly — down() drops the table', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      const tables = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type='table' AND name='finish_steps'
      `.execute(db);
      expect(tables.rows).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});
