import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.CREW_APP_URL ?? 'http://localhost:5173';

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
