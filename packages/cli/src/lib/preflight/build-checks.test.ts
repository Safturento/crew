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

  // Tickets B and C will each add tests here when their checks are registered.
});
