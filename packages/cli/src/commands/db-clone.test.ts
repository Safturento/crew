import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDbCloneCommand, computeComposeProject, type DbCloneCommandDeps } from './db-clone.js';
import { runDbClone } from '../lib/db-clone/index.js';
import type { ProjectConfig } from '../lib/index.js';

vi.mock('../lib/db-clone/index.js', () => ({ runDbClone: vi.fn() }));
const mockedRunDbClone = vi.mocked(runDbClone);

const config: ProjectConfig = {
  name: 'recipes-app',
  repo_path: '/home/u/Repos/Recipes-App',
  default_branch: 'main',
  jira: { project_key: 'KAN', site: 'https://example.atlassian.net', ready_status: 'Ready for Development' },
  github: { repo: 'u/r' },
  docker: {
    canonical_worktree: 'Recipes-App',
    http_port_base: 8000,
    https_port_base: 8400,
    postgres_port_base: 15400,
    caddy_service: 'caddy',
    postgres_service: 'postgres',
  },
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: ['user'],
    exclude_tables: ['kysely_migration*'],
  },
};

function makeDeps(overrides: Partial<DbCloneCommandDeps> = {}): DbCloneCommandDeps & {
  logs: string[];
} {
  const logs: string[] = [];
  return {
    config,
    log: (m) => logs.push(m),
    logs,
    ...overrides,
  };
}

beforeEach(() => {
  mockedRunDbClone.mockReset();
});

describe('computeComposeProject', () => {
  it('lowercases the basename of the worktree path', () => {
    expect(computeComposeProject('/home/u/Repos/Recipes-App')).toBe('recipes-app');
    expect(computeComposeProject('/home/u/Repos/Recipes-App-KAN-23')).toBe('recipes-app-kan-23');
  });

  it('handles trailing slashes', () => {
    expect(computeComposeProject('/home/u/Repos/Recipes-App/')).toBe('recipes-app');
  });
});

describe('runDbCloneCommand', () => {
  it('refuses when the project config has no [docker] section', async () => {
    const deps = makeDeps({ config: { ...config, docker: undefined } });
    const result = await runDbCloneCommand('KAN-23', deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/\[docker\]/);
    expect(mockedRunDbClone).not.toHaveBeenCalled();
  });

  it('passes computed canonical and target compose project names to runDbClone', async () => {
    mockedRunDbClone.mockResolvedValueOnce(undefined);

    const result = await runDbCloneCommand('KAN-23', makeDeps());

    expect(result.ok).toBe(true);
    expect(mockedRunDbClone).toHaveBeenCalledTimes(1);
    expect(mockedRunDbClone).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalProject: 'recipes-app',
        targetProject: 'recipes-app-kan-23',
        settings: config.db_clone,
      }),
    );
  });

  it('forwards an error message from runDbClone as the reason', async () => {
    mockedRunDbClone.mockRejectedValueOnce(new Error('canonical container missing'));

    const result = await runDbCloneCommand('KAN-23', makeDeps());

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('canonical container missing');
  });
});
