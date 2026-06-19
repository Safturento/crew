import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { createDb, runMigrations } from './db.js';
import { createLogger } from './logger.js';
import { ConfigDirNotFoundError, NotFoundError } from './errors.js';
import { useTmpDir } from './test/tmpdir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');

const tmp = useTmpDir();

async function buildTestApp(opts: { dashboardDistDir?: string } = {}) {
  const db = createDb(':memory:');
  await runMigrations(db, MIGRATIONS_DIR);
  return buildApp({
    config: {
      port: 0,
      host: '127.0.0.1',
      configDir: '/tmp/does-not-matter',
      dbFile: ':memory:',
      pidFile: '/tmp/daemon.pid',
      logFile: '/tmp/daemon.log',
      transcriptsHome: undefined,
      runnerLogDir: '/tmp/does-not-matter/runner',
      // Pinned to the package-level empty temp dir (src/test/setup.ts) so the
      // onReady startup-event watcher's initial scan is a clean no-op.
      startupEventsDir: process.env.CREW_STARTUP_EVENTS_DIR ?? '/tmp/does-not-matter/startup',
      // Same blanket safety net for the state-event watcher (CREW-254).
      stateEventsDir: process.env.CREW_STATE_EVENTS_DIR ?? '/tmp/does-not-matter/state-events',
    },
    logger: createLogger(),
    db,
    dashboardDistDir: opts.dashboardDistDir,
  });
}

describe('buildApp', () => {
  it('GET /health returns { ok: true }', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('returns 404 for unknown routes', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('maps NotFoundError to 404 via setErrorHandler', async () => {
    const app = await buildTestApp();
    app.get('/__test/not-found', () => {
      throw new NotFoundError('thing missing', { resource: 'thing', id: 'abc' });
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/__test/not-found' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'thing missing' });
    } finally {
      await app.close();
    }
  });

  it('maps ConfigDirNotFoundError to 503 via setErrorHandler', async () => {
    const app = await buildTestApp();
    app.get('/__test/no-config-dir', () => {
      throw new ConfigDirNotFoundError('/tmp/missing-config-dir');
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/__test/no-config-dir' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({
        error: expect.stringContaining('/tmp/missing-config-dir'),
      });
    } finally {
      await app.close();
    }
  });
});

describe('static dashboard serving', () => {
  function makeDist(html = '<!DOCTYPE html><html><body>hi</body></html>'): string {
    const distDir = join(tmp(), 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'index.html'), html);
    return distDir;
  }

  it('serves index.html at / when dist directory exists', async () => {
    const distDir = makeDist();
    const app = await buildTestApp({ dashboardDistDir: distDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<body>hi</body>');
    } finally {
      await app.close();
    }
  });

  it('falls back to index.html for SPA routes', async () => {
    const distDir = makeDist('<!DOCTYPE html><html><body>spa</body></html>');
    const app = await buildTestApp({ dashboardDistDir: distDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/agents/KAN-31' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<body>spa</body>');
    } finally {
      await app.close();
    }
  });

  it('serves a placeholder when dashboardDistDir is missing', async () => {
    const app = await buildTestApp({ dashboardDistDir: '/nonexistent/path' });
    try {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.body).toContain('dashboard not built');
    } finally {
      await app.close();
    }
  });

  it('does not intercept /api routes with the SPA fallback', async () => {
    const distDir = makeDist('<!DOCTYPE html><html><body>shell</body></html>');
    const app = await buildTestApp({ dashboardDistDir: distDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ projects: [] });
    } finally {
      await app.close();
    }
  });

  it('returns JSON 404 for unknown /api routes even with dist present', async () => {
    const distDir = makeDist();
    const app = await buildTestApp({ dashboardDistDir: distDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });
});
