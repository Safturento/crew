import { describe, it, expect } from 'vitest';
import { runFigmaSnapshot, type FigmaSnapshotDeps } from './figma-snapshot.js';
import type { ProjectConfig } from '../lib/index.js';

const baseConfig: ProjectConfig = {
  name: 'crew',
  repo_path: '/home/u/Repos/crew',
  default_branch: 'main',
  jira: { project_key: 'CREW', site: 'https://x.atlassian.net' },
  github: { repo: 'u/crew' },
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: ['kysely_migration*'],
  },
};

function makeDeps(overrides: Partial<FigmaSnapshotDeps> = {}): FigmaSnapshotDeps {
  return {
    worktree: '/tmp/nonexistent',
    config: baseConfig,
    log: () => {},
    ...overrides,
  };
}

describe('runFigmaSnapshot', () => {
  it('returns ok=false with a reason when [visual_fidelity] is missing from project config', async () => {
    const result = await runFigmaSnapshot(makeDeps());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/visual_fidelity/);
  });

  it('returns ok=true as a no-op when skip_snapshot=true', async () => {
    const result = await runFigmaSnapshot(
      makeDeps({
        config: {
          ...baseConfig,
          visual_fidelity: {
            figma_file_key: 'X',
            figma_pages: ['P1'],
            component_dir: 'src',
            dashboard_url: 'http://x',
            snapshot_path: '.crew/figma-snapshot',
            code_connect_glob: '**/*.figma.tsx',
            skip_snapshot: true,
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.nodesExported).toBe(0);
    expect(result.reason).toMatch(/skip_snapshot/);
  });
});
