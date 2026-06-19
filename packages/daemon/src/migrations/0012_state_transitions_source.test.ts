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
  notnull: number;
}

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0012-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0012 — state_transitions.source', () => {
  it('adds a nullable source column', async () => {
    const db = await freshDb();
    try {
      const cols = await sql<ColumnRow>`PRAGMA table_info(state_transitions)`.execute(db);
      const source = cols.rows.find((c) => c.name === 'source');
      expect(source).toBeDefined();
      expect(source!.notnull).toBe(0); // nullable
    } finally {
      await db.destroy();
    }
  });

  it('defaults source to null and round-trips a stored value', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('state_transitions')
        .values({ agent_key: 'KAN-1', from_state: null, to_state: 'running', ts: 1000 })
        .execute();
      const before = await db
        .selectFrom('state_transitions')
        .select('source')
        .where('agent_key', '=', 'KAN-1')
        .executeTakeFirst();
      expect(before?.source).toBeNull();

      await db
        .insertInto('state_transitions')
        .values({
          agent_key: 'KAN-1',
          from_state: 'running',
          to_state: 'pr_open',
          ts: 2000,
          source: 'hook-pr-create',
        })
        .execute();
      const after = await db
        .selectFrom('state_transitions')
        .select('source')
        .where('agent_key', '=', 'KAN-1')
        .where('to_state', '=', 'pr_open')
        .executeTakeFirst();
      expect(after?.source).toBe('hook-pr-create');
    } finally {
      await db.destroy();
    }
  });
});
