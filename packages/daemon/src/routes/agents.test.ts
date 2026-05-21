import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import { claudeProjectDirFor } from 'crew-shared';
import { buildApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createDb, runMigrations } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir();
const silentLogger: Logger = pino({ level: 'silent' });

async function setupApp() {
  const dir = tmp();
  const config = parseDaemonConfig({
    CREW_CONFIG_DIR: dir,
    CREW_DB_FILE: join(dir, 'state.db'),
  });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger: silentLogger, db });
  return { app, db };
}

describe('GET /api/agents', () => {
  it('returns an empty list when no agents are registered', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ agents: [] });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns the registered agents derived from agents/runs/tool_calls', async () => {
    const { app, db } = await setupApp();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-1',
          project_name: 'demo',
          ticket_title: 'Demo title',
          worktree_path: '/x',
          branch: 'KAN-1',
          pr_url: null,
          created_at: '2026-04-29T12:00:00Z',
        })
        .execute();
      await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-1',
          command: 'run',
          session_id: 's1',
          started_at: '2026-04-29T12:00:00Z',
          completed_at: null,
          exit_code: null,
        })
        .execute();
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        agents: [
          {
            key: 'KAN-1',
            projectName: 'demo',
            ticketTitle: 'Demo title',
            state: 'initializing',
            startedAt: '2026-04-29T12:00:00Z',
            tokens: 0,
          },
        ],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('GET /api/agents/:key', () => {
  it('returns 404 when no run exists for the key', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/agents/NOPE-99' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'agent_not_found' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns the AgentDetail shape for a seeded agent end-to-end', async () => {
    const { app, db } = await setupApp();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-1',
          project_name: 'demo',
          ticket_title: 'Demo title',
          worktree_path: '/work/KAN-1',
          branch: 'KAN-1',
          pr_url: 'https://github.com/x/y/pull/42',
          created_at: '2026-04-29T12:00:00Z',
        })
        .execute();
      const r1 = await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-1',
          command: 'run',
          session_id: 's1',
          started_at: '2026-04-29T12:00:00Z',
          completed_at: '2026-04-29T13:00:00Z',
          exit_code: 0,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await db
        .insertInto('tool_calls')
        .values({
          run_id: r1.id,
          tool_name: 'Bash',
          input_summary: 'gh pr create --title hello',
          output_tokens: 100,
          input_tokens: 25,
          cache_read_tokens: 5,
          cache_creation_tokens: 7,
          occurred_at: '2026-04-29T13:00:01Z',
        })
        .execute();

      const res = await app.inject({ method: 'GET', url: '/api/agents/KAN-1' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        key: 'KAN-1',
        project: 'demo',
        ticket_key: 'KAN-1',
        ticket_title: 'Demo title',
        state: 'pr_open',
        worktree_path: '/work/KAN-1',
        pr_url: 'https://github.com/x/y/pull/42',
        tool_call_count: 1,
        tokens: { total: 137, input: 25, output: 100, cache_read: 5, cache_creation: 7 },
      });
      expect(body.runs).toHaveLength(1);
      expect(body.runs[0]).toMatchObject({
        command: 'run',
        started_at: '2026-04-29T12:00:00Z',
        completed_at: '2026-04-29T13:00:00Z',
      });
      expect(typeof body.runs[0].id).toBe('string');
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('GET /api/agents/:key — per-run metrics', () => {
  it('surfaces the metric columns on each detail run', async () => {
    const { app, db } = await setupApp();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-5',
          project_name: 'demo',
          ticket_title: 'Demo',
          worktree_path: '/work/KAN-5',
          branch: 'KAN-5',
          pr_url: null,
          created_at: '2026-05-13T12:00:00Z',
        })
        .execute();
      await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-5',
          command: 'run',
          session_id: 's1',
          started_at: '2026-05-13T12:00:00Z',
          completed_at: '2026-05-13T13:00:00Z',
          exit_code: 0,
          doc_load_coverage_pct: 80,
          cleanliness_pass: 1,
          pr_claim_input_tokens: 42000,
          parity_violations: 0,
        })
        .execute();

      const res = await app.inject({ method: 'GET', url: '/api/agents/KAN-5' });
      expect(res.statusCode).toBe(200);
      expect(res.json().runs[0]).toMatchObject({
        doc_load_coverage_pct: 80,
        cleanliness_pass: 1,
        pr_claim_input_tokens: 42000,
        parity_violations: 0,
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('reports null metrics for a run that has not been measured', async () => {
    const { app, db } = await setupApp();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-6',
          project_name: 'demo',
          ticket_title: 'Demo',
          worktree_path: '/work/KAN-6',
          branch: 'KAN-6',
          pr_url: null,
          created_at: '2026-05-13T12:00:00Z',
        })
        .execute();
      await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-6',
          command: 'run',
          session_id: 's1',
          started_at: '2026-05-13T12:00:00Z',
          completed_at: null,
          exit_code: null,
        })
        .execute();

      const res = await app.inject({ method: 'GET', url: '/api/agents/KAN-6' });
      expect(res.statusCode).toBe(200);
      expect(res.json().runs[0]).toMatchObject({
        doc_load_coverage_pct: null,
        cleanliness_pass: null,
        pr_claim_input_tokens: null,
        parity_violations: null,
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('GET /api/agents/:key/state-history', () => {
  it('returns transitions ordered by ts ascending for a seeded trail', async () => {
    const { app, db } = await setupApp();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-7',
          project_name: 'demo',
          ticket_title: 'Demo',
          worktree_path: '/x',
          branch: 'KAN-7',
          pr_url: null,
          created_at: '2026-04-29T12:00:00Z',
        })
        .execute();
      // Insert deliberately out of order to confirm the route sorts by ts.
      await db
        .insertInto('state_transitions')
        .values([
          { agent_key: 'KAN-7', from_state: 'running', to_state: 'pr_open', ts: 3000 },
          { agent_key: 'KAN-7', from_state: null, to_state: 'init', ts: 1000 },
          { agent_key: 'KAN-7', from_state: 'init', to_state: 'running', ts: 2000 },
        ])
        .execute();

      const res = await app.inject({ method: 'GET', url: '/api/agents/KAN-7/state-history' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        transitions: [
          { from: null, to: 'init', ts: 1000 },
          { from: 'init', to: 'running', ts: 2000 },
          { from: 'running', to: 'pr_open', ts: 3000 },
        ],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns an empty transitions list for an unknown key (never 404s)', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/agents/NOPE-99/state-history' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ transitions: [] });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('GET /api/agents/:key/timeline', () => {
  async function seedAgentRun(
    db: Awaited<ReturnType<typeof setupApp>>['db'],
    opts: { worktreePath: string; sessionId: string },
  ) {
    await db
      .insertInto('agents')
      .values({
        key: 'KAN-1',
        project_name: 'demo',
        ticket_title: 'Demo',
        worktree_path: opts.worktreePath,
        branch: 'KAN-1',
        pr_url: null,
        created_at: '2026-04-29T12:00:00Z',
      })
      .execute();
    await db
      .insertInto('runs')
      .values({
        agent_key: 'KAN-1',
        command: 'run',
        session_id: opts.sessionId,
        started_at: '2026-04-29T12:00:00Z',
        completed_at: null,
        exit_code: null,
      })
      .execute();
  }

  it('returns parsed events for a seeded transcript', async () => {
    const { app, db } = await setupApp();
    const home = tmp();
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const worktree = '/tmp/Demo-KAN-1';
      const sessionId = 'session-xyz';
      await seedAgentRun(db, { worktreePath: worktree, sessionId });

      const projDir = claudeProjectDirFor(worktree, home);
      mkdirSync(projDir, { recursive: true });
      writeFileSync(
        join(projDir, `${sessionId}.jsonl`),
        [
          JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 5 }),
          JSON.stringify({ type: 'pr-link', prNumber: 1, prUrl: 'https://github.com/x/y/pull/1' }),
        ].join('\n'),
      );

      const res = await app.inject({ method: 'GET', url: '/api/agents/KAN-1/timeline' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.events).toBeInstanceOf(Array);
      expect(body.events.length).toBe(2);
      expect(res.headers['x-crew-warning']).toBeUndefined();
    } finally {
      process.env.HOME = prevHome;
      await app.close();
      await db.destroy();
    }
  });

  it('returns 200 + empty events + warning header when transcript missing', async () => {
    const { app, db } = await setupApp();
    const home = tmp();
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      await seedAgentRun(db, { worktreePath: '/tmp/Demo-KAN-1', sessionId: 'session-missing' });

      const res = await app.inject({ method: 'GET', url: '/api/agents/KAN-1/timeline' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ events: [] });
      expect(res.headers['x-crew-warning']).toBe('transcript-missing');
    } finally {
      process.env.HOME = prevHome;
      await app.close();
      await db.destroy();
    }
  });

  it('returns 200 + empty events + warning header when no run exists for the key', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/agents/NOPE-99/timeline' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ events: [] });
      expect(res.headers['x-crew-warning']).toBe('transcript-missing');
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('PATCH /api/agents/:key', () => {
  it('updates ticket_title and returns 204 on success', async () => {
    const { app, db } = await setupApp();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-23',
          project_name: 'demo',
          ticket_title: null,
          worktree_path: '/x',
          branch: 'KAN-23',
          pr_url: null,
          created_at: '2026-04-29T12:00:00Z',
        })
        .execute();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/agents/KAN-23',
        payload: { ticketTitle: 'Add board archival endpoint' },
      });
      expect(res.statusCode).toBe(204);

      const row = await db
        .selectFrom('agents')
        .select(['ticket_title'])
        .where('key', '=', 'KAN-23')
        .executeTakeFirst();
      expect(row?.ticket_title).toBe('Add board archival endpoint');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 404 when no agent matches the key', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/agents/NOPE-99',
        payload: { ticketTitle: 'anything' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('rejects a body without ticketTitle with 400', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/agents/KAN-23',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
