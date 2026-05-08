import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start: string): string {
  let current = start;
  while (current !== dirname(current)) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    current = dirname(current);
  }
  throw new Error(
    `playwright.config.ts: could not locate repo root from ${start} (no .git found walking up)`,
  );
}

export function resolveBaseURL(repoRoot: string = findRepoRoot(HERE)): string {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return process.env.PLAYWRIGHT_BASE_URL;
  }
  const envPath = join(repoRoot, '.env');
  let envContents: string;
  try {
    envContents = readFileSync(envPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `playwright.config.ts: ${envPath} not found. ` +
          `Run 'crew env init' (canonical worktree) or 'crew env refresh' (other worktrees), ` +
          `or set PLAYWRIGHT_BASE_URL explicitly.`,
        { cause: err },
      );
    }
    throw err;
  }
  const match = envContents.match(/^APP_URL=(.+)$/m);
  if (!match) {
    throw new Error(
      `playwright.config.ts: ${envPath} has no APP_URL line. ` +
        `Re-run 'crew env refresh', or set PLAYWRIGHT_BASE_URL explicitly.`,
    );
  }
  return match[1].trim();
}

const baseURL = resolveBaseURL();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Intentionally no webServer block: tests run against the worktree's docker
  // dashboard stack only. A fallback Vite spawn here was masking real failures
  // — see docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md.
});
