import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { playwrightConfig } from './playwright-config.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-pwcfg-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function configFor(worktree: string, playwright?: ProjectConfig['playwright']): ProjectConfig {
  return {
    name: 'x',
    repo_path: worktree,
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

// Authored opt-in pointing the suite at a subpackage (monorepo layout, like
// crew itself: tests_dir = packages/dashboard/tests/e2e).
const ENABLED_MONOREPO: ProjectConfig['playwright'] = {
  app_url: 'http://localhost:5173',
  start_command: 'npm run dev',
  authored: {
    enabled: true,
    tests_dir: 'packages/dashboard/tests/e2e',
    test_command: 'npm run test:e2e',
    verify_after_run: false,
    verify_max_attempts: 2,
  },
} as ProjectConfig['playwright'];

describe('playwright-config', () => {
  it('is a project-scoped check with a fix', () => {
    expect(playwrightConfig.scope).toBe('project');
    expect(typeof playwrightConfig.fix).toBe('function');
  });

  it('ok when playwright is not opted in (nothing to check)', async () => {
    const wt = tmp();
    const r = await playwrightConfig.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('ok when opted in and both config + tests/e2e exist', async () => {
    const wt = tmp();
    writeFileSync(join(wt, 'playwright.config.ts'), 'export default {};\n');
    mkdirSync(join(wt, 'tests', 'e2e'), { recursive: true });
    const r = await playwrightConfig.detect({ config: configFor(wt, ENABLED), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('ok for a monorepo layout: honors authored.tests_dir and finds the config in that subpackage', async () => {
    const wt = tmp();
    const pkg = join(wt, 'packages', 'dashboard');
    mkdirSync(join(pkg, 'tests', 'e2e'), { recursive: true });
    writeFileSync(join(pkg, 'playwright.config.ts'), 'export default {};\n');
    const r = await playwrightConfig.detect({
      config: configFor(wt, ENABLED_MONOREPO),
      worktree: wt,
    });
    expect(r.status).toBe('ok');
  });

  it('fails (fixable) for a monorepo layout when the subpackage config is missing', async () => {
    const wt = tmp();
    mkdirSync(join(wt, 'packages', 'dashboard', 'tests', 'e2e'), { recursive: true });
    const r = await playwrightConfig.detect({
      config: configFor(wt, ENABLED_MONOREPO),
      worktree: wt,
    });
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
  });

  it('fails (fixable) when opted in but the config is missing', async () => {
    const wt = tmp();
    mkdirSync(join(wt, 'tests', 'e2e'), { recursive: true });
    const r = await playwrightConfig.detect({ config: configFor(wt, ENABLED), worktree: wt });
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
  });

  it('fails (fixable) when opted in but tests/e2e is missing', async () => {
    const wt = tmp();
    writeFileSync(join(wt, 'playwright.config.ts'), 'export default {};\n');
    const r = await playwrightConfig.detect({ config: configFor(wt, ENABLED), worktree: wt });
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
  });

  it('fix() scaffolds the config + e2e dir, and re-detect passes (idempotent)', async () => {
    const wt = tmp();
    const ctx = { config: configFor(wt, ENABLED), worktree: wt };
    expect(existsSync(join(wt, 'playwright.config.ts'))).toBe(false);

    await playwrightConfig.fix!(ctx);
    expect(existsSync(join(wt, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(join(wt, 'tests', 'e2e'))).toBe(true);
    expect((await playwrightConfig.detect(ctx)).status).toBe('ok');

    // second fix is a no-op write (idempotent), detect still ok
    await playwrightConfig.fix!(ctx);
    expect((await playwrightConfig.detect(ctx)).status).toBe('ok');
  });
});
