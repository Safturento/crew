import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';
import { createDb } from './db.js';
import { createLogger } from './logger.js';
import { ConfigDirNotFoundError, NotFoundError } from './errors.js';

async function buildTestApp() {
  return buildApp({
    config: {
      port: 0,
      configDir: '/tmp/does-not-matter',
      dbFile: ':memory:',
      pidFile: '/tmp/daemon.pid',
      logFile: '/tmp/daemon.log',
    },
    logger: createLogger(),
    db: createDb(':memory:'),
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
