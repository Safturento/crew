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
  opts: {
    tool?: string;
    summary?: string;
    tokens?: number;
    inputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    occurredAt?: string;
  } = {},
): Promise<void> {
  await db
    .insertInto('tool_calls')
    .values({
      run_id: runId,
      tool_name: opts.tool ?? 'Read',
      input_summary: opts.summary ?? '/x',
      output_tokens: opts.tokens ?? 10,
      input_tokens: opts.inputTokens ?? 0,
      cache_read_tokens: opts.cacheReadTokens ?? 0,
      cache_creation_tokens: opts.cacheCreationTokens ?? 0,
      occurred_at: opts.occurredAt ?? '2026-04-29T12:00:01Z',
    })
    .execute();
}

async function makeStateTransition(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
  to: 'init' | 'running' | 'pr_open' | 'error' | 'finished' | 'idle' | 'waiting',
  ts: number,
  from: 'init' | 'running' | 'pr_open' | 'error' | 'finished' | 'idle' | 'waiting' | null = null,
): Promise<void> {
  await db
    .insertInto('state_transitions')
    .values({ agent_key: agentKey, from_state: from, to_state: to, ts })
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

  // CREW-116: finish runs must not poison state derivation.
  it('returns finished after a finish run completes ok, even though gh pr create was observed earlier', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-7');
      const r1 = await makeRun(db, 'KAN-7', 's7a', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hello',
        tokens: 1,
      });
      await makeRun(db, 'KAN-7', `finish-KAN-7-${'a'.repeat(8)}`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-7', state: 'finished' });
    } finally {
      await db.destroy();
    }
  });

  it('keeps the prior state (pr_open) while a finish run is in progress with no tool_calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-8');
      const r1 = await makeRun(db, 'KAN-8', 's8a', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      // Open finish run with no tool_calls.
      await makeRun(db, 'KAN-8', `finish-KAN-8-${'b'.repeat(8)}`, { command: 'finish' });
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-8', state: 'pr_open' });
    } finally {
      await db.destroy();
    }
  });
});

