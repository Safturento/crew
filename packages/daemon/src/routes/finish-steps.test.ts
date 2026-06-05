import { describe, it, expect } from 'vitest';
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

async function setupApp(): Promise<{ app: DaemonApp; close: () => Promise<void> }> {
  const dir = tmp();
  const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir, CREW_DB_FILE: join(dir, 'state.db') });
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

describe('POST /api/agents/:key/finish-step', () => {
  it('persists a step and echoes it back', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/CREW-1/finish-step',
        payload: { index: 0, label: 'lint', status: 'ok', ts: 1_700_000_000_000 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        key: 'CREW-1',
        index: 0,
        label: 'lint',
        status: 'ok',
        ts: 1_700_000_000_000,
      });
    } finally {
      await close();
    }
  });

  it('rejects a status outside ok|skip|error with 400', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/CREW-1/finish-step',
        payload: { index: 0, label: 'lint', status: 'bogus', ts: 1 },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await close();
    }
  });
});

describe('GET /api/agents/:key/finish-steps', () => {
  it('returns the steps in emission order', async () => {
    const { app, close } = await setupApp();
    try {
      await app.inject({
        method: 'POST',
        url: '/api/agents/CREW-1/finish-step',
        payload: { index: 0, label: 'lint', status: 'ok', ts: 1 },
      });
      await app.inject({
        method: 'POST',
        url: '/api/agents/CREW-1/finish-step',
        payload: { index: 1, label: 'test', status: 'error', detail: 'boom', ts: 2 },
      });

      const res = await app.inject({ method: 'GET', url: '/api/agents/CREW-1/finish-steps' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.steps.map((s: { label: string }) => s.label)).toEqual(['lint', 'test']);
      expect(body.steps[0].detail).toBeNull();
      expect(body.steps[1].detail).toBe('boom');
    } finally {
      await close();
    }
  });

  it('returns an empty list for an agent with no finish steps', async () => {
    const { app, close } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/agents/NOPE-1/finish-steps' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ steps: [] });
    } finally {
      await close();
    }
  });
});
