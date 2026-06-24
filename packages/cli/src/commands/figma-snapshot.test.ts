import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type FigmaSnapshotDeps, runFigmaSnapshot } from './figma-snapshot.js';
import type { ProjectConfig } from 'crew-shared';

const baseConfig: ProjectConfig = {
  name: 'crew',
  repo_path: '/home/u/Repos/crew',
  default_branch: 'main',
  jira: { project_key: 'CREW', site: 'https://x.atlassian.net', ready_status: 'Ready for Development' },
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

  describe('partial export (--node-id)', () => {
    const configWithVf: ProjectConfig = {
      ...baseConfig,
      visual_fidelity: {
        figma_file_key: 'FILEKEY',
        figma_pages: ['Composites', 'Dashboard Screens'],
        component_dir: 'src',
        dashboard_url: 'http://x',
        snapshot_path: '.crew/figma-snapshot',
        code_connect_glob: '**/*.figma.tsx',
      },
    };

    function makeSeededWorktree() {
      const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-partial-'));
      const snapDir = join(worktree, '.crew/figma-snapshot');
      mkdirSync(snapDir, { recursive: true });
      mkdirSync(join(snapDir, 'composites'), { recursive: true });
      const index = {
        '272:120': {
          name: 'Pill',
          type: 'COMPONENT_SET',
          page: 'Composites',
          screenshotPath: 'composites/272-120.png',
          metadataPath: 'composites/272-120.json',
        },
      };
      writeFileSync(join(snapDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
      writeFileSync(
        join(snapDir, 'meta.json'),
        `${JSON.stringify(
          { figmaFileVersion: 'v-baseline', capturedAt: '2026-05-15T00:00:00Z' },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(snapDir, 'composites/272-120.json'),
        `${JSON.stringify(
          {
            id: '272:120',
            name: 'Pill',
            type: 'COMPONENT_SET',
            page: 'Composites',
            raw: { id: '272:120', name: 'Pill', type: 'COMPONENT_SET', children: [] },
          },
          null,
          2,
        )}\n`,
      );
      return { worktree, snapDir };
    }

    it('rejects when no committed snapshot exists (no index.json)', async () => {
      const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-partial-empty-'));
      try {
        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          nodeIds: ['272:120'],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/no committed snapshot/i);
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });

    it('rejects an unknown node id without --page', async () => {
      const { worktree } = makeSeededWorktree();
      try {
        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          nodeIds: ['999:999'],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/not in committed snapshot/i);
        expect(result.reason).toMatch(/--page/);
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });

    it('rejects --page that is not in figma_pages', async () => {
      const { worktree } = makeSeededWorktree();
      try {
        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          nodeIds: ['999:999'],
          page: 'Sketches',
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/Sketches/);
        expect(result.reason).toMatch(/Composites/);
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });

    it('rejects a known node when --page names a different page', async () => {
      const { worktree } = makeSeededWorktree();
      try {
        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          nodeIds: ['272:120'],
          page: 'Dashboard Screens',
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/272:120/);
        expect(result.reason).toMatch(/Composites/);
        expect(result.reason).toMatch(/Dashboard Screens/);
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });

    it('partial-refreshes a known node, leaves meta.json untouched, returns nodesRefreshed=1', async () => {
      const { worktree, snapDir } = makeSeededWorktree();
      try {
        const client = {
          getFile: vi.fn(),
          getImages: vi.fn().mockResolvedValue({ images: { '272:120': 'https://cdn/x.png' } }),
          getFileNodes: vi.fn().mockResolvedValue({
            nodes: {
              '272:120': {
                document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] },
              },
            },
          }),
        };
        const metaBefore = readFileSync(join(snapDir, 'meta.json'), 'utf8');

        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          clientFactory: () => client as never,
          fetchImage: async () => Buffer.from('bytes'),
          nodeIds: ['272:120'],
        });

        expect(result.ok).toBe(true);
        expect(result.nodesRefreshed).toBe(1);
        expect(client.getFileNodes).toHaveBeenCalledWith('FILEKEY', ['272:120']);
        expect(client.getFile).not.toHaveBeenCalled();

        expect(readFileSync(join(snapDir, 'meta.json'), 'utf8')).toBe(metaBefore);
        const index = JSON.parse(readFileSync(join(snapDir, 'index.json'), 'utf8'));
        expect(index['272:120'].name).toBe('Pill (v2)');
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });
  });
});
