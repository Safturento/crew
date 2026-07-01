import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import type { Kysely } from 'kysely';
import { buildApp, type DaemonApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir();
const silentLogger: Logger = pino({ level: 'silent' });

async function setupApp(
  opts: { runnerLogDir?: string } = {},
): Promise<{ app: DaemonApp; db: Kysely<DaemonDatabase>; close: () => Promise<void> }> {
  const dir = tmp();
  const config = parseDaemonConfig({
    CREW_CONFIG_DIR: dir,
    CREW_DB_FILE: join(dir, 'state.db'),
    CREW_RUNNER_LOG_DIR: opts.runnerLogDir ?? join(dir, 'runner'),
  });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger: silentLogger, db });
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.destroy();
    },
  };
}

describe('POST /api/runner/heartbeat', () => {
  it('records a heartbeat and reports online', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/api/runner/heartbeat' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.online).toBe(true);
      expect(typeof body.lastSeen).toBe('number');
    } finally {
      await close();
    }
  });
});

describe('GET /api/runner/status', () => {
  it('reports offline with an empty process list before any heartbeat', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ online: false, lastSeen: null, processes: [] });
    } finally {
      await close();
    }
  });

  it('reports online after a heartbeat', async () => {
    const { app, close } = await setupApp();
    try {
      await app.inject({ method: 'POST', url: '/api/runner/heartbeat' });
      const res = await app.inject({ method: 'GET', url: '/api/runner/status' });
      expect(res.json().online).toBe(true);
    } finally {
      await close();
    }
  });
});

const sampleProcess = {
  agentKey: 'CREW-231',
  command: 'run' as const,
  pid: 4242,
  pgid: 4242,
  actionRequestId: null,
  spawnedAt: '2026-06-16T00:00:00.000Z',
  state: 'running' as const,
  project: 'crew',
};

describe('POST /api/runner/heartbeat with a snapshot', () => {
  it('stores the snapshot and surfaces it on GET /api/runner/status', async () => {
    const { app, close } = await setupApp();
    try {
      const beat = await app.inject({
        method: 'POST',
        url: '/api/runner/heartbeat',
        payload: { snapshot: { processes: [sampleProcess] } },
      });
      expect(beat.statusCode).toBe(200);
      expect(beat.json().processes).toEqual([sampleProcess]);

      const status = await app.inject({ method: 'GET', url: '/api/runner/status' });
      expect(status.json().processes).toEqual([sampleProcess]);
    } finally {
      await close();
    }
  });

  it('rejects a malformed snapshot with 400', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runner/heartbeat',
        payload: { snapshot: { processes: [{ ...sampleProcess, state: 'zombie' }] } },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await close();
    }
  });
});

describe('runner command routes', () => {
  it('enqueues, claims, and reports a command through its lifecycle', async () => {
    const { app, close } = await setupApp();
    try {
      // Enqueue → 201 pending.
      const enq = await app.inject({
        method: 'POST',
        url: '/api/runner/commands',
        payload: { agentKey: 'CREW-231', kind: 'cancel_soft', payload: null },
      });
      expect(enq.statusCode).toBe(201);
      const command = enq.json();
      expect(command.kind).toBe('cancel_soft');
      expect(command.status).toBe('pending');
      expect(command.agentKey).toBe('CREW-231');

      // Claim → the oldest pending row, flipped to claimed.
      const claim = await app.inject({ method: 'GET', url: '/api/runner/commands/pending' });
      expect(claim.statusCode).toBe(200);
      expect(claim.json().id).toBe(command.id);
      expect(claim.json().status).toBe('claimed');

      // Result → 204; the row is now applied.
      const result = await app.inject({
        method: 'POST',
        url: `/api/runner/commands/${command.id}/result`,
        payload: { status: 'applied' },
      });
      expect(result.statusCode).toBe(204);

      // Nothing left pending → 200 with a null body.
      const empty = await app.inject({ method: 'GET', url: '/api/runner/commands/pending' });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toBeNull();
    } finally {
      await close();
    }
  });

  it.each(['supervisor_stop', 'supervisor_restart'] as const)(
    'enqueues and claims a queue-level %s supervisor command (null agentKey)',
    async (kind) => {
      const { app, close } = await setupApp();
      try {
        const enq = await app.inject({
          method: 'POST',
          url: '/api/runner/commands',
          payload: { agentKey: null, kind, payload: null },
        });
        expect(enq.statusCode).toBe(201);
        expect(enq.json().kind).toBe(kind);
        expect(enq.json().agentKey).toBeNull();

        const claim = await app.inject({ method: 'GET', url: '/api/runner/commands/pending' });
        expect(claim.statusCode).toBe(200);
        expect(claim.json().id).toBe(enq.json().id);
        expect(claim.json().kind).toBe(kind);
        expect(claim.json().status).toBe('claimed');
      } finally {
        await close();
      }
    },
  );

  it('rejects an unknown command kind with 400', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runner/commands',
        payload: { agentKey: 'CREW-231', kind: 'nuke' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await close();
    }
  });

  it('reports a failed apply with its error string', async () => {
    const { app, close } = await setupApp();
    try {
      const enq = await app.inject({
        method: 'POST',
        url: '/api/runner/commands',
        payload: { agentKey: null, kind: 'dequeue' },
      });
      const id = enq.json().id;
      await app.inject({ method: 'GET', url: '/api/runner/commands/pending' });
      const result = await app.inject({
        method: 'POST',
        url: `/api/runner/commands/${id}/result`,
        payload: { status: 'failed', error: 'no such pending action' },
      });
      expect(result.statusCode).toBe(204);
    } finally {
      await close();
    }
  });
});

