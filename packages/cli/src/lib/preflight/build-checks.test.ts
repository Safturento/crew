import { describe, it, expect } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { buildPreflightChecks } from './build-checks.js';

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

describe('buildPreflightChecks', () => {
  it('returns an empty array when no checks apply', () => {
    expect(buildPreflightChecks(baseConfig)).toEqual([]);
  });
});

describe('buildPreflightChecks — Check 2', () => {
  it('includes excluded-commands when bruno_smoke enabled', () => {
    const config = {
      ...baseConfig,
      bruno_smoke: {
        enabled: true,
        base_url: 'https://localhost:17253',
        collection_dir: 'bruno',
      },
    } as unknown as ProjectConfig;
    const checks = buildPreflightChecks(config);
    expect(checks.some((c) => c.name === 'excluded-commands')).toBe(true);
  });

  it('includes excluded-commands when playwright.authored enabled', () => {
    const config = {
      ...baseConfig,
      playwright: {
        app_url: 'https://localhost:17253',
        authored: {
          enabled: true,
          tests_dir: 'tests/e2e',
          test_command: 'npm run test:e2e',
          verify_after_run: false,
          verify_max_attempts: 2,
        },
      },
    } as unknown as ProjectConfig;
    const checks = buildPreflightChecks(config);
    expect(checks.some((c) => c.name === 'excluded-commands')).toBe(true);
  });

  it('omits excluded-commands when neither block enabled', () => {
    const checks = buildPreflightChecks(baseConfig);
    expect(checks.some((c) => c.name === 'excluded-commands')).toBe(false);
  });
});
