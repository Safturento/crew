import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { playwrightEnabled } from '../../mcp-config/mode-flags.js';
import { scaffoldPlaywright } from '../../init/scaffold-playwright.js';
import { fail, ok, type HealthCheck } from '../types.js';

/**
 * Require the Playwright e2e scaffold when a project opts into Playwright.
 *
 * "Opted in" tracks the schema: there is no `playwright.enabled` flag, so we
 * reuse `playwrightEnabled` (true when either `[playwright.smoke]` or
 * `[playwright.authored]` is enabled). When opted in, both
 * `<worktree>/playwright.config.ts` and `<worktree>/tests/e2e/` must exist.
 * `fix()` delegates to `scaffoldPlaywright`, the single-source scaffolder also
 * used by `crew init`.
 */
export const playwrightConfig: HealthCheck = {
  name: 'playwright-config',
  scope: 'project',
  detect: async ({ config, worktree }) => {
    if (!playwrightEnabled(config)) {
      return ok('playwright not enabled — nothing to scaffold');
    }

    const configPath = join(worktree, 'playwright.config.ts');
    const e2eDir = join(worktree, 'tests', 'e2e');
    const hasConfig = existsSync(configPath);
    const hasE2e = existsSync(e2eDir) && statSync(e2eDir).isDirectory();

    if (hasConfig && hasE2e) {
      return ok('playwright.config.ts and tests/e2e/ present');
    }

    const missing = [
      hasConfig ? null : 'playwright.config.ts',
      hasE2e ? null : 'tests/e2e/',
    ].filter(Boolean);

    return fail(`playwright opted in but missing: ${missing.join(', ')}`, {
      remediation: 'run crew init (or crew doctor --fix) to scaffold the Playwright e2e setup',
      fixable: true,
      details: { missing: missing.join(', ') },
    });
  },
  fix: async ({ worktree }) => {
    scaffoldPlaywright(worktree);
  },
};
