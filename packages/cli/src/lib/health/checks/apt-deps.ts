import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { execa } from 'execa';
import { ok, fail, type HealthCheck } from '../types.js';

/**
 * Chromium runtime libraries (the Playwright `--with-deps` set for linux),
 * mirrored from `scripts/install.sh`. On Ubuntu Noble (24.04+) some of these
 * resolve to `t64` variants; the remediation surfaces the base names, which apt
 * resolves, matching the install script's behaviour.
 */
export const CHROMIUM_LIBS = [
  'libnss3',
  'libnspr4',
  'libatk1.0-0',
  'libatk-bridge2.0-0',
  'libcups2',
  'libdrm2',
  'libdbus-1-3',
  'libxcb1',
  'libxkbcommon0',
  'libxcomposite1',
  'libxdamage1',
  'libxfixes3',
  'libxrandr2',
  'libgbm1',
  'libpango-1.0-0',
  'libcairo2',
  'libasound2',
  'libatspi2.0-0',
] as const;

export interface AptDepsDeps {
  /** Whether apt-get is the package manager (the check no-ops otherwise). */
  hasApt?: () => boolean;
  /** Whether a command (`bwrap`, `socat`) resolves on PATH. */
  onPath?: (cmd: string) => boolean;
  /** Whether the chromium runtime libs are present (probes `ldconfig`). */
  hasChromiumLibs?: () => Promise<boolean>;
}

/** Resolve a binary on PATH without spawning a subprocess. */
function onPathDefault(cmd: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    try {
      accessSync(join(dir, cmd), constants.X_OK);
      return true;
    } catch {
      /* not here — keep looking */
    }
  }
  return false;
}

async function hasChromiumLibsDefault(): Promise<boolean> {
  const result = await execa('ldconfig', ['-p'], { reject: false });
  if (result.exitCode !== 0) return false;
  return result.stdout.includes('libnss3.so');
}

/**
 * Machine check: the apt packages crew's sandbox + Playwright need are present
 * (`bubblewrap`, `socat`, and the chromium runtime libs). Mirrors the probe in
 * `scripts/install.sh`.
 *
 * **Skips gracefully** on non-apt machines (returns `ok` with a note) — the
 * check is Debian/Ubuntu-specific and the WSL/Ubuntu target is the supported
 * one. **Report-only:** no `fix()`, because crew never runs `sudo` non-
 * interactively; the exact `sudo apt-get install …` command is surfaced in the
 * remediation instead.
 *
 * Factory-with-default-deps so the host probes are injectable in unit tests.
 */
export function createAptDepsCheck(deps: AptDepsDeps = {}): HealthCheck {
  const hasApt = deps.hasApt ?? (() => onPathDefault('apt-get'));
  const onPath = deps.onPath ?? onPathDefault;
  const hasChromiumLibs = deps.hasChromiumLibs ?? hasChromiumLibsDefault;

  return {
    name: 'apt-deps',
    scope: 'machine',
    detect: async () => {
      if (!hasApt()) {
        return ok('non-apt machine — skipping apt dependency check', {
          details: {
            note: 'non-apt machine: apt-get not found; install crew system deps via your package manager',
          },
        });
      }

      const missing: string[] = [];
      if (!onPath('bwrap')) missing.push('bubblewrap');
      if (!onPath('socat')) missing.push('socat');
      if (!(await hasChromiumLibs())) missing.push(...CHROMIUM_LIBS);

      if (missing.length === 0) {
        return ok('required apt packages present (bubblewrap, socat, chromium libs)');
      }

      return fail(`missing apt packages: ${missing.join(', ')}`, {
        remediation: `sudo apt-get install -y ${missing.join(' ')}`,
        details: { missing: missing.join(', ') },
      });
    },
  };
}

export const aptDeps = createAptDepsCheck();
