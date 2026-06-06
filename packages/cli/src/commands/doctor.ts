import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  defaultProjectConfigDir,
  discoverProjectConfig,
  parseEnvFile,
  parseProjectConfig,
  type ProjectConfig,
} from '../lib/index.js';
import { checksFor } from '../lib/health/registry.js';
import { runHealth, type CheckOutcome } from '../lib/health/run-health.js';
import { createChromiumInstalledCheck } from '../lib/health/checks/chromium-installed.js';
import { playwrightEnabled } from '../lib/mcp-config/mode-flags.js';
import type { HealthCheck, HealthContext } from '../lib/health/types.js';
import { renderReport } from '../lib/health/render.js';

export interface RunDoctorOptions {
  /** Directory to resolve the project from (and to probe machine state from). */
  cwd: string;
  /** Apply each fixable fail's `fix()`, then re-detect. */
  fix?: boolean;
  /** Sweep every configured project plus the machine checks. */
  all?: boolean;
  /** Assume yes for confirm-gated fixes (e.g. the chromium install). */
  yes?: boolean;
  /** Override the checks run. Test seam — defaults to the full registry. */
  checks?: HealthCheck[];
  /** Where `--all` enumerates project TOMLs. Test seam. */
  configDir?: string;
  /** Single-project resolver. Test seam — defaults to `discoverProjectConfig`. */
  discover?: (cwd: string) => Promise<ProjectConfig | null>;
  /** Output sink. Test seam — defaults to `console.log`. */
  log?: (msg: string) => void;
}

export interface DoctorResult {
  /** 1 when any `fail` remains after the (optional) fix pass; else 0. */
  exitCode: number;
  /** Count of findings that went `fail → not-fail` during the fix pass. */
  fixed: number;
}

/** Build the read-only health context for a project (never materializes `.env`). */
function buildContext(config: ProjectConfig): HealthContext {
  const worktree = config.repo_path;
  const envPath = join(worktree, '.env');
  const envVars = existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, 'utf8'))
    : undefined;
  return { config, worktree, envVars };
}

/** Parse every `*.toml` under the config dir, skipping files that don't parse. */
function enumerateProjects(configDir: string): ProjectConfig[] {
  if (!existsSync(configDir)) return [];
  const out: ProjectConfig[] = [];
  for (const file of readdirSync(configDir)) {
    if (!file.endsWith('.toml')) continue;
    try {
      out.push(parseProjectConfig(readFileSync(join(configDir, file), 'utf8')));
    } catch {
      // skip unparseable configs — `config-valid` surfaces them per-project
    }
  }
  return out;
}

/**
 * The default check set for the command: the full registry, but with
 * `chromium-installed`'s interactive confirm swapped for the `--yes` flag so a
 * non-interactive `crew doctor --fix` never hangs on a prompt (and never starts
 * the large/network install unless `--yes` was passed).
 */
function defaultDoctorChecks(yes: boolean): HealthCheck[] {
  return checksFor('all').map((c) =>
    c.name === 'chromium-installed'
      ? createChromiumInstalledCheck({ confirm: async () => yes })
      : c,
  );
}

/**
 * Apply `fix()` for each fixable fail, then re-detect the whole set. Returns the
 * post-fix outcomes and the number of findings whose status improved away from
 * `fail` — a fix that no-ops (e.g. a declined chromium confirm) counts as 0.
 */
async function applyFixes(
  checks: HealthCheck[],
  ctx: HealthContext,
  before: CheckOutcome[],
): Promise<{ outcomes: CheckOutcome[]; fixed: number }> {
  for (const { check, result } of before) {
    if (result.status === 'fail' && result.fixable && check.fix) {
      try {
        await check.fix(ctx);
      } catch {
        // leave it failing — the re-detect below reports the unresolved gap
      }
    }
  }
  const outcomes = await runHealth(checks, ctx);
  const wasFail = new Set(
    before.filter((o) => o.result.status === 'fail').map((o) => o.check.name),
  );
  const fixed = outcomes.filter(
    (o) => wasFail.has(o.check.name) && o.result.status !== 'fail',
  ).length;
  return { outcomes, fixed };
}

/** Pick the config whose presence makes the machine checks most meaningful. */
function machineConfig(projects: ProjectConfig[]): ProjectConfig {
  return projects.find((p) => playwrightEnabled(p)) ?? projects[0];
}

/**
 * Testable core of `crew doctor`. Resolves the target project(s), runs the
 * project-scope checks per project and the machine-scope checks once, optionally
 * applies fixes, renders a report per group, and reports an exit code.
 */
export async function runDoctor(opts: RunDoctorOptions): Promise<DoctorResult> {
  const log = opts.log ?? ((msg: string) => console.log(msg));
  const checks = opts.checks ?? defaultDoctorChecks(opts.yes ?? false);
  const projectChecks = checks.filter((c) => c.scope === 'project');
  const machineChecks = checks.filter((c) => c.scope === 'machine');

  let projects: ProjectConfig[];
  if (opts.all) {
    projects = enumerateProjects(opts.configDir ?? defaultProjectConfigDir());
    if (projects.length === 0) {
      log('no project configs found — nothing to check');
      return { exitCode: 1, fixed: 0 };
    }
  } else {
    const discover = opts.discover ?? discoverProjectConfig;
    const config = await discover(opts.cwd);
    if (!config) {
      log('could not resolve a crew project for this directory (no matching config)');
      return { exitCode: 1, fixed: 0 };
    }
    projects = [config];
  }

  let anyFail = false;
  let fixed = 0;

  for (const config of projects) {
    const ctx = buildContext(config);
    let outcomes = await runHealth(projectChecks, ctx);
    if (opts.fix) {
      const applied = await applyFixes(projectChecks, ctx, outcomes);
      outcomes = applied.outcomes;
      fixed += applied.fixed;
    }
    log(renderReport(outcomes, { project: config.name }));
    if (outcomes.some((o) => o.result.status === 'fail')) anyFail = true;
  }

  if (machineChecks.length > 0) {
    const ctx = buildContext(machineConfig(projects));
    let outcomes = await runHealth(machineChecks, ctx);
    if (opts.fix) {
      const applied = await applyFixes(machineChecks, ctx, outcomes);
      outcomes = applied.outcomes;
      fixed += applied.fixed;
    }
    log(renderReport(outcomes, { project: 'machine' }));
    if (outcomes.some((o) => o.result.status === 'fail')) anyFail = true;
  }

  return { exitCode: anyFail ? 1 : 0, fixed };
}

export const doctorCommand = new Command('doctor')
  .description(
    'diagnose project + machine health; --fix applies auto-fixable findings, --all sweeps every configured project',
  )
  .option('--fix', 'apply the auto-fixable findings')
  .option('--all', 'check every configured project plus the machine checks')
  .option('-y, --yes', 'assume yes for confirm-gated fixes (e.g. installing chromium)')
  .action(async (options: { fix?: boolean; all?: boolean; yes?: boolean }) => {
    const result = await runDoctor({
      cwd: process.cwd(),
      fix: options.fix ?? false,
      all: options.all ?? false,
      yes: options.yes ?? false,
    });
    process.exitCode = result.exitCode;
  });
