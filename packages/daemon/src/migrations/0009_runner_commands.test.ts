import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { RUNNER_COMMAND_KINDS, RUNNER_COMMAND_STATUSES } from 'crew-shared';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0009_runner_commands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0009-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0009 — runner_commands', () => {
  it('creates the runner_commands table with the documented columns', async () => {
    const db = await freshDb();
    try {
      const cols = await sql<{ name: string }>`
        PRAGMA table_info(runner_commands)
      `.execute(db);
      const names = cols.rows.map((c) => c.name);
      expect(names).toEqual([
        'id',
        'agent_key',
        'kind',
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

  it('round-trips a row and defaults status to pending', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('runner_commands')
        .values({
          agent_key: 'CREW-231',
          kind: 'cancel_soft',
          created_at: '2026-06-16T00:00:00.000Z',
          updated_at: '2026-06-16T00:00:00.000Z',
        })
        .execute();
      const row = await db.selectFrom('runner_commands').selectAll().executeTakeFirstOrThrow();
      expect(row.kind).toBe('cancel_soft');
      expect(row.status).toBe('pending');
      expect(row.agent_key).toBe('CREW-231');
      expect(row.payload).toBeNull();
      expect(row.error).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('allows a null agent_key for queue-level commands', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('runner_commands')
        .values({
          agent_key: null,
          kind: 'dequeue',
          created_at: '2026-06-16T00:00:00.000Z',
          updated_at: '2026-06-16T00:00:00.000Z',
        })
        .execute();
      const row = await db.selectFrom('runner_commands').selectAll().executeTakeFirstOrThrow();
      expect(row.agent_key).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('rejects an unknown kind via the CHECK constraint', async () => {
    const db = await freshDb();
    try {
      await expect(
        db
          .insertInto('runner_commands')
          .values({
            // @ts-expect-error — exercising the runtime CHECK with an invalid kind
            kind: 'detonate',
            created_at: '2026-06-16T00:00:00.000Z',
            updated_at: '2026-06-16T00:00:00.000Z',
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
          .insertInto('runner_commands')
          .values({
            kind: 'cancel_soft',
            // @ts-expect-error — exercising the runtime CHECK with an invalid status
            status: 'queued',
            created_at: '2026-06-16T00:00:00.000Z',
            updated_at: '2026-06-16T00:00:00.000Z',
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });

  // Drift guard: the migration's CHECK lists are hand-maintained copies of
  // the shared tuples. These assert the CHECK accepts every contract value,
  // so adding a kind/status to `crew-shared` without updating the migration
  // fails loudly here rather than silently rejecting valid rows in prod.
  it('accepts every kind in RUNNER_COMMAND_KINDS', async () => {
    const db = await freshDb();
    try {
      for (const kind of RUNNER_COMMAND_KINDS) {
        await db
          .insertInto('runner_commands')
          .values({
            kind,
            created_at: '2026-06-16T00:00:00.000Z',
            updated_at: '2026-06-16T00:00:00.000Z',
          })
          .execute();
      }
      const count = await db
        .selectFrom('runner_commands')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow();
      expect(count.n).toBe(RUNNER_COMMAND_KINDS.length);
    } finally {
      await db.destroy();
    }
  });

  it('accepts every status in RUNNER_COMMAND_STATUSES', async () => {
    const db = await freshDb();
    try {
      for (const status of RUNNER_COMMAND_STATUSES) {
        await db
          .insertInto('runner_commands')
          .values({
            kind: 'cancel_soft',
            status,
            created_at: '2026-06-16T00:00:00.000Z',
            updated_at: '2026-06-16T00:00:00.000Z',
          })
          .execute();
      }
      const stored = await db.selectFrom('runner_commands').select('status').execute();
      expect(stored.map((r) => r.status).sort()).toEqual([...RUNNER_COMMAND_STATUSES].sort());
    } finally {
      await db.destroy();
    }
  });

  it('rolls back cleanly — down() drops the table', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      const tables = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type='table' AND name='runner_commands'
      `.execute(db);
      expect(tables.rows).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});
