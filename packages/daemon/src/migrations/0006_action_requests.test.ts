import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0006_action_requests.js';

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

describe('migration 0006 — action_requests', () => {
  it('creates the action_requests table with the documented columns', async () => {
    const db = await freshDb();
    try {
      const cols = await sql<{ name: string }>`
        PRAGMA table_info(action_requests)
      `.execute(db);
      const names = cols.rows.map((c) => c.name);
      expect(names).toEqual([
        'id',
        'kind',
        'ticket_key',
        'project',
        'payload',
        'status',
        'error',
        'created_at',
        'updated_at',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('defaults status to pending and payload to {}', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('action_requests')
        .values({
          kind: 'run',
          ticket_key: 'CREW-1',
          project: 'crew',
          created_at: '2026-06-04T12:00:00Z',
          updated_at: '2026-06-04T12:00:00Z',
        })
        .execute();
      const row = await db.selectFrom('action_requests').selectAll().executeTakeFirstOrThrow();
      expect(row.status).toBe('pending');
      expect(row.payload).toBe('{}');
      expect(row.error).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('rejects an unknown kind via the CHECK constraint', async () => {
    const db = await freshDb();
    try {
      await expect(
        db
          .insertInto('action_requests')
          .values({
            // @ts-expect-error — exercising the runtime CHECK with an invalid kind
            kind: 'deploy',
            ticket_key: 'CREW-1',
            project: 'crew',
            created_at: '2026-06-04T12:00:00Z',
            updated_at: '2026-06-04T12:00:00Z',
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });

  it('rejects an unknown status via the CHECK constraint', async () => {
    const db = await freshDb();
    try {
      await expect(
        db
          .insertInto('action_requests')
          .values({
            kind: 'run',
            ticket_key: 'CREW-1',
            project: 'crew',
            // @ts-expect-error — exercising the runtime CHECK with an invalid status
            status: 'queued',
            created_at: '2026-06-04T12:00:00Z',
            updated_at: '2026-06-04T12:00:00Z',
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
        SELECT name FROM sqlite_master WHERE type='table' AND name='action_requests'
      `.execute(db);
      expect(tables.rows).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});
