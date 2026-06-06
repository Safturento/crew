import { Command } from 'commander';
import pc from 'picocolors';
import { discoverProjectConfig } from '../lib/index.js';
import { runInit } from '../lib/init/index.js';
import { confirmOverwriteInteractive, gatherInitAnswers } from '../lib/init/prompts.js';

/**
 * `crew init` — interactive wizard that scaffolds (or converges) the
 * crew-specific project layer for the current repo. Thin per the package's
 * command convention: it gathers answers via `@inquirer/prompts` and delegates
 * all writing to `runInit`. Re-running converges; it never silently clobbers a
 * diverged managed file, and it warns (does not create) when the agent-context
 * baseline is missing.
 */
export const initCommand = new Command('init')
  .description('scaffold or converge crew setup for the current repo (idempotent)')
  .action(async () => {
    const cwd = process.cwd();
    const existing = await discoverProjectConfig(cwd);
    if (existing) {
      console.log(pc.dim(`converging existing crew config for '${existing.name}'`));
    }

    const answers = await gatherInitAnswers(cwd, existing);
    const result = await runInit({
      cwd,
      answers,
      confirmOverwrite: confirmOverwriteInteractive,
      log: (msg) => console.log(pc.green('✓'), msg),
    });

    for (const skipped of result.skipped) {
      console.log(pc.yellow('•'), `left ${skipped} untouched`);
    }
    if (result.env && !result.env.ok) {
      console.warn(pc.yellow('⚠'), `env init skipped: ${result.env.reason ?? 'unknown reason'}`);
    }
    if (result.baselineWarning) {
      console.warn(pc.yellow('⚠'), result.baselineWarning);
    }
    console.log(pc.green('✓'), 'crew init complete');
  });
