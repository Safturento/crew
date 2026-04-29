import { describe, it, expect } from 'vitest';
import { agentNeedsAppRunning } from './app-lifecycle.js';
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

describe('agentNeedsAppRunning', () => {
  it('returns false when neither visual_testing nor bruno_smoke is enabled', () => {
    expect(agentNeedsAppRunning(baseConfig())).toBe(false);
  });

  it('returns true when visual_testing is enabled', () => {
    const cfg = baseConfig();
    cfg.visual_testing = { enabled: true, app_url: 'http://x' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when bruno_smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'bruno' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when both are enabled', () => {
    const cfg = baseConfig();
    cfg.visual_testing = { enabled: true, app_url: 'http://x' };
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'bruno' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });
});