describe('AgentsService.getByKey', () => {
  it('returns null when no run exists for that key', async () => {
    const db = await freshDb();
    try {
      const svc = new AgentsService({ db });
      expect(await svc.getByKey('NOPE-99')).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('returns null when an agent row exists but has no runs', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-X');
      const svc = new AgentsService({ db });
      expect(await svc.getByKey('KAN-X')).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('returns detail with runs, tokens breakdown, and tool_call_count', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1', {
        projectName: 'demo',
        ticketTitle: 'Demo title',
        worktreePath: '/work/KAN-1',
        prUrl: 'https://github.com/x/y/pull/1',
      });
      const r1 = await makeRun(db, 'KAN-1', 's1', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      const r2 = await makeRun(db, 'KAN-1', 's2', {
        command: 'fix-pr',
        completedAt: '2026-04-29T15:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hello',
        tokens: 100,
        inputTokens: 25,
        cacheReadTokens: 5,
        cacheCreationTokens: 7,
        occurredAt: '2026-04-29T13:00:01Z',
      });
      await makeToolCall(db, r2, {
        tool: 'Read',
        tokens: 200,
        inputTokens: 50,
        cacheReadTokens: 10,
        cacheCreationTokens: 0,
        occurredAt: '2026-04-29T14:00:01Z',
      });

      const svc = new AgentsService({ db });
      const detail = await svc.getByKey('KAN-1');
      expect(detail).not.toBeNull();
      expect(detail).toMatchObject({
        key: 'KAN-1',
        project: 'demo',
        ticket_key: 'KAN-1',
        ticket_title: 'Demo title',
        state: 'pr_open',
        worktree_path: '/work/KAN-1',
        pr_url: 'https://github.com/x/y/pull/1',
        tool_call_count: 2,
        tokens: {
          total: 100 + 25 + 5 + 7 + 200 + 50 + 10 + 0,
          input: 25 + 50,
          output: 100 + 200,
          cache_read: 5 + 10,
          cache_creation: 7,
        },
      });
      expect(detail?.runs).toHaveLength(2);
      expect(detail?.runs[0]).toMatchObject({
        command: 'run',
        started_at: '2026-04-29T12:00:00Z',
        completed_at: '2026-04-29T13:00:00Z',
      });
      expect(detail?.runs[1]).toMatchObject({
        command: 'fix-pr',
        completed_at: '2026-04-29T15:00:00Z',
      });
      expect(typeof detail?.runs[0].id).toBe('string');
    } finally {
      await db.destroy();
    }
  });

  it('returns pr_url as null when not set', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-2');
      await makeRun(db, 'KAN-2', 's1');
      const detail = await new AgentsService({ db }).getByKey('KAN-2');
      expect(detail).not.toBeNull();
      expect(detail?.pr_url).toBeNull();
      expect(detail?.state).toBe('initializing');
    } finally {
      await db.destroy();
    }
  });

  // CREW-116: same finish-aware logic must apply on the single-agent endpoint.
  it('returns finished after a finish run completes ok (single-agent endpoint)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-FIN-1');
      const r1 = await makeRun(db, 'KAN-FIN-1', 'sfin1', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title finished',
        tokens: 1,
      });
      await makeRun(db, 'KAN-FIN-1', `finish-KAN-FIN-1-1`, {
        command: 'finish',
        completedAt: '2026-04-29T14:00:00Z',
        exitCode: 0,
      });
      const detail = await new AgentsService({ db }).getByKey('KAN-FIN-1');
      expect(detail?.state).toBe('finished');
    } finally {
      await db.destroy();
    }
  });

  it('keeps state at pr_open while a finish run is in progress (single-agent endpoint)', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-FIN-2');
      const r1 = await makeRun(db, 'KAN-FIN-2', 'sfin2', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, r1, {
        tool: 'Bash',
        summary: 'gh pr create --title hi',
        tokens: 1,
      });
      await makeRun(db, 'KAN-FIN-2', `finish-KAN-FIN-2-1`, { command: 'finish' });
      const detail = await new AgentsService({ db }).getByKey('KAN-FIN-2');
      expect(detail?.state).toBe('pr_open');
    } finally {
      await db.destroy();
    }
  });

  it('zero tool_calls produces all-zero token breakdown and tool_call_count of 0', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-3');
      await makeRun(db, 'KAN-3', 's1');
      const detail = await new AgentsService({ db }).getByKey('KAN-3');
      expect(detail?.tool_call_count).toBe(0);
      expect(detail?.tokens).toEqual({
        total: 0,
        input: 0,
        output: 0,
        cache_read: 0,
        cache_creation: 0,
      });
    } finally {
      await db.destroy();
    }
  });
});

describe('AgentsService.getStateHistory', () => {
  it('returns transitions ordered by ts ascending', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1');
      // Insert out of order to prove the query orders by ts.
      await makeStateTransition(db, 'KAN-1', 'pr_open', 3000, 'running');
      await makeStateTransition(db, 'KAN-1', 'init', 1000, null);
      await makeStateTransition(db, 'KAN-1', 'running', 2000, 'init');
      const out = await new AgentsService({ db }).getStateHistory('KAN-1');
      expect(out.transitions.map((t) => t.to)).toEqual(['init', 'running', 'pr_open']);
      expect(out.transitions.map((t) => t.from)).toEqual([null, 'init', 'running']);
      expect(out.transitions.map((t) => t.ts)).toEqual([1000, 2000, 3000]);
    } finally {
      await db.destroy();
    }
  });

  it('returns an empty transitions list when none exist for the key', async () => {
    const db = await freshDb();
    try {
      const out = await new AgentsService({ db }).getStateHistory('NOPE-99');
      expect(out).toEqual({ transitions: [] });
    } finally {
      await db.destroy();
    }
  });

  it('only returns transitions for the requested agent', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1');
      await makeAgent(db, 'KAN-2');
      await makeStateTransition(db, 'KAN-1', 'init', 100, null);
      await makeStateTransition(db, 'KAN-2', 'init', 200, null);
      await makeStateTransition(db, 'KAN-2', 'running', 300, 'init');
      const out = await new AgentsService({ db }).getStateHistory('KAN-2');
      expect(out.transitions).toHaveLength(2);
      expect(out.transitions.map((t) => t.to)).toEqual(['init', 'running']);
    } finally {
      await db.destroy();
    }
  });
});
