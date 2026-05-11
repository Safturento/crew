import { describe, it, expect } from 'vitest';
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

const validToml = (name: string, repoPath: string) => `
name = "${name}"
repo_path = "${repoPath}"

[jira]
project_key = "KAN"
site = "https://example.atlassian.net"

[github]
repo = "example/${name}"
`;

async function setup() {
  const root = tmp();
  const projectsDir = join(root, 'projects');
  mkdirSync(projectsDir, { recursive: true });
  const config = parseDaemonConfig({
    CREW_CONFIG_DIR: projectsDir,
    CREW_DB_FILE: ':memory:',
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
