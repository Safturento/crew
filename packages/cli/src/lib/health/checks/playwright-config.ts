import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { playwrightEnabled } from '../../mcp-config/mode-flags.js';
import { scaffoldPlaywright } from '../../init/scaffold-playwright.js';
import { fail, ok, type HealthCheck } from '../types.js';

/**
 * Resolve the e2e test directory. Authored projects pin it via
 * `[playwright.authored].tests_dir` (which may point into a subpackage, e.g.
 * crew's own `packages/dashboard/tests/e2e`); smoke-only projects have no such
 * field, so we fall back to the scaffolder's default `tests/e2e`.
 */
function resolveE2eDir(
  config: Parameters<HealthCheck['detect']>[0]['config'],
  worktree: string,
): string {
  const testsDir = config.playwright?.authored?.tests_dir;
  return testsDir ? join(worktree, testsDir) : join(worktree, 'tests', 'e2e');
}

/**
 * Locate the `playwright.config.ts` that governs `e2eDir`. The scaffolder
 * writes it at the package root (one or more levels above `tests/e2e`), so we
 * walk up from the e2e dir to the worktree and return the first match. This
 * makes the check layout-agnostic: it finds a root config for a single-package
 * repo and a subpackage config for a monorepo. Returns null when none exists.
 */
function findConfig(e2eDir: string, worktree: string): string | null {
  let dir = dirname(e2eDir);
  while (true) {
    const candidate = join(dir, 'playwright.config.ts');
    if (existsSync(candidate)) return candidate;
    if (relative(worktree, dir) === '') return null; // reached the worktree root
    const parent = dirname(dir);
    if (parent === dir) return null; // reached the filesystem root
    dir = parent;
  }
}

/**
 * Require the Playwright e2e scaffold when a project opts into Playwright.
 *
 * "Opted in" tracks the schema: there is no `playwright.enabled` flag, so we
 * reuse `playwrightEnabled` (true when either `[playwright.smoke]` or
 * `[playwright.authored]` is enabled). When opted in, both a
 * `playwright.config.ts` and the e2e test directory must exist — resolved from
 * `[playwright.authored].tests_dir` so monorepo layouts (config + tests in a
 * subpackage) are honored rather than assuming the worktree root. `fix()`
 * delegates to `scaffoldPlaywright`, the single-source scaffolder also used by
 * `crew init`.
 */
export const playwrightConfig: HealthCheck = {
  name: 'playwright-config',
  scope: 'project',
  detect: async ({ config, worktree }) => {
    if (!playwrightEnabled(config)) {
      return ok('playwright not enabled — nothing to scaffold');
    }

    const e2eDir = resolveE2eDir(config, worktree);
    const hasE2e = existsSync(e2eDir) && statSync(e2eDir).isDirectory();
    const hasConfig = findConfig(e2eDir, worktree) !== null;

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
