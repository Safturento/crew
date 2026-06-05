import { describe, it, expect } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { configValid } from './config-valid.js';

const validConfig = {
  name: 'x',
  repo_path: '/x',
  default_branch: 'main',
  jira: { project_key: 'X', site: 'https://x.atlassian.net' },
  github: { repo: 'u/r' },
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: ['kysely_migration*'],
  },
} as unknown as ProjectConfig;

describe('config-valid', () => {
  it('is a project-scoped check with no fix', () => {
    expect(configValid.scope).toBe('project');
    expect(configValid.fix).toBeUndefined();
  });

  it('ok when the config re-parses cleanly', async () => {
    const r = await configValid.detect({ config: validConfig, worktree: '/tmp/x' });
    expect(r.status).toBe('ok');
  });

  it('fails with a zod issue summary + remediation when the config is invalid', async () => {
    const broken = { name: 'x' } as unknown as ProjectConfig;
    const r = await configValid.detect({ config: broken, worktree: '/tmp/x' });
    expect(r.status).toBe('fail');
    expect(r.headline).toMatch(/invalid/i);
    // a missing required field should surface in the summary
    expect(r.headline + JSON.stringify(r.details)).toMatch(/jira|github|repo_path/);
    expect(r.remediation).toContain('crew init');
  });
});
