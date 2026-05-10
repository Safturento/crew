import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { claudeProjectDirFor } from 'crew-shared';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { resolveJsonlPathForAgent } from './resolveJsonlPath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-resolve-jsonl-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

async function makeAgent(db: Kysely<DaemonDatabase>, key: string, worktreePath: string) {
  await db
    .insertInto('agents')
    .values({
      key,
      project_name: 'demo',
      ticket_title: 'demo',
      worktree_path: worktreePath,
      branch: key,
      pr_url: null,
      created_at: '2026-04-29T12:00:00Z',
    })
    .execute();
}

async function makeRun(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
  sessionId: string,
  command: 'run' | 'fix-pr' | 'finish',
  completedAt: string | null = null,
): Promise<void> {
  await db
    .insertInto('runs')
    .values({
      agent_key: agentKey,
      command,
      session_id: sessionId,
      started_at: '2026-04-29T12:00:00Z',
      completed_at: completedAt,
      exit_code: completedAt ? 0 : null,
    })
    .execute();
}

describe('resolveJsonlPathForAgent', () => {
  it('returns null when the agent has no runs', async () => {
    const db = await freshDb();
    try {
      expect(await resolveJsonlPathForAgent(db, 'KAN-1')).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('returns the JSONL path for the only run when it is a `run`', async () => {
    const db = await freshDb();
    try {
      const wt = '/work/KAN-1';
      await makeAgent(db, 'KAN-1', wt);
      await makeRun(db, 'KAN-1', 'session-abc', 'run');
      const out = await resolveJsonlPathForAgent(db, 'KAN-1');
      expect(out).toBe(join(claudeProjectDirFor(wt), 'session-abc.jsonl'));
    } finally {
      await db.destroy();
    }
  });

  // CREW-116: a finish run uses a synthetic session id with no JSONL on
  // disk. `resolveJsonlPathForAgent` must skip it and keep pointing at the
  // original `run`/`fix-pr` transcript so the drawer doesn't go blank.
  it('skips finish runs and returns the latest non-finish run JSONL path', async () => {
    const db = await freshDb();
    try {
      const wt = '/work/KAN-2';
      await makeAgent(db, 'KAN-2', wt);
      await makeRun(db, 'KAN-2', 'session-run', 'run', '2026-04-29T13:00:00Z');
      await makeRun(db, 'KAN-2', 'session-fixpr', 'fix-pr', '2026-04-29T14:00:00Z');
      await makeRun(db, 'KAN-2', 'finish-KAN-2-uuid', 'finish');
      const out = await resolveJsonlPathForAgent(db, 'KAN-2');
      expect(out).toBe(join(claudeProjectDirFor(wt), 'session-fixpr.jsonl'));
    } finally {
      await db.destroy();
    }
  });

  it('returns null when an agent only has finish runs', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-3', '/work/KAN-3');
      await makeRun(db, 'KAN-3', 'finish-KAN-3-uuid', 'finish');
      expect(await resolveJsonlPathForAgent(db, 'KAN-3')).toBeNull();
    } finally {
      await db.destroy();
    }
  });
});
