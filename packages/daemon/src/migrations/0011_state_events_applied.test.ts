import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0011_state_events_applied.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0011-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0011 — state_events_applied', () => {
  it('creates the state_events_applied table with the documented columns', async () => {
    const db = await freshDb();
    try {
      const cols = await sql<{ name: string }>`
        PRAGMA table_info(state_events_applied)
      `.execute(db);
      expect(cols.rows.map((c) => c.name)).toEqual(['event_id', 'agent_key', 'ts']);
    } finally {
      await db.destroy();
    }
  });

  it('round-trips a row keyed on event_id', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('state_events_applied')
        .values({ event_id: 'e1', agent_key: 'CREW-1', ts: 1_700_000_000_000 })
        .execute();
      const row = await db
        .selectFrom('state_events_applied')
        .selectAll()
        .executeTakeFirstOrThrow();
      expect(row.event_id).toBe('e1');
      expect(row.agent_key).toBe('CREW-1');
      expect(row.ts).toBe(1_700_000_000_000);
    } finally {
      await db.destroy();
    }
  });

  it('rejects a duplicate event_id (PRIMARY KEY) for exactly-once replay', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('state_events_applied')
        .values({ event_id: 'dup', agent_key: 'CREW-1', ts: 1 })
        .execute();
      await expect(
        db
          .insertInto('state_events_applied')
          .values({ event_id: 'dup', agent_key: 'CREW-1', ts: 2 })
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
        SELECT name FROM sqlite_master WHERE type='table' AND name='state_events_applied'
      `.execute(db);
      expect(tables.rows).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});
