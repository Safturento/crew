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
  it('reports offline before any heartbeat', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/runner/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ online: false, lastSeen: null });
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
