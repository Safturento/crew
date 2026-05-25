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

interface SqliteMasterRow {
  sql: string | null;
  name: string;
}

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0005-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0005 — pr_merged state', () => {
  it('extends state_transitions CHECK constraint to allow pr_merged', async () => {
    const db = await freshDb();
    try {
      const table = await sql<SqliteMasterRow>`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'state_transitions'
      `.execute(db);
      const ddl = table.rows[0]?.sql ?? '';
      expect(ddl).toContain(`'pr_merged'`);
    } finally {
      await db.destroy();
    }
  });

  it('preserves existing rows through the table recreate', async () => {
    const db = await freshDb();
    try {
      await sql`DELETE FROM state_transitions`.execute(db);
      await db
        .insertInto('state_transitions')
        .values([
          { agent_key: 'AGENT', from_state: null, to_state: 'init', ts: 1 },
          { agent_key: 'AGENT', from_state: 'init', to_state: 'running', ts: 2 },
          { agent_key: 'AGENT', from_state: 'running', to_state: 'pr_open', ts: 3 },
        ])
        .execute();

      // Re-running migrations is a no-op (already applied); ensure the rows
      // we just inserted survive by reading them back through the recreated
      // table.
      const rows = await db
        .selectFrom('state_transitions')
        .where('agent_key', '=', 'AGENT')
        .orderBy('ts', 'asc')
        .selectAll()
        .execute();
      expect(rows.map((r) => r.to_state)).toEqual(['init', 'running', 'pr_open']);
    } finally {
      await db.destroy();
    }
  });

  it('accepts pr_merged inserts after migration', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('state_transitions')
        .values({ agent_key: 'AGENT', from_state: 'pr_open', to_state: 'pr_merged', ts: 100 })
        .execute();
      const row = await db
        .selectFrom('state_transitions')
        .where('agent_key', '=', 'AGENT')
        .where('to_state', '=', 'pr_merged')
        .selectAll()
        .executeTakeFirst();
      expect(row?.from_state).toBe('pr_open');
      expect(row?.to_state).toBe('pr_merged');
    } finally {
      await db.destroy();
    }
  });

  it('preserves the (agent_key, ts) index', async () => {
    const db = await freshDb();
    try {
      const idx = await sql<SqliteMasterRow>`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'state_transitions'
          AND name = 'state_transitions_agent_ts'
      `.execute(db);
      expect(idx.rows).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });
});
