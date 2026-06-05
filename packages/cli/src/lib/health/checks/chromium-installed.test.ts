import { describe, it, expect, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { createChromiumInstalledCheck, chromiumInstalled } from './chromium-installed.js';

function configWith(playwright?: ProjectConfig['playwright']): ProjectConfig {
  return {
    name: 'x',
    repo_path: '/tmp/x',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'u/r' },
    playwright,
  } as unknown as ProjectConfig;
}

const ENABLED: ProjectConfig['playwright'] = {
  app_url: 'http://localhost:5173',
  start_command: 'npm run dev',
  smoke: { enabled: true },
} as ProjectConfig['playwright'];

const ctx = (config: ProjectConfig) => ({ config, worktree: '/tmp/x' });

describe('chromium-installed', () => {
  it('the default export is a machine-scoped check with a fix', () => {
    expect(chromiumInstalled.name).toBe('chromium-installed');
    expect(chromiumInstalled.scope).toBe('machine');
    expect(typeof chromiumInstalled.fix).toBe('function');
  });

  it('ok when playwright is not enabled (chromium not required)', async () => {
    const check = createChromiumInstalledCheck({ isInstalled: async () => false });
    const r = await check.detect(ctx(configWith()));
    expect(r.status).toBe('ok');
  });

  it('ok when playwright is enabled and chromium is installed', async () => {
    const check = createChromiumInstalledCheck({ isInstalled: async () => true });
    const r = await check.detect(ctx(configWith(ENABLED)));
    expect(r.status).toBe('ok');
  });

  it('fails (fixable) when playwright is enabled but chromium is absent', async () => {
    const check = createChromiumInstalledCheck({ isInstalled: async () => false });
    const r = await check.detect(ctx(configWith(ENABLED)));
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
    expect(r.remediation).toContain('playwright install');
  });

  it('fix() does NOT install when the confirm is declined', async () => {
    const install = vi.fn(async () => {});
    const check = createChromiumInstalledCheck({
      isInstalled: async () => false,
      confirm: async () => false,
      install,
    });
    await check.fix!(ctx(configWith(ENABLED)));
    expect(install).not.toHaveBeenCalled();
  });

  it('fix() installs when the confirm is granted', async () => {
    const install = vi.fn(async () => {});
    const check = createChromiumInstalledCheck({
      isInstalled: async () => false,
      confirm: async () => true,
      install,
    });
    await check.fix!(ctx(configWith(ENABLED)));
    expect(install).toHaveBeenCalledOnce();
  });
});
