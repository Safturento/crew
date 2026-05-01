import { describe, it, expect } from 'vitest';
import { authoredEnabled, playwrightEnabled, smokeEnabled } from './mode-flags.js';
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
      authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e' },
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
      authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e' },
    };
    expect(playwrightEnabled(cfg)).toBe(true);
    expect(smokeEnabled(cfg)).toBe(true);
    expect(authoredEnabled(cfg)).toBe(true);
  });
});
