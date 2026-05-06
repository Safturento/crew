import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { pino, type Logger } from 'pino';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { up as up0002 } from './0002_state_transitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function silentLogger(): Logger {
  return pino({ level: 'silent' });
}

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0002-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

interface SqliteMasterRow {
  sql: string | null;
  name: string;
}

describe('migration 0002 — state_transitions', () => {
  it('creates state_transitions with the expected shape', async () => {
    const db = await freshDb();
    try {
      const table = await sql<SqliteMasterRow>`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'state_transitions'
      `.execute(db);
      const ddl = table.rows[0]?.sql ?? '';
      expect(ddl).toMatch(/agent_key TEXT NOT NULL/);
      expect(ddl).toMatch(/from_state TEXT/);
      expect(ddl).toMatch(/to_state TEXT NOT NULL/);
      expect(ddl).toMatch(/ts INTEGER NOT NULL/);
    } finally {
      await db.destroy();
    }
  });

  it('CHECK constraint covers init, running, pr_open, error, finished, idle, waiting', async () => {
    const db = await freshDb();
    try {
      const table = await sql<SqliteMasterRow>`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'state_transitions'
      `.execute(db);
      const ddl = table.rows[0]?.sql ?? '';
      for (const state of ['init', 'running', 'pr_open', 'error', 'finished', 'idle', 'waiting']) {
        expect(ddl).toContain(`'${state}'`);
      }
    } finally {
      await db.destroy();
    }
  });

  it('creates an (agent_key, ts) index', async () => {
    const db = await freshDb();
    try {
      const idx = await sql<SqliteMasterRow>`
        SELECT name, sql FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'state_transitions'
      `.execute(db);
      const named = idx.rows.find((r) => r.name === 'state_transitions_agent_ts');
      expect(named).toBeTruthy();
      expect(named?.sql).toMatch(/agent_key/);
      expect(named?.sql).toMatch(/ts/);
    } finally {
      await db.destroy();
    }
  });

  it('is idempotent: running up() a second time on a clean DB does not throw', async () => {
    const db = await freshDb();
    try {
      await expect(up0002(db, silentLogger())).resolves.not.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
