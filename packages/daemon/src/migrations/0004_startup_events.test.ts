import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0004_startup_events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0004-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0004 — startup_events', () => {
  it('creates the startup_events table with the documented columns', async () => {
    const db = await freshDb();
    try {
      const cols = await sql<{ name: string; type: string; notnull: number }>`
        PRAGMA table_info(startup_events)
      `.execute(db);
      const names = cols.rows.map((c) => c.name);
      expect(names).toEqual([
        'id',
        'agent_key',
        'subtype',
        'status',
        'ts',
        'summary',
        'duration_ms',
        'log_path',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('insert + select round-trips a row', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('startup_events')
        .values({
          agent_key: 'CREW-201',
          subtype: 'crew_startup_npm_install',
          status: 'started',
          ts: 1_700_000_000_000,
          summary: 'npm ci begun',
          duration_ms: null,
          log_path: null,
        })
        .execute();
      const row = await db
        .selectFrom('startup_events')
        .selectAll()
        .where('agent_key', '=', 'CREW-201')
        .executeTakeFirstOrThrow();
      expect(row.subtype).toBe('crew_startup_npm_install');
      expect(row.status).toBe('started');
      expect(row.ts).toBe(1_700_000_000_000);
      expect(row.summary).toBe('npm ci begun');
      expect(row.duration_ms).toBeNull();
      expect(row.log_path).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('UNIQUE(agent_key, subtype, status, ts) dedupes on re-insert', async () => {
    const db = await freshDb();
    try {
      const value = {
        agent_key: 'CREW-201',
        subtype: 'crew_startup_docker',
        status: 'completed' as const,
        ts: 1_700_000_001_000,
        summary: 'docker healthy',
        duration_ms: 5_000,
        log_path: '/tmp/crew-docker-CREW-201.log',
      };
      await db
        .insertInto('startup_events')
        .values(value)
        .onConflict((oc) => oc.columns(['agent_key', 'subtype', 'status', 'ts']).doNothing())
        .execute();
      await db
        .insertInto('startup_events')
        .values(value)
        .onConflict((oc) => oc.columns(['agent_key', 'subtype', 'status', 'ts']).doNothing())
        .execute();
      const count = await db
        .selectFrom('startup_events')
        .select(sql<number>`COUNT(*)`.as('n'))
        .executeTakeFirstOrThrow();
      expect(Number(count.n)).toBe(1);
    } finally {
      await db.destroy();
    }
  });

  it('rolls back cleanly — down() drops the table', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      const tables = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type='table' AND name='startup_events'
      `.execute(db);
      expect(tables.rows).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});
