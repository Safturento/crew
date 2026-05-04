import { describe, it, expect } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
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
