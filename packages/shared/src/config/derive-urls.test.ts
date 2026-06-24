import { describe, it, expect } from 'vitest';
import { deriveAppUrl, deriveJiraUrl } from './derive-urls.js';
import type { ProjectConfig } from './schema.js';

function makeConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: 'kanban-api',
    repo_path: '~/code/kanban-api',
    default_branch: 'main',
    jira: { project_key: 'KAN', site: 'https://safturento.atlassian.net', ready_status: 'Ready for Development' },
    github: { repo: 'safturento/kanban-api' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
    ...overrides,
  } as ProjectConfig;
}

describe('deriveAppUrl', () => {
  it('returns playwright.app_url when present', () => {
    const cfg = makeConfig({
      playwright: { app_url: 'http://localhost:7421', smoke: { enabled: true } },
    });
    expect(deriveAppUrl(cfg)).toBe('http://localhost:7421');
  });

  it('falls back to bruno_smoke.base_url when playwright is missing', () => {
    const cfg = makeConfig({
      bruno_smoke: {
        enabled: true,
        base_url: 'http://localhost:7421/api',
        collection_dir: 'bruno',
      },
    });
    expect(deriveAppUrl(cfg)).toBe('http://localhost:7421/api');
  });

  it('prefers playwright.app_url over bruno_smoke.base_url when both are configured', () => {
    const cfg = makeConfig({
      playwright: { app_url: 'http://localhost:7421', smoke: { enabled: true } },
      bruno_smoke: {
        enabled: true,
        base_url: 'http://localhost:8000/api',
        collection_dir: 'bruno',
      },
    });
    expect(deriveAppUrl(cfg)).toBe('http://localhost:7421');
  });

  it('returns null when neither is configured', () => {
    expect(deriveAppUrl(makeConfig())).toBeNull();
  });
});

describe('deriveJiraUrl', () => {
  it('composes site + /browse/ + ticket key', () => {
    expect(deriveJiraUrl(makeConfig(), 'KAN-23')).toBe(
      'https://safturento.atlassian.net/browse/KAN-23',
    );
  });

  it('returns null when ticket_key is empty', () => {
    expect(deriveJiraUrl(makeConfig(), '')).toBeNull();
  });

  it('strips trailing slash from site', () => {
    const cfg = makeConfig({
      jira: { project_key: 'KAN', site: 'https://safturento.atlassian.net/', ready_status: 'Ready for Development' },
    });
    expect(deriveJiraUrl(cfg, 'KAN-23')).toBe('https://safturento.atlassian.net/browse/KAN-23');
  });
});
