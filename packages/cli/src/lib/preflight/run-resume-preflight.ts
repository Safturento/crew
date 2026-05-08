import type { ProjectConfig } from 'crew-shared';
import pc from 'picocolors';
import { verifyExcludedCommandsCheck } from './verify-excluded-commands.js';
import { renderPreflightError } from './render-error.js';
import { PreflightError } from './types.js';

export interface RunResumePreflightOptions {
  config: ProjectConfig;
  worktree: string;
}

/**
 * Slim resume-mode preflight for `crew fix-pr`. Runs only the checks that the
 * dispatched agent cannot fix on its own (today: `verify-excluded-commands` —
 * the agent likely cannot write `.claude/settings.json` autonomously). Failures
 * are non-fatal: a warning is printed to stderr and the function returns. The
 * agent's Step 0 rebase will pull in any current settings.json from main, so a
 * stale-worktree miss self-heals.
 *
 * Worktree-state-dependent prep (docker bringup, playwright install,
 * URL probes) is owned by the agent's Step 0.5; this helper does NOT run it.
 */
export async function runResumePreflight(opts: RunResumePreflightOptions): Promise<void> {
  const needsCheck =
    Boolean(opts.config.bruno_smoke?.enabled) || Boolean(opts.config.playwright?.authored?.enabled);
  if (!needsCheck) return;

  const check = verifyExcludedCommandsCheck();
  try {
    await check.run({ config: opts.config, worktree: opts.worktree });
  } catch (err) {
    if (err instanceof PreflightError) {
      const rendered = renderPreflightError(err);
      process.stderr.write(
        pc.yellow(
          `\n⚠  preflight warning [${err.checkName}] (non-fatal in resume mode):\n${rendered}\n` +
            `   The agent's rebase will pick this up if main has the correct settings.json.\n\n`,
        ),
      );
      return;
    }
    throw err;
  }
}
