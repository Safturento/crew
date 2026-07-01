import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0015_state_transitions_queued_orphaned.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0015-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0015 — queued + orphaned state transitions', () => {
  it('accepts a queued to_state after the CHECK widens', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('state_transitions')
        .values({
          agent_key: 'CREW-1',
          from_state: null,
          to_state: 'queued',
          ts: 1,
          source: 'enqueue',
        })
        .execute();
      const row = await db.selectFrom('state_transitions').selectAll().executeTakeFirstOrThrow();
      expect(row.to_state).toBe('queued');
    } finally {
      await db.destroy();
    }
  });

  it('accepts an orphaned transition (running → orphaned)', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('state_transitions')
        .values({
          agent_key: 'CREW-2',
          from_state: 'running',
          to_state: 'orphaned',
          ts: 2,
          source: 'runner-exit',
        })
        .execute();
      const row = await db.selectFrom('state_transitions').selectAll().executeTakeFirstOrThrow();
      expect(row.from_state).toBe('running');
      expect(row.to_state).toBe('orphaned');
    } finally {
      await db.destroy();
    }
  });

  it('preserves the source column added by 0012', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('state_transitions')
        .values({
          agent_key: 'CREW-3',
          from_state: null,
          to_state: 'init',
          ts: 3,
          source: 'cli-run',
        })
        .execute();
      const row = await db.selectFrom('state_transitions').selectAll().executeTakeFirstOrThrow();
      expect(row.source).toBe('cli-run');
    } finally {
      await db.destroy();
    }
  });

  it('still rejects an unknown to_state via the widened CHECK', async () => {
    const db = await freshDb();
    try {
      await expect(
        db
          .insertInto('state_transitions')
          // @ts-expect-error — exercising the runtime CHECK with an invalid state
          .values({ agent_key: 'CREW-4', from_state: null, to_state: 'bogus', ts: 4, source: null })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });

  it('down() narrows the CHECK back — rejects queued again', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      await expect(
        db
          .insertInto('state_transitions')
          .values({
            agent_key: 'CREW-5',
            from_state: null,
            to_state: 'queued',
            ts: 5,
            source: null,
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
