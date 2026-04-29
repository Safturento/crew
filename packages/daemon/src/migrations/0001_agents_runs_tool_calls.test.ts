import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

interface SqliteMasterRow {
  name: string;
}

describe('0001_agents_runs_tool_calls migration', () => {
  it('creates agents, runs, tool_calls tables with the expected indexes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-'));
    try {
      const db = createDb(join(dir, 'state.db'));
      try {
        const results = await runMigrations(db, MIGRATIONS_DIR);
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[results.length - 1]?.status).toBe('Success');

        const tables = await sql<SqliteMasterRow>`
          SELECT name FROM sqlite_master
          WHERE type = 'table' AND name IN ('agents','runs','tool_calls')
          ORDER BY name
        `.execute(db);
        expect(tables.rows.map((r) => r.name)).toEqual(['agents', 'runs', 'tool_calls']);

        const runsIndexes = await sql<SqliteMasterRow>`
          SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'runs' ORDER BY name
        `.execute(db);
        const runsIdxNames = runsIndexes.rows.map((r) => r.name);
        expect(runsIdxNames).toContain('idx_runs_agent_key');
        // session_id UNIQUE constraint creates an auto-named index
        expect(runsIdxNames.some((n) => n.includes('autoindex'))).toBe(true);

        const toolCallsIndexes = await sql<SqliteMasterRow>`
          SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tool_calls' ORDER BY name
        `.execute(db);
        const toolCallsIdxNames = toolCallsIndexes.rows.map((r) => r.name);
        expect(toolCallsIdxNames).toContain('idx_tool_calls_run_id');
        expect(toolCallsIdxNames).toContain('uniq_tool_calls_run_event');
      } finally {
        await db.destroy();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('down() drops the tables in reverse FK order', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-down-'));
    try {
      const db = createDb(join(dir, 'state.db'));
      try {
        await runMigrations(db, MIGRATIONS_DIR);

        const { down } = await import('./0001_agents_runs_tool_calls.js');
        // Migration up/down accept `Kysely<unknown>` so they're free of the
        // typed-schema generic; cast through `unknown` to bridge the variance.
        await down(db as unknown as Kysely<unknown>);

        const tables = await sql<SqliteMasterRow>`
          SELECT name FROM sqlite_master
          WHERE type = 'table' AND name IN ('agents','runs','tool_calls')
        `.execute(db);
        expect(tables.rows).toEqual([]);
      } finally {
        await db.destroy();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
