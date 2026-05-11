import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pino, type Logger } from 'pino';
import { ProjectsService, type AgentsCounter } from './ProjectsService.js';
import { useTmpDir } from '../test/tmpdir.js';

const tmp = useTmpDir();
const silentLogger: Logger = pino({ level: 'silent' });

const tomlWith = (
  name: string,
  repoPath: string,
  opts: { defaultBranch?: string; jiraKey?: string } = {},
) => `
name = "${name}"
repo_path = "${repoPath}"
default_branch = "${opts.defaultBranch ?? 'main'}"

[jira]
project_key = "${opts.jiraKey ?? 'KAN'}"
site = "https://example.atlassian.net"

[github]
repo = "example/${name}"
`;

const validToml = (name: string, repoPath: string) => tomlWith(name, repoPath);

function projectsDir(): string {
  const dir = join(tmp(), 'projects');
  mkdirSync(dir, { recursive: true });
  return dir;
}

const emptyAgentsCounter: AgentsCounter = {
  async countByProject() {
    return new Map();
  },
};

function fixedCounter(counts: Record<string, number>): AgentsCounter {
  return {
    async countByProject() {
      return new Map(Object.entries(counts));
    },
  };
}

describe('ProjectsService.list', () => {
  it('returns projects from valid TOML files, alphabetized by name', async () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'zeta.toml'), validToml('zeta', '/tmp/zeta'));
    writeFileSync(join(dir, 'alpha.toml'), validToml('alpha', '/tmp/alpha'));

    const svc = new ProjectsService({
      projectsDir: dir,
      logger: silentLogger,
      agentsService: emptyAgentsCounter,
    });
    expect(await svc.list()).toEqual([
      { name: 'alpha', repoPath: '/tmp/alpha', branch: 'main', jiraKey: 'KAN', activeCount: 0 },
      { name: 'zeta', repoPath: '/tmp/zeta', branch: 'main', jiraKey: 'KAN', activeCount: 0 },
    ]);
  });

  it('skips invalid TOMLs and logs a warning, returning the valid ones', async () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'good.toml'), validToml('good', '/tmp/good'));
    writeFileSync(join(dir, 'broken.toml'), 'this = is not [valid toml');
    const warnSpy = vi.spyOn(silentLogger, 'warn');
    try {
      const svc = new ProjectsService({
        projectsDir: dir,
        logger: silentLogger,
        agentsService: emptyAgentsCounter,
      });
      expect(await svc.list()).toEqual([
        { name: 'good', repoPath: '/tmp/good', branch: 'main', jiraKey: 'KAN', activeCount: 0 },
      ]);
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns an empty array when the projects dir does not exist', async () => {
    const svc = new ProjectsService({
      projectsDir: join(tmp(), 'absent'),
      logger: silentLogger,
      agentsService: emptyAgentsCounter,
    });
    expect(await svc.list()).toEqual([]);
  });

  it('ignores non-.toml files', async () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'good.toml'), validToml('good', '/tmp/good'));
    writeFileSync(join(dir, 'README.md'), 'hello');
    const svc = new ProjectsService({
      projectsDir: dir,
      logger: silentLogger,
      agentsService: emptyAgentsCounter,
    });
    expect(await svc.list()).toEqual([
      { name: 'good', repoPath: '/tmp/good', branch: 'main', jiraKey: 'KAN', activeCount: 0 },
    ]);
  });

  it('carries default_branch and jira.project_key from each project config', async () => {
    const dir = projectsDir();
    writeFileSync(
      join(dir, 'a.toml'),
      tomlWith('a', '/a', { defaultBranch: 'develop', jiraKey: 'A' }),
    );
    writeFileSync(
      join(dir, 'b.toml'),
      tomlWith('b', '/b', { defaultBranch: 'trunk', jiraKey: 'B' }),
    );
    const svc = new ProjectsService({
      projectsDir: dir,
      logger: silentLogger,
      agentsService: emptyAgentsCounter,
    });
    expect(await svc.list()).toEqual([
      { name: 'a', repoPath: '/a', branch: 'develop', jiraKey: 'A', activeCount: 0 },
      { name: 'b', repoPath: '/b', branch: 'trunk', jiraKey: 'B', activeCount: 0 },
    ]);
  });

  it('joins activeCount from agentsService.countByProject()', async () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'a.toml'), validToml('a', '/a'));
    writeFileSync(join(dir, 'b.toml'), validToml('b', '/b'));
    const svc = new ProjectsService({
      projectsDir: dir,
      logger: silentLogger,
      agentsService: fixedCounter({ a: 3, b: 0 }),
    });
    const result = await svc.list();
    expect(result.find((p) => p.name === 'a')?.activeCount).toBe(3);
    expect(result.find((p) => p.name === 'b')?.activeCount).toBe(0);
  });
});