const FAILURE = {
  check: 'git-remote',
  headline: 'No git remote configured',
  remediation: 'Add an origin remote and retry.',
  output: '✗ preflight: No git remote configured',
};

describe('POST /api/runner/launching', () => {
  it('pre-registers a launching run and returns its id', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runner/launching',
        payload: {
          key: 'CREW-1',
          projectName: 'crew',
          command: 'run',
          worktreePath: '/tmp/crew-1',
          branch: 'CREW-1',
          startedAt: '2026-06-17T00:00:00.000Z',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(typeof res.json().runId).toBe('number');
    } finally {
      await close();
    }
  });
});

describe('POST /api/runner/initializing', () => {
  it('births an init agent row when none exists and returns 204', async () => {
    const { app, db, close } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runner/initializing',
        payload: {
          key: 'HA-7',
          projectName: 'home-assistant',
          worktreePath: '/w/home-assistant-HA-7',
          branch: 'HA-7',
        },
      });
      expect(res.statusCode).toBe(204);
      const agent = await db
        .selectFrom('agents')
        .selectAll()
        .where('key', '=', 'HA-7')
        .executeTakeFirstOrThrow();
      expect(agent.worktree_path).toBe('/w/home-assistant-HA-7');
      const transition = await db
        .selectFrom('state_transitions')
        .select('to_state')
        .where('agent_key', '=', 'HA-7')
        .orderBy('ts', 'desc')
        .executeTakeFirstOrThrow();
      expect(transition.to_state).toBe('init');
    } finally {
      await close();
    }
  });

  it('rejects a body missing the worktree path with 400', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runner/initializing',
        payload: { key: 'HA-7', projectName: 'home-assistant', branch: 'HA-7' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await close();
    }
  });
});

describe('POST /api/runner/failed-start', () => {
  it('records a structured failed-start for a launching run', async () => {
    const { app, close } = await setupApp();
    try {
      await app.inject({
        method: 'POST',
        url: '/api/runner/launching',
        payload: {
          key: 'CREW-2',
          projectName: 'crew',
          command: 'run',
          worktreePath: '/tmp/crew-2',
          branch: 'CREW-2',
          startedAt: '2026-06-17T00:00:00.000Z',
        },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/runner/failed-start',
        payload: { key: 'CREW-2', projectName: 'crew', command: 'run', failure: FAILURE },
      });
      expect(res.statusCode).toBe(201);
      expect(typeof res.json().runId).toBe('number');
    } finally {
      await close();
    }
  });

  it('rejects a body missing the failure diagnosis with 400', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runner/failed-start',
        payload: { key: 'CREW-2', projectName: 'crew', command: 'run' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await close();
    }
  });
});

describe('GET /api/runner/logs', () => {
  it('returns an empty tail when the log file is absent', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/logs' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ lines: [] });
    } finally {
      await close();
    }
  });

  it('tails the last N lines of the mounted log file', async () => {
    const dir = tmp();
    const logDir = join(dir, 'runner');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, 'runner.log'), 'one\ntwo\nthree\nfour\n');
    const { app, close } = await setupApp({ runnerLogDir: logDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/logs?tail=2' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ lines: ['three', 'four'] });
    } finally {
      await close();
    }
  });

  it('rejects a non-numeric tail with 400', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/logs?tail=banana' });
      expect(res.statusCode).toBe(400);
    } finally {
      await close();
    }
  });
});

