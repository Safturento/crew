import { describe, it, expect, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { runPreDispatchFigmaSnapshot } from './figma-snapshot-step.js';

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

function withVisualFidelity(config: ProjectConfig = baseConfig): ProjectConfig {
  return {
    ...config,
    visual_fidelity: {
      figma_file_key: 'FILEKEY',
      figma_pages: ['Composites'],
      component_dir: 'packages/dashboard/src/components',
      dashboard_url: 'http://localhost:23680',
      snapshot_path: '.crew/figma-snapshot',
      code_connect_glob: '**/*.figma.tsx',
      skip_snapshot: false,
    },
  };
}

describe('runPreDispatchFigmaSnapshot', () => {
  it('returns kind=skipped without invoking the snapshotter when visual_fidelity is absent', async () => {
    const snapshotter = vi.fn();
    const result = await runPreDispatchFigmaSnapshot({
      worktree: '/tmp/wt',
      config: baseConfig,
      log: () => {},
      warn: () => {},
      snapshotter,
    });
    expect(result.kind).toBe('skipped');
    expect(snapshotter).not.toHaveBeenCalled();
  });

  it('calls the snapshotter and returns kind=ok with nodesExported when configured', async () => {
    const snapshotter = vi.fn().mockResolvedValue({
      ok: true,
      nodesExported: 42,
      outDir: '/tmp/wt/.crew/figma-snapshot',
    });
    const logs: string[] = [];
    const result = await runPreDispatchFigmaSnapshot({
      worktree: '/tmp/wt',
      config: withVisualFidelity(),
      log: (m) => logs.push(m),
      warn: () => {},
      snapshotter,
    });
    expect(snapshotter).toHaveBeenCalledWith(expect.objectContaining({ worktree: '/tmp/wt' }));
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.nodesExported).toBe(42);
    }
    expect(logs.some((m) => /42/.test(m))).toBe(true);
  });

  it('returns kind=warning and emits warning when snapshotter resolves with ok=false', async () => {
    const snapshotter = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'FIGMA_API_TOKEN env var is required',
    });
    const warnings: string[] = [];
    const result = await runPreDispatchFigmaSnapshot({
      worktree: '/tmp/wt',
      config: withVisualFidelity(),
      log: () => {},
      warn: (m) => warnings.push(m),
      snapshotter,
    });
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toMatch(/FIGMA_API_TOKEN/);
    }
    expect(warnings.some((m) => /FIGMA_API_TOKEN/.test(m))).toBe(true);
  });

  it('returns kind=warning and emits warning when snapshotter throws', async () => {
    const snapshotter = vi.fn().mockRejectedValue(new Error('network blew up'));
    const warnings: string[] = [];
    const result = await runPreDispatchFigmaSnapshot({
      worktree: '/tmp/wt',
      config: withVisualFidelity(),
      log: () => {},
      warn: (m) => warnings.push(m),
      snapshotter,
    });
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toMatch(/network blew up/);
    }
    expect(warnings.some((m) => /network blew up/.test(m))).toBe(true);
  });

  it('logs the enriched node count when the snapshotter reports kind=ok enrichment', async () => {
    const snapshotter = vi.fn().mockResolvedValue({
      ok: true,
      nodesExported: 12,
      outDir: '/tmp/wt/.crew/figma-snapshot',
      enrichment: { kind: 'ok', enrichedNodeCount: 12, errors: [] },
    });
    const logs: string[] = [];
    const result = await runPreDispatchFigmaSnapshot({
      worktree: '/tmp/wt',
      config: withVisualFidelity(),
      log: (m) => logs.push(m),
      warn: () => {},
      snapshotter,
    });
    expect(result.kind).toBe('ok');
    expect(logs.some((m) => /enrich/i.test(m) && /12/.test(m))).toBe(true);
  });

  it('emits a visible warning when enrichment was skipped (snapshot stays REST-only)', async () => {
    const snapshotter = vi.fn().mockResolvedValue({
      ok: true,
      nodesExported: 12,
      outDir: '/tmp/wt/.crew/figma-snapshot',
      enrichment: { kind: 'skipped', reason: 'claude not on PATH' },
    });
    const warnings: string[] = [];
    const result = await runPreDispatchFigmaSnapshot({
      worktree: '/tmp/wt',
      config: withVisualFidelity(),
      log: () => {},
      warn: (m) => warnings.push(m),
      snapshotter,
    });
    expect(result.kind).toBe('ok');
    expect(warnings.some((m) => /enrich/i.test(m) && /claude not on PATH/.test(m))).toBe(true);
  });

  it('emits a visible warning when enrichment degraded to a warning', async () => {
    const snapshotter = vi.fn().mockResolvedValue({
      ok: true,
      nodesExported: 12,
      outDir: '/tmp/wt/.crew/figma-snapshot',
      enrichment: { kind: 'warning', reason: 'subprocess timed out' },
    });
    const warnings: string[] = [];
    const result = await runPreDispatchFigmaSnapshot({
      worktree: '/tmp/wt',
      config: withVisualFidelity(),
      log: () => {},
      warn: (m) => warnings.push(m),
      snapshotter,
    });
    expect(result.kind).toBe('ok');
    expect(warnings.some((m) => /enrich/i.test(m) && /subprocess timed out/.test(m))).toBe(true);
  });

  it('returns kind=ok with nodesExported=0 when snapshotter signals a no-op (skip_snapshot)', async () => {
    const snapshotter = vi.fn().mockResolvedValue({
      ok: true,
      nodesExported: 0,
      reason: 'skip_snapshot=true; no-op',
    });
    const result = await runPreDispatchFigmaSnapshot({
      worktree: '/tmp/wt',
      config: withVisualFidelity(),
      log: () => {},
      warn: () => {},
      snapshotter,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.nodesExported).toBe(0);
    }
  });
});
