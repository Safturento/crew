import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { brunoSkeleton } from './bruno-skeleton.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-bruno-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function configFor(worktree: string, brunoSmoke?: ProjectConfig['bruno_smoke']): ProjectConfig {
  return {
    name: 'acme',
    repo_path: worktree,
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'u/r' },
    bruno_smoke: brunoSmoke,
  } as unknown as ProjectConfig;
}

const ENABLED: ProjectConfig['bruno_smoke'] = {
  enabled: true,
  base_url: 'http://localhost:7773',
  collection_dir: 'bruno',
} as ProjectConfig['bruno_smoke'];

describe('bruno-skeleton', () => {
  it('is a project-scoped check with a fix', () => {
    expect(brunoSkeleton.scope).toBe('project');
    expect(typeof brunoSkeleton.fix).toBe('function');
  });

  it('ok when bruno_smoke is not opted in (nothing to check)', async () => {
    const wt = tmp();
    const r = await brunoSkeleton.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('ok when opted in and the collection skeleton exists', async () => {
    const wt = tmp();
    mkdirSync(join(wt, 'bruno'), { recursive: true });
    writeFileSync(join(wt, 'bruno', 'bruno.json'), '{"version":"1"}\n');
    const r = await brunoSkeleton.detect({ config: configFor(wt, ENABLED), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('fails (fixable) when opted in but the collection is missing', async () => {
    const wt = tmp();
    const r = await brunoSkeleton.detect({ config: configFor(wt, ENABLED), worktree: wt });
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
  });

  it('honours a custom collection_dir', async () => {
    const wt = tmp();
    const custom = { ...ENABLED!, collection_dir: 'api/bruno' } as ProjectConfig['bruno_smoke'];
    mkdirSync(join(wt, 'api', 'bruno'), { recursive: true });
    writeFileSync(join(wt, 'api', 'bruno', 'bruno.json'), '{"version":"1"}\n');
    const r = await brunoSkeleton.detect({ config: configFor(wt, custom), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('fix() scaffolds the collection, and re-detect passes (idempotent)', async () => {
    const wt = tmp();
    const ctx = { config: configFor(wt, ENABLED), worktree: wt };
    expect(existsSync(join(wt, 'bruno', 'bruno.json'))).toBe(false);

    await brunoSkeleton.fix!(ctx);
    expect(existsSync(join(wt, 'bruno', 'bruno.json'))).toBe(true);
    expect((await brunoSkeleton.detect(ctx)).status).toBe('ok');

    await brunoSkeleton.fix!(ctx);
    expect((await brunoSkeleton.detect(ctx)).status).toBe('ok');
  });
});
