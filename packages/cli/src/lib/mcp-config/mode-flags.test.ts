import { describe, it, expect } from 'vitest';
import {
  authoredEnabled,
  playwrightEnabled,
  smokeEnabled,
  verifyAfterRunEnabled,
} from './mode-flags.js';
import type { ProjectConfig } from 'crew-shared';

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'a/b' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  } as ProjectConfig;
}

describe('mode-flags accessors', () => {
  it('all return false when [playwright] is absent', () => {
    const cfg = baseConfig();
    expect(playwrightEnabled(cfg)).toBe(false);
    expect(smokeEnabled(cfg)).toBe(false);
    expect(authoredEnabled(cfg)).toBe(false);
  });

  it('returns smoke=true, authored=false when only smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://x', smoke: { enabled: true } };
    expect(playwrightEnabled(cfg)).toBe(true);
    expect(smokeEnabled(cfg)).toBe(true);
    expect(authoredEnabled(cfg)).toBe(false);
  });

  it('returns smoke=false, authored=true when only authored is enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'http://x',
      authored: {
        enabled: true,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: false,
        verify_max_attempts: 2,
      },
    };
    expect(playwrightEnabled(cfg)).toBe(true);
    expect(smokeEnabled(cfg)).toBe(false);
    expect(authoredEnabled(cfg)).toBe(true);
  });

  it('returns true for all when both are enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'http://x',
      smoke: { enabled: true },
      authored: {
        enabled: true,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: false,
        verify_max_attempts: 2,
      },
    };
    expect(playwrightEnabled(cfg)).toBe(true);
    expect(smokeEnabled(cfg)).toBe(true);
    expect(authoredEnabled(cfg)).toBe(true);
  });
});

describe('verifyAfterRunEnabled', () => {
  it('returns false when authored is absent', () => {
    expect(verifyAfterRunEnabled(baseConfig())).toBe(false);
  });

  it('returns false when authored is enabled but verify_after_run is unset/false', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'http://x',
      authored: {
        enabled: true,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: false,
        verify_max_attempts: 2,
      },
    };
    expect(verifyAfterRunEnabled(cfg)).toBe(false);
  });

  it('returns true when authored is enabled and verify_after_run is true', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'http://x',
      authored: {
        enabled: true,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: true,
        verify_max_attempts: 2,
      },
    };
    expect(verifyAfterRunEnabled(cfg)).toBe(true);
  });
});
