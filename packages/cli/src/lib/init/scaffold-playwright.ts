import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_CONTENTS = `import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Resolves the app URL the e2e suite runs against. Prefers an explicit
// PLAYWRIGHT_BASE_URL, else reads APP_URL out of the worktree's .env
// (materialized by 'crew env init' / 'crew env refresh').
function resolveBaseURL(): string {
  if (process.env.PLAYWRIGHT_BASE_URL) return process.env.PLAYWRIGHT_BASE_URL;
  const envPath = join(HERE, '.env');
  if (!existsSync(envPath)) {
    throw new Error(
      'playwright.config.ts: ' + envPath + ' not found. ' +
        "Run 'crew env init' (or set PLAYWRIGHT_BASE_URL).",
    );
  }
  const match = readFileSync(envPath, 'utf8').match(/^APP_URL=(.+)$/m);
  if (!match) {
    throw new Error('playwright.config.ts: no APP_URL in ' + envPath + ' (or set PLAYWRIGHT_BASE_URL).');
  }
  return match[1].trim();
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: resolveBaseURL(),
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`;

const SPEC_CONTENTS = `import { test, expect } from '@playwright/test';

test('app loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});
`;

/**
 * Scaffold a Playwright e2e setup into a worktree: a `playwright.config.ts`
 * (testDir `./tests/e2e`, base URL resolved from `.env` APP_URL) plus a
 * skeleton spec under `tests/e2e/`. Writes unconditionally — callers (the
 * `playwright-config` health-check `fix()` in CREW-227, the `crew init`
 * wizard in CREW-229) decide *when* to scaffold.
 *
 * @param worktree the repo root to scaffold into
 * @returns the absolute paths written, config first
 */
export function scaffoldPlaywright(worktree: string): string[] {
  const configPath = join(worktree, 'playwright.config.ts');
  const e2eDir = join(worktree, 'tests', 'e2e');
  const specPath = join(e2eDir, 'example.spec.ts');

  mkdirSync(e2eDir, { recursive: true });
  writeFileSync(configPath, CONFIG_CONTENTS, 'utf8');
  writeFileSync(specPath, SPEC_CONTENTS, 'utf8');

  return [configPath, specPath];
}
