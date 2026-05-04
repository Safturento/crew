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

  it('returns the single registered project', async () => {
    const { app, db, projectsDir } = await setup();
    try {
      writeFileSync(
        join(projectsDir, 'kanban-api.toml'),
        validToml('kanban-api', '/code/kanban-api'),
      );
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        projects: [{ name: 'kanban-api', repoPath: '/code/kanban-api' }],
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
          { name: 'alpha', repoPath: '/code/alpha' },
          { name: 'mid', repoPath: '/code/mid' },
          { name: 'zeta', repoPath: '/code/zeta' },
        ],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
