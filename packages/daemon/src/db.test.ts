import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sql } from 'kysely';
import { createDb, runMigrations, sortedMigrationFiles } from './db.js';

describe('sortedMigrationFiles', () => {
  it('drops co-located .test/.d files', () => {
    expect(
      sortedMigrationFiles(['0001_a.ts', '0001_a.test.ts', '0002_b.d.ts', '0002_b.ts']),
    ).toEqual(['0001_a.ts', '0002_b.ts']);
  });

  it('returns migration files in name order regardless of readdir order', () => {
    // node:fs readdir gives no ordering guarantee; Kysely applies migrations in
    // the order this returns and refuses to boot if a later run sees a
    // different order. Sorting makes the apply order deterministic.
    expect(
      sortedMigrationFiles(['0007_finish_steps.ts', '0006_action_requests.ts', '0001_a.ts']),
    ).toEqual(['0001_a.ts', '0006_action_requests.ts', '0007_finish_steps.ts']);
  });
});

describe('createDb', () => {
  it('opens an in-memory SQLite database when given ":memory:"', async () => {
    const db = createDb(':memory:');
    try {
      const result = await sql<{ one: number }>`select 1 as one`.execute(db);
      expect(result.rows[0]).toEqual({ one: 1 });
    } finally {
      await db.destroy();
    }
  });
});

describe('runMigrations', () => {
  it('completes successfully against an empty migrations folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-daemon-migrations-'));
    const db = createDb(':memory:');
    try {
      const results = await runMigrations(db, dir);
      expect(results).toEqual([]);
    } finally {
      await db.destroy();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('opens a file-backed database at the given path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-daemon-db-'));
    const dbFile = join(dir, 'state.db');
    const db = createDb(dbFile);
    try {
      await sql`select 1`.execute(db);
      expect(existsSync(dbFile)).toBe(true);
    } finally {
      await db.destroy();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
