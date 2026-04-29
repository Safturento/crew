import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pino, type Logger } from 'pino';
import { ProjectsService } from './ProjectsService.js';
import { useTmpDir } from '../test/tmpdir.js';

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

function projectsDir(): string {
  const dir = join(tmp(), 'projects');
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ProjectsService.list', () => {
  it('returns projects from valid TOML files, alphabetized by name', () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'zeta.toml'), validToml('zeta', '/tmp/zeta'));
    writeFileSync(join(dir, 'alpha.toml'), validToml('alpha', '/tmp/alpha'));

    const svc = new ProjectsService({ projectsDir: dir, logger: silentLogger });
    expect(svc.list()).toEqual([
      { name: 'alpha', repoPath: '/tmp/alpha' },
      { name: 'zeta', repoPath: '/tmp/zeta' },
    ]);
  });

  it('skips invalid TOMLs and logs a warning, returning the valid ones', () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'good.toml'), validToml('good', '/tmp/good'));
    writeFileSync(join(dir, 'broken.toml'), 'this = is not [valid toml');
    const warnSpy = vi.spyOn(silentLogger, 'warn');
    try {
      const svc = new ProjectsService({ projectsDir: dir, logger: silentLogger });
      expect(svc.list()).toEqual([{ name: 'good', repoPath: '/tmp/good' }]);
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns an empty array when the projects dir does not exist', () => {
    const svc = new ProjectsService({
      projectsDir: join(tmp(), 'absent'),
      logger: silentLogger,
    });
    expect(svc.list()).toEqual([]);
  });

  it('ignores non-.toml files', () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'good.toml'), validToml('good', '/tmp/good'));
    writeFileSync(join(dir, 'README.md'), 'hello');
    const svc = new ProjectsService({ projectsDir: dir, logger: silentLogger });
    expect(svc.list()).toEqual([{ name: 'good', repoPath: '/tmp/good' }]);
  });
});
