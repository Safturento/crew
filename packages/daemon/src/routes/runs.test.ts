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
import type { SseEvent } from '../services/EventBus.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir('crew-runs-route-');
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
  const eventBus = app.diContainer.cradle.eventBus;
  return { app, db, eventBus };
}

const validBody = {
  key: 'KAN-1',
  projectName: 'demo',
  ticketTitle: 'Demo title',
  worktreePath: '/x',
  branch: 'KAN-1',
  sessionId: 's1',
  command: 'run' as const,
  startedAt: '2026-04-29T12:00:00Z',
};

describe('POST /api/agents/runs', () => {
  it('creates an agent + run on first call for a new key (201)', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: validBody,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { agent: { key: string }; run: { id: number } };
      expect(body.agent.key).toBe('KAN-1');
      expect(body.run.id).toBeGreaterThan(0);

      const agents = await db.selectFrom('agents').selectAll().execute();
      expect(agents).toHaveLength(1);
      const runs = await db.selectFrom('runs').selectAll().execute();
      expect(runs).toHaveLength(1);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('upserts the agent on a second registration with a different session', async () => {
    const { app, db } = await setupApp();
    try {
      await app.inject({ method: 'POST', url: '/api/agents/runs', payload: validBody });
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 's2', command: 'fix-pr', ticketTitle: '' },
      });
      expect(res2.statusCode).toBe(201);
      const agents = await db.selectFrom('agents').selectAll().execute();
      expect(agents).toHaveLength(1);
      // ticket_title preserved (COALESCE on empty string)
      expect(agents[0]?.ticket_title).toBe('Demo title');
      const runs = await db.selectFrom('runs').orderBy('id').selectAll().execute();
      expect(runs).toHaveLength(2);
      expect(runs[1]?.command).toBe('fix-pr');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  // CREW-233: the CLI passes the materialized per-worktree APP_URL so the
  // drawer's app pill can link to the agent's actual running app.
  it('stores the per-worktree appUrl on register', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, appUrl: 'http://localhost:51234' },
      });
      expect(res.statusCode).toBe(201);
      const agents = await db.selectFrom('agents').selectAll().execute();
      expect(agents[0]?.app_url).toBe('http://localhost:51234');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('preserves an existing app_url when a later register omits it (COALESCE)', async () => {
    const { app, db } = await setupApp();
    try {
      await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, appUrl: 'http://localhost:51234' },
      });
      // fix-pr re-register with no appUrl must not wipe the stored value.
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 's2', command: 'fix-pr' },
      });
      expect(res2.statusCode).toBe(201);
      const agents = await db.selectFrom('agents').selectAll().execute();
      expect(agents[0]?.app_url).toBe('http://localhost:51234');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 409 on duplicate session_id', async () => {
    const { app, db } = await setupApp();
    try {
      await app.inject({ method: 'POST', url: '/api/agents/runs', payload: validBody });
      const res = await app.inject({ method: 'POST', url: '/api/agents/runs', payload: validBody });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'session_already_registered' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 400 on invalid body (missing required field)', async () => {
    const { app, db } = await setupApp();
    try {
      const bad: Partial<typeof validBody> = { ...validBody };
      delete bad.sessionId;
      const res = await app.inject({ method: 'POST', url: '/api/agents/runs', payload: bad });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('POST /api/agents/runs/:runId/complete', () => {
  async function registerRun(app: Awaited<ReturnType<typeof setupApp>>['app']): Promise<number> {
    const res = await app.inject({ method: 'POST', url: '/api/agents/runs', payload: validBody });
    return (res.json() as { run: { id: number } }).run.id;
  }

  it('marks the run completed (204)', async () => {
    const { app, db } = await setupApp();
    try {
      const runId = await registerRun(app);
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      expect(res.statusCode).toBe(204);
      const run = await db
        .selectFrom('runs')
        .selectAll()
        .where('id', '=', runId)
        .executeTakeFirst();
      expect(run?.completed_at).toBe('2026-04-29T13:00:00Z');
      expect(run?.exit_code).toBe(0);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('captures Layer-1 metrics from the transcript on completion', async () => {
    const { app, db } = await setupApp();
    const home = tmp();
    const worktree = tmp();
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      writeFileSync(join(worktree, 'AGENTS.md'), '# root');

      const registerRes = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: {
          ...validBody,
          worktreePath: worktree,
          sessionId: 'metrics-session',
        },
      });
      const runId = (registerRes.json() as { run: { id: number } }).run.id;

      const projDir = claudeProjectDirFor(worktree, home);
      mkdirSync(projDir, { recursive: true });
      writeFileSync(
        join(projDir, 'metrics-session.jsonl'),
        [
          JSON.stringify({
            type: 'assistant',
            timestamp: '2026-04-29T12:30:00Z',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: 'a',
                  name: 'Read',
                  input: { file_path: join(worktree, 'AGENTS.md') },
                },
              ],
              usage: { output_tokens: 10 },
            },
          }),
          JSON.stringify({
            type: 'assistant',
            timestamp: '2026-04-29T12:31:00Z',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: 'b',
                  name: 'Bash',
                  input: { command: 'npm run typecheck' },
                },
              ],
              usage: { output_tokens: 10 },
            },
          }),
        ].join('\n'),
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      expect(res.statusCode).toBe(204);

      const run = await db
        .selectFrom('runs')
        .selectAll()
        .where('id', '=', runId)
        .executeTakeFirstOrThrow();
      expect(run.cleanliness_pass).toBe(1);
      expect(run.doc_load_coverage_pct).toBe(100);
    } finally {
      process.env.HOME = prevHome;
      await app.close();
      await db.destroy();
    }
  });

  it('returns 404 when the run does not exist', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/runs/99999/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 409 when the run is already completed', async () => {
    const { app, db } = await setupApp();
    try {
      const runId = await registerRun(app);
      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('publishes run.completed for a finish run that completes ok', async () => {
    const { app, db, eventBus } = await setupApp();
    try {
      const seen: SseEvent[] = [];
      eventBus.subscribe({ onEvent: (event) => seen.push(event) });

      const reg = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 'finish-1', command: 'finish' },
      });
      const runId = (reg.json() as { run: { id: number } }).run.id;

      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });

      const completed = seen.filter((e) => e.type === 'run.completed');
      expect(completed).toHaveLength(1);
      expect(completed[0]?.data).toEqual({
        key: validBody.key,
        ts: Date.parse('2026-04-29T13:00:00Z'),
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  // CREW-116: finish completion must record a `to_state='finished'` row and
  // publish `agent.state_changed` so Timeline / SSE consumers see it.
  it('writes a state_transitions row to finished when a finish run completes ok', async () => {
    const { app, db, eventBus } = await setupApp();
    try {
      const seen: SseEvent[] = [];
      eventBus.subscribe({ onEvent: (e) => seen.push(e) });

      const reg = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 'finish-fin-ok', command: 'finish' },
      });
      const runId = (reg.json() as { run: { id: number } }).run.id;

      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });

      const transitions = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', validBody.key)
        .execute();
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toMatchObject({
        agent_key: validBody.key,
        to_state: 'finished',
        ts: Date.parse('2026-04-29T13:00:00Z'),
      });

      const stateChanged = seen.filter((e) => e.type === 'agent.state_changed');
      expect(stateChanged).toHaveLength(1);
      expect(stateChanged[0]?.data).toMatchObject({
        key: validBody.key,
        to: 'finished',
        ts: Date.parse('2026-04-29T13:00:00Z'),
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('does not write a finished transition when a finish run exits non-zero', async () => {
    const { app, db } = await setupApp();
    try {
      const reg = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 'finish-fail-2', command: 'finish' },
      });
      const runId = (reg.json() as { run: { id: number } }).run.id;

      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 1, completedAt: '2026-04-29T13:00:00Z' },
      });

      const transitions = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', validBody.key)
        .execute();
      expect(transitions).toHaveLength(0);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('does not write a finished transition when a non-finish run completes ok', async () => {
    const { app, db } = await setupApp();
    try {
      const runId = await registerRun(app);
      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });

      const transitions = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', validBody.key)
        .execute();
      // No 'finished' row from a normal `run` completion — that path stays
      // tool-call-driven (and for our test fixture there are no tool_calls).
      expect(transitions.filter((t) => t.to_state === 'finished')).toHaveLength(0);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('does not publish run.completed when exit_code is non-zero', async () => {
    const { app, db, eventBus } = await setupApp();
    try {
      const seen: SseEvent[] = [];
      eventBus.subscribe({ onEvent: (event) => seen.push(event) });

      const reg = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 'finish-fail', command: 'finish' },
      });
      const runId = (reg.json() as { run: { id: number } }).run.id;

      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 1, completedAt: '2026-04-29T13:00:00Z' },
      });

      expect(seen.filter((e) => e.type === 'run.completed')).toHaveLength(0);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  // CREW-198: a clean fix-pr completion closes the cycle by transitioning
  // `running → pr_open`. recordRunCompleted only fires when the agent is in
  // `running`, so the route doesn't need to filter explicitly.
  it('writes a running → pr_open transition when a fix-pr run completes ok with the agent in running', async () => {
    const { app, db } = await setupApp();
    try {
      // Seed: agent in `running` via a prior state transition.
      const reg = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 'fixpr-complete-ok', command: 'fix-pr' },
      });
      const runId = (reg.json() as { run: { id: number } }).run.id;
      await db
        .insertInto('state_transitions')
        .values({
          agent_key: validBody.key,
          from_state: 'pr_open',
          to_state: 'running',
          ts: Date.parse('2026-04-29T12:30:00Z'),
        })
        .execute();

      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });

      const transitions = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', validBody.key)
        .orderBy('id', 'asc')
        .execute();
      expect(transitions.map((t) => `${t.from_state}->${t.to_state}`)).toEqual([
        'pr_open->running',
        'running->pr_open',
      ]);
      expect(transitions[1]).toMatchObject({
        ts: Date.parse('2026-04-29T13:00:00Z'),
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('does not write a fix-pr cycle-back transition when exit_code is non-zero', async () => {
    const { app, db } = await setupApp();
    try {
      const reg = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 'fixpr-complete-fail', command: 'fix-pr' },
      });
      const runId = (reg.json() as { run: { id: number } }).run.id;
      await db
        .insertInto('state_transitions')
        .values({
          agent_key: validBody.key,
          from_state: 'pr_open',
          to_state: 'running',
          ts: Date.parse('2026-04-29T12:30:00Z'),
        })
        .execute();

      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 1, completedAt: '2026-04-29T13:00:00Z' },
      });

      const cycleBack = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', validBody.key)
        .where('from_state', '=', 'running')
        .where('to_state', '=', 'pr_open')
        .execute();
      expect(cycleBack).toHaveLength(0);
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
