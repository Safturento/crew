import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { runResumePreflight } from './run-resume-preflight.js';

function makeWorktree(settings: unknown | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'resume-preflight-'));
  if (settings !== null) {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify(settings));
  }
  return dir;
}

const baseConfig: ProjectConfig = {
  name: 'test',
  repo_path: '/x',
  jira: { project_key: 'X', site: 'https://x.atlassian.net' },
  github: { repo: 'owner/repo' },
  bruno_smoke: { enabled: true, base_url: 'http://localhost:3000', collection_dir: 'bruno' },
} as ProjectConfig;

describe('runResumePreflight', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let dir: string | undefined;

  beforeEach(() => {
    warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('returns without throwing when excluded commands are correctly listed', async () => {
    dir = makeWorktree({
      sandbox: { excludedCommands: ['npm run bruno:smoke*'] },
    });

    await expect(
      runResumePreflight({ config: baseConfig, worktree: dir }),
    ).resolves.toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns to stderr but does not throw when an entry is missing', async () => {
    dir = makeWorktree({ sandbox: { excludedCommands: [] } });

    await expect(
      runResumePreflight({ config: baseConfig, worktree: dir }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    const written = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(written).toMatch(/excluded-commands/);
    expect(written).toMatch(/warning/i);
    expect(written).toMatch(/agent's rebase will pick this up/i);
  });

  it('warns but does not throw when settings.json is missing entirely', async () => {
    dir = makeWorktree(null);

    await expect(
      runResumePreflight({ config: baseConfig, worktree: dir }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('is a no-op when no preflight checks apply (config has neither bruno_smoke.enabled nor playwright.authored.enabled)', async () => {
    dir = makeWorktree(null);
    const minimalConfig = { ...baseConfig, bruno_smoke: undefined } as ProjectConfig;

    await expect(
      runResumePreflight({ config: minimalConfig, worktree: dir }),
    ).resolves.toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
