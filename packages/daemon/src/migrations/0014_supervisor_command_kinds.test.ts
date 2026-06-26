import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Kysely } from 'kysely';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { down } from './0014_supervisor_command_kinds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-0014-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('migration 0014 — supervisor command kinds', () => {
  it.each(['supervisor_stop', 'supervisor_restart'] as const)(
    'accepts the queue-level %s kind after the CHECK widens',
    async (kind) => {
      const db = await freshDb();
      try {
        await db
          .insertInto('runner_commands')
          .values({
            agent_key: null,
            kind,
            status: 'pending',
            created_at: '2026-06-25T12:00:00Z',
            updated_at: '2026-06-25T12:00:00Z',
          })
          .execute();
        const row = await db.selectFrom('runner_commands').selectAll().executeTakeFirstOrThrow();
        expect(row.kind).toBe(kind);
        expect(row.status).toBe('pending');
      } finally {
        await db.destroy();
      }
    },
  );

  it('still accepts the original kinds', async () => {
    const db = await freshDb();
    try {
      await db
        .insertInto('runner_commands')
        .values({
          agent_key: 'CREW-231',
          kind: 'cancel_soft',
          status: 'pending',
          created_at: '2026-06-25T12:00:00Z',
          updated_at: '2026-06-25T12:00:00Z',
        })
        .execute();
      const row = await db.selectFrom('runner_commands').selectAll().executeTakeFirstOrThrow();
      expect(row.kind).toBe('cancel_soft');
    } finally {
      await db.destroy();
    }
  });

  it('still rejects an unknown kind via the widened CHECK constraint', async () => {
    const db = await freshDb();
    try {
      await expect(
        db
          .insertInto('runner_commands')
          .values({
            // @ts-expect-error — exercising the runtime CHECK with an invalid kind
            kind: 'nuke',
            agent_key: null,
            status: 'pending',
            created_at: '2026-06-25T12:00:00Z',
            updated_at: '2026-06-25T12:00:00Z',
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
        .insertInto('runner_commands')
        .values({
          agent_key: 'CREW-10',
          kind: 'pause',
          status: 'applied',
          created_at: '2026-06-25T12:00:00Z',
          updated_at: '2026-06-25T12:00:00Z',
        })
        .execute();
      const row = await db.selectFrom('runner_commands').selectAll().executeTakeFirstOrThrow();
      expect(row.kind).toBe('pause');
      expect(row.agent_key).toBe('CREW-10');
      expect(row.status).toBe('applied');
    } finally {
      await db.destroy();
    }
  });

  it('down() narrows the CHECK back — rejects supervisor_stop again', async () => {
    const db = await freshDb();
    try {
      await down(db as unknown as Kysely<unknown>);
      await expect(
        db
          .insertInto('runner_commands')
          .values({
            agent_key: null,
            kind: 'supervisor_stop',
            status: 'pending',
            created_at: '2026-06-25T12:00:00Z',
            updated_at: '2026-06-25T12:00:00Z',
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
