import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
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

afterEach(() => vi.restoreAllMocks());

const validToml = (name: string, repoPath: string) => `
name = "${name}"
repo_path = "${repoPath}"

[jira]
project_key = "KAN"
site = "https://example.atlassian.net"

[github]
repo = "example/${name}"
`;

async function setup(jira?: { email: string; token: string }) {
  const root = tmp();
  const projectsDir = join(root, 'projects');
  mkdirSync(projectsDir, { recursive: true });
  const config = parseDaemonConfig({
    CREW_CONFIG_DIR: projectsDir,
    CREW_DB_FILE: ':memory:',
    ...(jira ? { CREW_JIRA_EMAIL: jira.email, CREW_JIRA_API_TOKEN: jira.token } : {}),
  });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger: silentLogger, db });
  return { app, db, projectsDir };
}

function expectedProject(name: string, repoPath: string, activeCount = 0) {
  return { name, repoPath, branch: 'main', jiraKey: 'KAN', activeCount };
}

describe('GET /api/projects', () => {
  it('returns an empty list when no projects are registered', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ projects: [] });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns the single registered project with expanded shape', async () => {
    const { app, db, projectsDir } = await setup();
    try {
      writeFileSync(
        join(projectsDir, 'kanban-api.toml'),
        validToml('kanban-api', '/code/kanban-api'),
      );
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        projects: [expectedProject('kanban-api', '/code/kanban-api')],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('alphabetizes projects by name', async () => {
    const { app, db, projectsDir } = await setup();
    try {
      writeFileSync(join(projectsDir, 'zeta.toml'), validToml('zeta', '/code/zeta'));
      writeFileSync(join(projectsDir, 'mid.toml'), validToml('mid', '/code/mid'));
      writeFileSync(join(projectsDir, 'alpha.toml'), validToml('alpha', '/code/alpha'));
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        projects: [
          expectedProject('alpha', '/code/alpha'),
          expectedProject('mid', '/code/mid'),
          expectedProject('zeta', '/code/zeta'),
        ],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('carries branch and jiraKey through from the project config', async () => {
    const { app, db, projectsDir } = await setup();
    try {
      writeFileSync(
        join(projectsDir, 'p.toml'),
        `name = "p"
repo_path = "/p"
default_branch = "develop"
[jira]
project_key = "PROJ"
site = "https://example.atlassian.net"
[github]
repo = "example/p"
`,
      );
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        projects: [
          { name: 'p', repoPath: '/p', branch: 'develop', jiraKey: 'PROJ', activeCount: 0 },
        ],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns activeCount derived from registered agents', async () => {
    const { app, db, projectsDir } = await setup();
    try {
      writeFileSync(join(projectsDir, 'k.toml'), validToml('k', '/code/k'));
      await db
        .insertInto('agents')
        .values([
          {
            key: 'K-1',
            project_name: 'k',
            ticket_title: 'one',
            worktree_path: '/k/1',
            branch: 'K-1',
            pr_url: null,
            created_at: '2026-04-29T12:00:00Z',
          },
          {
            key: 'K-2',
            project_name: 'k',
            ticket_title: 'two',
            worktree_path: '/k/2',
            branch: 'K-2',
            pr_url: null,
            created_at: '2026-04-29T12:00:00Z',
          },
        ])
        .execute();
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        projects: [expectedProject('k', '/code/k', 2)],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('GET /api/projects/:slug', () => {
  it('returns the full ProjectConfig + on-disk configPath for a known slug', async () => {
    const { app, db, projectsDir } = await setup();
    try {
      writeFileSync(
        join(projectsDir, 'kanban-api.toml'),
        validToml('kanban-api', '/code/kanban-api'),
      );
      const res = await app.inject({ method: 'GET', url: '/api/projects/kanban-api' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.project).toMatchObject({
        name: 'kanban-api',
        repo_path: '/code/kanban-api',
        jira: { project_key: 'KAN' },
      });
      expect(body.configPath).toBe(join(projectsDir, 'kanban-api.toml'));
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 404 for an unknown slug', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/projects/does-not-exist' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ resource: 'project', id: 'does-not-exist' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('GET /api/projects/:slug/tickets', () => {
  it('returns a degraded payload (200) when the daemon has no Jira creds', async () => {
    const { app, db, projectsDir } = await setup();
    try {
      writeFileSync(join(projectsDir, 'k.toml'), validToml('k', '/code/k'));
      const res = await app.inject({ method: 'GET', url: '/api/projects/k/tickets' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ available: false, reason: 'no_credentials' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 404 for an unknown slug before touching Jira', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/projects/nope/tickets' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ resource: 'project', id: 'nope' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  // With creds present, the full available payload must round-trip the
  // discriminatedUnion response serializer — the branch the degraded tests
  // don't exercise. JiraClient uses global fetch, so we mock that.
  it('serializes the available grouped payload end-to-end (200)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          issues: [
            {
              key: 'KAN-2',
              fields: {
                summary: 'Child of epic',
                status: { name: 'Ready for Development' },
                parent: { key: 'KAN-100', fields: { summary: 'Epic A' } },
                priority: { name: 'High' },
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { app, db, projectsDir } = await setup({ email: 'e@x', token: 't' });
    try {
      writeFileSync(join(projectsDir, 'k.toml'), validToml('k', '/code/k'));
      const res = await app.inject({ method: 'GET', url: '/api/projects/k/tickets' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        available: true,
        groups: [
          {
            epicKey: 'KAN-100',
            epicSummary: 'Epic A',
            tickets: [
              {
                key: 'KAN-2',
                summary: 'Child of epic',
                priority: 'High',
                runnable: true,
                blockedBy: [],
                hasActiveAgent: false,
              },
            ],
          },
        ],
      });
      // The single search call carried the configured ready_status into the JQL.
      // URLSearchParams encodes spaces as '+', so normalize before matching.
      const jql = new URL(String(fetchSpy.mock.calls[0][0])).searchParams.get('jql');
      expect(jql).toContain('status = "Ready for Development"');
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
