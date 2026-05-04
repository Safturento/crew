import { describe, it, expect, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { runPreflight } from './run-preflight.js';
import { PreflightError } from './types.js';
import type { PreflightCheck } from './types.js';

const baseConfig = {
  canonical_worktree: 'main',
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: ['kysely_migration*'],
  },
} as unknown as ProjectConfig;

describe('runPreflight', () => {
  it('resolves cleanly when no checks are registered', async () => {
    await expect(
      runPreflight({ config: baseConfig, worktree: '/tmp/wt', checks: [] }),
    ).resolves.toBeUndefined();
  });

  it('runs each registered check in order', async () => {
    const order: string[] = [];
    const a: PreflightCheck = {
      name: 'a',
      run: async () => {
        order.push('a');
      },
    };
    const b: PreflightCheck = {
      name: 'b',
      run: async () => {
        order.push('b');
      },
    };

    await runPreflight({ config: baseConfig, worktree: '/tmp/wt', checks: [a, b] });
    expect(order).toEqual(['a', 'b']);
  });

  it('passes config and worktree through to each check', async () => {
    const observed: { config?: ProjectConfig; worktree?: string } = {};
    const check: PreflightCheck = {
      name: 'observe',
      run: async (ctx) => {
        observed.config = ctx.config;
        observed.worktree = ctx.worktree;
      },
    };

    await runPreflight({ config: baseConfig, worktree: '/tmp/wt-x', checks: [check] });
    expect(observed.config).toBe(baseConfig);
    expect(observed.worktree).toBe('/tmp/wt-x');
  });

  it('forwards optional dockerPorts and envVars to each check', async () => {
    const observed: { dockerPorts?: unknown; envVars?: unknown } = {};
    const check: PreflightCheck = {
      name: 'observe',
      run: async (ctx) => {
        observed.dockerPorts = ctx.dockerPorts;
        observed.envVars = ctx.envVars;
      },
    };

    await runPreflight({
      config: baseConfig,
      worktree: '/tmp/wt',
      checks: [check],
      dockerPorts: { httpPort: 8001, httpsPort: 8401, postgresPort: 15401 },
      envVars: { APP_HOST: 'localhost' },
    });
    expect(observed.dockerPorts).toEqual({ httpPort: 8001, httpsPort: 8401, postgresPort: 15401 });
    expect(observed.envVars).toEqual({ APP_HOST: 'localhost' });
  });

  it('throws PreflightError on first failing check and stops', async () => {
    const aRan = vi.fn();
    const bRan = vi.fn();
    const cRan = vi.fn();

    const a: PreflightCheck = {
      name: 'a',
      run: async () => {
        aRan();
      },
    };
    const b: PreflightCheck = {
      name: 'b',
      run: async () => {
        bRan();
        throw new PreflightError('b', 'b failed', 'fix b');
      },
    };
    const c: PreflightCheck = { name: 'c', run: cRan };

    await expect(
      runPreflight({ config: baseConfig, worktree: '/tmp/wt', checks: [a, b, c] }),
    ).rejects.toBeInstanceOf(PreflightError);

    expect(aRan).toHaveBeenCalled();
    expect(bRan).toHaveBeenCalled();
    expect(cRan).not.toHaveBeenCalled();
  });
});
