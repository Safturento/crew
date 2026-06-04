import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import { buildApp, type DaemonApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import type { Kysely } from 'kysely';
import { useTmpDir } from '../test/tmpdir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir();
const silentLogger: Logger = pino({ level: 'silent' });

const crewToml = `
name = "crew"
repo_path = "/code/crew"

[jira]
project_key = "CREW"
site = "https://example.atlassian.net"

[github]
repo = "example/crew"
`;

async function setup(): Promise<{ app: DaemonApp; db: Kysely<DaemonDatabase> }> {
  const root = tmp();
  const projectsDir = join(root, 'projects');
  mkdirSync(projectsDir, { recursive: true });
  writeFileSync(join(projectsDir, 'crew.toml'), crewToml);
  const config = parseDaemonConfig({
    CREW_CONFIG_DIR: projectsDir,
    CREW_DB_FILE: ':memory:',
  });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger: silentLogger, db });
  return { app, db };
}

describe('POST /api/actions', () => {
  it('enqueues a run action against a registered project', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: { kind: 'run', ticketKey: 'CREW-1', project: 'crew' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        kind: 'run',
        ticketKey: 'CREW-1',
        project: 'crew',
        status: 'pending',
        payload: { kind: 'run' },
      });
      expect(body.id).toBeGreaterThan(0);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('rejects an unregistered project with 404', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: { kind: 'run', ticketKey: 'NOPE-1', project: 'ghost' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ resource: 'project', id: 'ghost' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('rejects a fix_pr action with no comment via Zod (400)', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: { kind: 'fix_pr', ticketKey: 'CREW-1', project: 'crew' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('invalid_input');
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('GET /api/actions/pending', () => {
  it('claims an already-pending action immediately', async () => {
    const { app, db } = await setup();
    try {
      const enqueued = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: { kind: 'run', ticketKey: 'CREW-1', project: 'crew' },
      });
      const id = enqueued.json().id;

      const res = await app.inject({
        method: 'GET',
        url: '/api/actions/pending?timeoutMs=5000',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id, status: 'claimed' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('resolves promptly when a pending action lands during the long-poll', async () => {
    const { app, db } = await setup();
    try {
      const pendingPromise = app.inject({
        method: 'GET',
        url: '/api/actions/pending?timeoutMs=5000',
      });
      const enqueued = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: { kind: 'run', ticketKey: 'CREW-9', project: 'crew' },
      });
      const res = await pendingPromise;
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: enqueued.json().id, status: 'claimed' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns a 200 null body on timeout when nothing is pending', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/actions/pending?timeoutMs=50',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toBeNull();
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('hands a single pending action to exactly one of two concurrent long-polls', async () => {
    const { app, db } = await setup();
    try {
      const pollA = app.inject({ method: 'GET', url: '/api/actions/pending?timeoutMs=1500' });
      const pollB = app.inject({ method: 'GET', url: '/api/actions/pending?timeoutMs=1500' });
      const enqueued = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: { kind: 'run', ticketKey: 'CREW-7', project: 'crew' },
      });
      const [a, b] = await Promise.all([pollA, pollB]);

      const bodies = [a.json(), b.json()];
      const claimed = bodies.filter((x) => x !== null);
      const empty = bodies.filter((x) => x === null);
      // One poll wins the row; the other drains to a null timeout — never a
      // double-claim, never an orphaned `claimed` row left behind.
      expect(claimed).toHaveLength(1);
      expect(empty).toHaveLength(1);
      expect(claimed[0]).toMatchObject({ id: enqueued.json().id, status: 'claimed' });

      const rows = await db.selectFrom('action_requests').select('status').execute();
      expect(rows).toEqual([{ status: 'claimed' }]);
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('POST /api/actions/:id/result', () => {
  it('records a launched result and returns 204', async () => {
    const { app, db } = await setup();
    try {
      const enqueued = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: { kind: 'run', ticketKey: 'CREW-1', project: 'crew' },
      });
      const id = enqueued.json().id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/actions/${id}/result`,
        payload: { status: 'launched' },
      });
      expect(res.statusCode).toBe(204);

      const row = await db
        .selectFrom('action_requests')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('launched');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 404 for an unknown action id', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/actions/9999/result',
        payload: { status: 'failed', error: 'boom' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ resource: 'action', id: '9999' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
