import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import { buildApp, type DaemonApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createDb, runMigrations } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir();
const silentLogger: Logger = pino({ level: 'silent' });

async function setupApp(
  opts: { runnerLogDir?: string } = {},
): Promise<{ app: DaemonApp; close: () => Promise<void> }> {
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
