import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type FigmaSnapshotDeps, runFigmaSnapshot } from './figma-snapshot.js';
import type { ProjectConfig } from 'crew-shared';

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

  it('writes a snapshot to <worktree>/<snapshot_path> when [visual_fidelity] is configured', async () => {
    const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-snap-'));
    try {
      const client = {
        getFile: vi.fn().mockResolvedValue({
          document: {
            id: '0:0',
            name: 'Document',
            type: 'DOCUMENT',
            children: [
              {
                id: '212:630',
                name: 'Composites',
                type: 'CANVAS',
                children: [{ id: '272:120', name: 'Pill', type: 'COMPONENT_SET', children: [] }],
              },
            ],
          },
        }),
        getImages: vi.fn().mockResolvedValue({ images: { '272:120': 'https://cdn/x.png' } }),
      };
      const logs: string[] = [];

      const result = await runFigmaSnapshot({
        worktree,
        config: {
          ...baseConfig,
          visual_fidelity: {
            figma_file_key: 'FILEKEY',
            figma_pages: ['Composites'],
            component_dir: 'src',
            dashboard_url: 'http://localhost:3000',
            snapshot_path: '.crew/figma-snapshot',
            code_connect_glob: '**/*.figma.tsx',
            skip_snapshot: false,
          },
        },
        log: (msg) => logs.push(msg),
        clientFactory: () => client as never,
        fetchImage: async () => Buffer.from('fake'),
      });

      expect(result.ok).toBe(true);
      expect(result.nodesExported).toBe(1);
      expect(existsSync(join(worktree, '.crew/figma-snapshot/composites/272-120.png'))).toBe(true);
      expect(existsSync(join(worktree, '.crew/figma-snapshot/index.json'))).toBe(true);
      const index = JSON.parse(
        readFileSync(join(worktree, '.crew/figma-snapshot/index.json'), 'utf8'),
      );
      expect(index['272:120'].name).toBe('Pill');
      expect(logs.some((m) => m.includes('Composites'))).toBe(true);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });

  it('surfaces client-thrown errors as ok=false with the message', async () => {
    const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-snap-err-'));
    try {
      const result = await runFigmaSnapshot({
        worktree,
        config: {
          ...baseConfig,
          visual_fidelity: {
            figma_file_key: 'FILEKEY',
            figma_pages: ['Composites'],
            component_dir: 'src',
            dashboard_url: 'http://x',
            snapshot_path: '.crew/figma-snapshot',
            code_connect_glob: '**/*.figma.tsx',
            skip_snapshot: false,
          },
        },
        log: () => {},
        clientFactory: () => {
          throw new Error('FIGMA_API_TOKEN env var is required');
        },
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/FIGMA_API_TOKEN/);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
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
