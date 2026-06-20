import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0013_action_resume_kind.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0013-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0013 — action resume kind', () => {
  it('accepts a resume action kind after the CHECK widens', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('action_requests')
        .values({
          kind: 'resume',
          ticket_key: 'CREW-275',
          project: 'crew',
          created_at: '2026-06-19T12:00:00Z',
          updated_at: '2026-06-19T12:00:00Z',
        })
        .execute();
      const row = await db.selectFrom('action_requests').selectAll().executeTakeFirstOrThrow();
      expect(row.kind).toBe('resume');
      expect(row.status).toBe('pending');
    } finally {
      await db.destroy();
    }
  });

  it('still rejects an unknown kind via the widened CHECK constraint', async () => {
    const db = await freshDb();
    try {
      await expect(
        db
          .insertInto('action_requests')
          .values({
            // @ts-expect-error — exercising the runtime CHECK with an invalid kind
            kind: 'deploy',
            ticket_key: 'CREW-1',
            project: 'crew',
            created_at: '2026-06-19T12:00:00Z',
            updated_at: '2026-06-19T12:00:00Z',
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });

  it('preserves existing rows across the table recreate', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('action_requests')
        .values({
          kind: 'run',
          ticket_key: 'CREW-10',
          project: 'crew',
          created_at: '2026-06-19T12:00:00Z',
          updated_at: '2026-06-19T12:00:00Z',
        })
        .execute();
      const row = await db.selectFrom('action_requests').selectAll().executeTakeFirstOrThrow();
      expect(row.kind).toBe('run');
      expect(row.ticket_key).toBe('CREW-10');
    } finally {
      await db.destroy();
    }
  });

  it('down() narrows the CHECK back — rejects resume again', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      await expect(
        db
          .insertInto('action_requests')
          .values({
            kind: 'resume',
            ticket_key: 'CREW-275',
            project: 'crew',
            created_at: '2026-06-19T12:00:00Z',
            updated_at: '2026-06-19T12:00:00Z',
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
