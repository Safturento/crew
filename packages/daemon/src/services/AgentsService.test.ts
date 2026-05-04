import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import type { Kysely } from 'kysely';
import { AgentsService } from './AgentsService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-agents-svc-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

async function makeAgent(
  db: Kysely<DaemonDatabase>,
  key: string,
  overrides: Partial<{
    projectName: string;
    ticketTitle: string | null;
    worktreePath: string;
    branch: string;
    prUrl: string | null;
  }> = {},
): Promise<void> {
  await db
    .insertInto('agents')
    .values({
      key,
      project_name: overrides.projectName ?? 'demo',
      ticket_title: overrides.ticketTitle ?? `${key} title`,
      worktree_path: overrides.worktreePath ?? `/x/${key}`,
      branch: overrides.branch ?? key,
      pr_url: overrides.prUrl ?? null,
      created_at: '2026-04-29T12:00:00Z',
    })
    .execute();
}

async function makeRun(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
  sessionId: string,
  opts: {
    command?: 'run' | 'fix-pr' | 'finish';
    completedAt?: string | null;
    exitCode?: number | null;
  } = {},
): Promise<number> {
  const row = await db
    .insertInto('runs')
    .values({
      agent_key: agentKey,
      command: opts.command ?? 'run',
      session_id: sessionId,
      started_at: '2026-04-29T12:00:00Z',
      completed_at: opts.completedAt ?? null,
      exit_code: opts.exitCode ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function makeToolCall(
  db: Kysely<DaemonDatabase>,
  runId: number,
  opts: { tool?: string; summary?: string; tokens?: number; occurredAt?: string } = {},
): Promise<void> {
  await db
    .insertInto('tool_calls')
    .values({
      run_id: runId,
      tool_name: opts.tool ?? 'Read',
      input_summary: opts.summary ?? '/x',
      output_tokens: opts.tokens ?? 10,
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      occurred_at: opts.occurredAt ?? '2026-04-29T12:00:01Z',
    })
    .execute();
}

describe('AgentsService.list', () => {
  it('returns initializing for an agent whose latest run has zero tool_calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1');
      await makeRun(db, 'KAN-1', 's1');
      const svc = new AgentsService({ db });
      const agents = await svc.list();
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        key: 'KAN-1',
        projectName: 'demo',
        ticketTitle: 'KAN-1 title',
        state: 'initializing',
        tokens: 0,
      });
    } finally {
      await db.destroy();
    }
  });

  it('returns running for an agent whose latest run is open and has tool_calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-2');
      const runId = await makeRun(db, 'KAN-2', 's2');
      await makeToolCall(db, runId, { tokens: 5 });
      const svc = new AgentsService({ db });
      const agents = await svc.list();
      expect(agents[0]).toMatchObject({ key: 'KAN-2', state: 'running', tokens: 5 });
    } finally {
      await db.destroy();
    }
  });

  it('returns pr_open when latest run is completed=0 AND any tool_call matches gh pr create', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-3');
      const runId = await makeRun(db, 'KAN-3', 's3', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, runId, {
        tool: 'Bash',
        summary: 'gh pr create --title hello',
        tokens: 1,
      });
      const svc = new AgentsService({ db });
      expect((await svc.list())[0]).toMatchObject({ key: 'KAN-3', state: 'pr_open' });
    } finally {
      await db.destroy();
    }
  });

  it('returns finished when latest run is completed=0 AND no gh pr create ever observed', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-4');
      const runId = await makeRun(db, 'KAN-4', 's4', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, runId, { tool: 'Read', tokens: 2 });
      const svc = new AgentsService({ db });
      expect((await svc.list())[0]).toMatchObject({ key: 'KAN-4', state: 'finished' });
    } finally {
      await db.destroy();
    }
  });

  it('returns error when latest run completed with a non-zero exit code', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-5');
      const runId = await makeRun(db, 'KAN-5', 's5', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 1,
      });
      await makeToolCall(db, runId, { tokens: 3 });
      expect((await new AgentsService({ db }).list())[0]).toMatchObject({
        key: 'KAN-5',
        state: 'error',
      });
    } finally {
      await db.destroy();
    }
  });

  it('aggregates tokens across all runs of the same agent', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-6');
      const r1 = await makeRun(db, 'KAN-6', 's6a', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      const r2 = await makeRun(db, 'KAN-6', 's6b', { command: 'fix-pr' });
      await makeToolCall(db, r1, { tokens: 100, occurredAt: '2026-04-29T13:00:01Z' });
      await makeToolCall(db, r2, { tokens: 200, occurredAt: '2026-04-29T14:00:01Z' });
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-6', tokens: 300, state: 'running' });
    } finally {
      await db.destroy();
    }
  });

  it('returns an empty list when no agents exist', async () => {
    const db = await freshDb();
    try {
      expect(await new AgentsService({ db }).list()).toEqual([]);
    } finally {
      await db.destroy();
    }
  });
});
