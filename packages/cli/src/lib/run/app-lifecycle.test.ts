import { describe, it, expect } from 'vitest';
import { agentNeedsAppRunning } from './app-lifecycle.js';
import type { ProjectConfig } from 'crew-shared';

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net', ready_status: 'Ready for Development' },
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

describe('agentNeedsAppRunning', () => {
  it('returns false when neither playwright nor bruno_smoke is enabled', () => {
    expect(agentNeedsAppRunning(baseConfig())).toBe(false);
  });

  it('returns true when playwright.smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://x', smoke: { enabled: true } };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when playwright.authored is enabled', () => {
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
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when bruno_smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'bruno' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when both playwright and bruno are enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://x', smoke: { enabled: true } };
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'bruno' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });
});
