import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runEnvInit } from '../../../commands/env.js';
import { fail, ok, type HealthCheck } from '../types.js';

/**
 * Verify a project's `env.toml` has been materialized into `.env`.
 *
 * `detect()`: a project without an `env.toml` is healthy (nothing to do). When
 * one is present, the project is healthy iff `.env` has been written (or the
 * vars are already in `ctx.envVars`). `fix()` delegates to the existing
 * `runEnvInit`, which is the single source of materialization.
 */
export const envMaterialized: HealthCheck = {
  name: 'env-materialized',
  scope: 'project',
  detect: async ({ worktree, envVars }) => {
    const specPath = join(worktree, 'env.toml');
    if (!existsSync(specPath)) {
      return ok('no env.toml — nothing to materialize');
    }

    const envPath = join(worktree, '.env');
    if (existsSync(envPath) || (envVars && Object.keys(envVars).length > 0)) {
      return ok('.env materialized from env.toml');
    }

    return fail('env.toml present but .env is not materialized', {
      remediation: 'crew env init',
      fixable: true,
      details: { spec: specPath, expected: envPath },
    });
  },
  fix: async ({ worktree, config }) => {
    const result = await runEnvInit({ worktree, config, log: () => {} });
    if (!result.ok) {
      throw new Error(result.reason ?? 'crew env init failed');
    }
  },
};