describe('GET /api/runner/page', () => {
  it('returns empty lists when the db is empty', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/page' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ failedToStart: [], queued: [], recentlyEnded: [] });
    } finally {
      await close();
    }
  });

  it('returns the failed-start, queued, and recently-ended lists from the db', async () => {
    const { app, db, close } = await setupApp();
    try {
      // A fresh failed-start (also a terminal run → recentlyEnded).
      await app.inject({
        method: 'POST',
        url: '/api/runner/failed-start',
        payload: { key: 'CREW-A', projectName: 'crew', command: 'run', failure: FAILURE },
      });
      // A pending action request → queued.
      await db
        .insertInto('action_requests')
        .values({
          kind: 'fix_pr',
          ticket_key: 'CREW-B',
          project: 'crew',
          payload: '{"kind":"fix_pr","comment":"x"}',
          status: 'pending',
          error: null,
          created_at: '2026-06-25T00:02:00.000Z',
          updated_at: '2026-06-25T00:02:00.000Z',
        })
        .execute();

      const res = await app.inject({ method: 'GET', url: '/api/runner/page' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.failedToStart.map((r: { key: string }) => r.key)).toContain('CREW-A');
      expect(body.queued.map((q: { key: string }) => q.key)).toContain('CREW-B');
      expect(body.queued[0].command).toBe('fix-pr');
      expect(body.recentlyEnded.map((r: { key: string }) => r.key)).toContain('CREW-A');
    } finally {
      await close();
    }
  });
});

describe('GET /api/runner/supervisor-log', () => {
  it('returns an empty tail when runner.log is absent', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/supervisor-log' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ lines: [] });
    } finally {
      await close();
    }
  });

  it('filters runner.log to supervisor management lines, dropping per-action noise', async () => {
    const dir = tmp();
    const logDir = join(dir, 'runner');
    mkdirSync(logDir, { recursive: true });
    // Lines below are the verbatim `deps.log(...)` strings the runner emits in
    // packages/cli/src/lib/runner/{supervisor,loop}.ts — management lines plus
    // the per-action/per-command noise the filter must drop.
    writeFileSync(
      join(logDir, 'runner.log'),
      [
        '[2026-06-25T00:00:00.000Z] runner started (pid 1)',
        '[2026-06-25T00:00:01.000Z] runner already running (pid 1)',
        '[2026-06-25T00:00:02.000Z] runner failed to start (no pid)',
        '[2026-06-25T00:00:03.000Z] launched action 5 (run CREW-1)',
        '[2026-06-25T00:00:04.000Z] worker exited 1; respawning',
        '[2026-06-25T00:00:05.000Z] removed stale pidfile (pid 9)',
        '[2026-06-25T00:00:06.000Z] reaped 2 dead process(es): CREW-2, CREW-3',
        '[2026-06-25T00:00:07.000Z] poll error: timeout',
        '[2026-06-25T00:00:08.000Z] applied command 7 (cancel_soft CREW-4)',
        '',
      ].join('\n'),
    );
    const { app, close } = await setupApp({ runnerLogDir: logDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/supervisor-log' });
      expect(res.statusCode).toBe(200);
      const { lines } = res.json() as { lines: string[] };
      // Every supervisor-lifecycle line is kept, including the failed-to-start
      // diagnostic and the already-running guard.
      expect(lines.some((l) => l.includes('runner started'))).toBe(true);
      expect(lines.some((l) => l.includes('runner already running'))).toBe(true);
      expect(lines.some((l) => l.includes('runner failed to start'))).toBe(true);
      expect(lines.some((l) => l.includes('respawning'))).toBe(true);
      expect(lines.some((l) => l.includes('removed stale pidfile'))).toBe(true);
      expect(lines.some((l) => l.includes('reaped'))).toBe(true);
      // Per-action/per-command noise is dropped.
      expect(lines.some((l) => l.includes('launched action'))).toBe(false);
      expect(lines.some((l) => l.includes('poll error'))).toBe(false);
      expect(lines.some((l) => l.includes('applied command'))).toBe(false);
    } finally {
      await close();
    }
  });

  it('serves the unfiltered tail with ?raw=1', async () => {
    const dir = tmp();
    const logDir = join(dir, 'runner');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(
      join(logDir, 'runner.log'),
      '[2026-06-25T00:00:00.000Z] runner started (pid 1)\n[2026-06-25T00:00:01.000Z] launched action 5 (run CREW-1)\n',
    );
    const { app, close } = await setupApp({ runnerLogDir: logDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/supervisor-log?raw=1' });
      const { lines } = res.json() as { lines: string[] };
      expect(lines.some((l) => l.includes('launched action'))).toBe(true);
    } finally {
      await close();
    }
  });
});
