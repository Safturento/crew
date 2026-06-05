import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { confirm as inquirerConfirm } from '@inquirer/prompts';
import { execa } from 'execa';
import { playwrightEnabled } from '../../mcp-config/mode-flags.js';
import { fail, ok, type HealthCheck, type HealthContext } from '../types.js';

const INSTALL_COMMAND = 'npx playwright install chromium';

export interface ChromiumInstalledDeps {
  /** Whether a Playwright Chromium build is present on the machine. */
  isInstalled?: () => Promise<boolean>;
  /** Interactive gate before the (large/network) install. Defaults to a prompt. */
  confirm?: () => Promise<boolean>;
  /** Perform the install. Defaults to `npx playwright install chromium`. */
  install?: (ctx: HealthContext) => Promise<void>;
}

/** Locate Playwright's browsers cache and look for a chromium build. */
function isChromiumInstalledDefault(): Promise<boolean> {
  const base =
    process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0'
      ? process.env.PLAYWRIGHT_BROWSERS_PATH
      : join(homedir(), '.cache', 'ms-playwright');
  try {
    if (!existsSync(base)) return Promise.resolve(false);
    const found = readdirSync(base).some((entry) => entry.startsWith('chromium'));
    return Promise.resolve(found);
  } catch {
    return Promise.resolve(false);
  }
}

async function installChromiumDefault(ctx: HealthContext): Promise<void> {
  const result = await execa('npx', ['playwright', 'install', 'chromium'], {
    cwd: ctx.worktree,
    stdio: 'inherit',
    reject: false,
  });
  if (result.exitCode !== 0) {
    throw new Error(`${INSTALL_COMMAND} failed (rc=${result.exitCode})`);
  }
}

function confirmDefault(): Promise<boolean> {
  return inquirerConfirm({
    message: 'Install Chromium for Playwright now? (~150MB download)',
    default: false,
  });
}

/**
 * Machine check: a Playwright Chromium build is installed, but only when a
 * project actually opts into Playwright (`playwrightEnabled`). Otherwise
 * chromium isn't needed and the check is a no-op `ok`.
 *
 * `fix()` is **confirm-gated** even under `--fix` (spec §8 — the install is a
 * large/network operation): it installs only when `confirm()` resolves `true`,
 * otherwise it no-ops and leaves the next `detect()` to report the gap. The
 * `confirm` dep defaults to an interactive prompt; the doctor command wires
 * `--yes`/non-interactive behaviour by swapping it via the factory (CREW-228).
 *
 * Factory-with-default-deps so the host probe, prompt, and install are all
 * injectable in unit tests; the registry imports the default instance.
 */
export function createChromiumInstalledCheck(deps: ChromiumInstalledDeps = {}): HealthCheck {
  const isInstalled = deps.isInstalled ?? isChromiumInstalledDefault;
  const confirm = deps.confirm ?? confirmDefault;
  const install = deps.install ?? installChromiumDefault;

  return {
    name: 'chromium-installed',
    scope: 'machine',
    detect: async ({ config }) => {
      if (!playwrightEnabled(config)) {
        return ok('playwright not enabled — chromium not required');
      }
      if (await isInstalled()) {
        return ok('playwright chromium build is installed');
      }
      return fail('playwright is enabled but no chromium build is installed', {
        remediation: INSTALL_COMMAND,
        fixable: true,
      });
    },
    fix: async (ctx) => {
      if (!(await confirm())) return; // declined — leave it for the next detect to report
      await install(ctx);
    },
  };
}

export const chromiumInstalled = createChromiumInstalledCheck();
