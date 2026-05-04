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

describe('buildPreflightChecks — Check 1', () => {
  it('includes app-url-reachability when [docker] + [playwright] is configured', () => {
    const config = {
      ...baseConfig,
      docker: {
        canonical_worktree: 'main',
        http_port_base: 8000,
        https_port_base: 8400,
        postgres_port_base: 15400,
      },
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
    expect(checks.some((c) => c.name === 'app-url-reachability')).toBe(true);
  });

  it('includes app-url-reachability when [docker] + [bruno_smoke] is configured', () => {
    const config = {
      ...baseConfig,
      docker: {
        canonical_worktree: 'main',
        http_port_base: 8000,
        https_port_base: 8400,
        postgres_port_base: 15400,
      },
      bruno_smoke: {
        enabled: true,
        base_url: 'https://localhost:17253',
        collection_dir: 'bruno',
      },
    } as unknown as ProjectConfig;
    const checks = buildPreflightChecks(config);
    expect(checks.some((c) => c.name === 'app-url-reachability')).toBe(true);
  });

  it('omits app-url-reachability when no docker', () => {
    const checks = buildPreflightChecks(baseConfig);
    expect(checks.some((c) => c.name === 'app-url-reachability')).toBe(false);
  });

  it('omits app-url-reachability when docker is configured but no playwright/bruno_smoke', () => {
    const config = {
      ...baseConfig,
      docker: {
        canonical_worktree: 'main',
        http_port_base: 8000,
        https_port_base: 8400,
        postgres_port_base: 15400,
      },
    } as unknown as ProjectConfig;
    const checks = buildPreflightChecks(config);
    expect(checks.some((c) => c.name === 'app-url-reachability')).toBe(false);
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
