import { describe, it, expect, afterEach, vi } from 'vitest';
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
      await expect(
        up0002(db as unknown as Kysely<unknown>, silentLogger()),
      ).resolves.not.toThrow();
    } finally {
      await db.destroy();
    }
  });

  it('backfills transitions per agent: init → running → pr_open', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0002-backfill-'));
    tmpdirs.push(dir);
    const db = createDb(join(dir, 'state.db'));
    try {
      await runMigrations(db, MIGRATIONS_DIR);
      // The migrator already ran the (empty-data) backfill once; clear the
      // table so the seeded backfill below runs from a known-empty state.
      await sql`DELETE FROM state_transitions`.execute(db);

      await db
        .insertInto('agents')
        .values({
          key: 'KAN-1',
          project_name: 'demo',
          ticket_title: 'KAN-1 title',
          worktree_path: '/x/KAN-1',
          branch: 'KAN-1',
          pr_url: null,
          created_at: '2026-04-29T12:00:00Z',
        })
        .execute();
      const run = await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-1',
          command: 'run',
          session_id: 's1',
          started_at: '2026-04-29T12:00:00Z',
          completed_at: null,
          exit_code: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await db
        .insertInto('tool_calls')
        .values([
          {
            run_id: run.id,
            tool_name: 'Read',
            input_summary: 'a',
            output_tokens: 0,
            input_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            occurred_at: '2026-04-29T12:00:01Z',
          },
          {
            run_id: run.id,
            tool_name: 'Edit',
            input_summary: 'b',
            output_tokens: 0,
            input_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            occurred_at: '2026-04-29T12:00:02Z',
          },
          {
            run_id: run.id,
            tool_name: 'Bash',
            input_summary: 'gh pr create --title hi',
            output_tokens: 0,
            input_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            occurred_at: '2026-04-29T12:00:03Z',
          },
        ])
        .execute();

      await up0002(db as unknown as Kysely<unknown>, silentLogger());

      const rows = await db
        .selectFrom('state_transitions')
        .where('agent_key', '=', 'KAN-1')
        .orderBy('ts')
        .selectAll()
        .execute();
      expect(rows.map((r) => r.to_state)).toEqual(['init', 'running', 'pr_open']);
      expect(rows.map((r) => r.from_state)).toEqual([null, 'init', 'running']);
      expect(rows[0]!.ts).toBe(0);
      expect(rows[1]!.ts).toBe(Date.parse('2026-04-29T12:00:01Z'));
      expect(rows[2]!.ts).toBe(Date.parse('2026-04-29T12:00:03Z'));
    } finally {
      await db.destroy();
    }
  });

  it('per-agent backfill failures log + skip; do not roll back the migration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0002-skip-'));
    tmpdirs.push(dir);
    const db = createDb(join(dir, 'state.db'));
    try {
      await runMigrations(db, MIGRATIONS_DIR);
      await sql`DELETE FROM state_transitions`.execute(db);

      // KAN-A has a parseable timestamp; KAN-B's tool_call has a malformed
      // occurred_at so Date.parse returns NaN. The backfill validates each
      // ts before insert and throws inside KAN-B's transaction, which is
      // caught and logged — KAN-A's rows must still commit.
      for (const k of ['KAN-A', 'KAN-B']) {
        await db
          .insertInto('agents')
          .values({
            key: k,
            project_name: 'demo',
            ticket_title: `${k} title`,
            worktree_path: `/x/${k}`,
            branch: k,
            pr_url: null,
            created_at: '2026-04-29T12:00:00Z',
          })
          .execute();
      }
      const a = await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-A',
          command: 'run',
          session_id: 'sa',
          started_at: '2026-04-29T12:00:00Z',
          completed_at: null,
          exit_code: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const b = await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-B',
          command: 'run',
          session_id: 'sb',
          started_at: '2026-04-29T12:00:00Z',
          completed_at: null,
          exit_code: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await db
        .insertInto('tool_calls')
        .values([
          {
            run_id: a.id,
            tool_name: 'Read',
            input_summary: 'ok',
            output_tokens: 0,
            input_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            occurred_at: '2026-04-29T12:00:01Z',
          },
          {
            run_id: b.id,
            tool_name: 'Read',
            input_summary: 'broken',
            output_tokens: 0,
            input_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            occurred_at: 'not-a-real-timestamp',
          },
        ])
        .execute();

      const logger = silentLogger();
      const warnSpy = vi.spyOn(logger, 'warn');

      await expect(
        up0002(db as unknown as Kysely<unknown>, logger),
      ).resolves.not.toThrow();

      const rowsA = await db
        .selectFrom('state_transitions')
        .where('agent_key', '=', 'KAN-A')
        .selectAll()
        .execute();
      expect(rowsA.map((r) => r.to_state)).toEqual(['init', 'running']);
      const rowsB = await db
        .selectFrom('state_transitions')
        .where('agent_key', '=', 'KAN-B')
        .selectAll()
        .execute();
      expect(rowsB).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      const warnedKey = warnSpy.mock.calls.some((call) =>
        call.some((arg) => JSON.stringify(arg).includes('KAN-B')),
      );
      expect(warnedKey).toBe(true);
    } finally {
      await db.destroy();
    }
  });
});
