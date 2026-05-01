import { Command } from 'commander';
import { runReset } from './reset.js';
import { runResume } from './resume.js';
import { runRun } from './run.js';

interface RestartOptions {
  hard?: boolean;
  message?: string;
  skipDocker?: boolean;
}

/**
 * Composed command. Without `--hard`: invoke `runReset({hard: false})`
 * then `runResume(...)` — falls through to resume's no-session branch
 * since reset just deleted the session. With `--hard`: invoke
 * `runReset({hard: true})` then the existing `crew run` body.
 */
export async function runRestart(key: string, opts: RestartOptions): Promise<void> {
  await runReset(key, { hard: Boolean(opts.hard) });

  if (opts.hard) {
    await runRun(key, { skipDocker: opts.skipDocker, message: opts.message });
    return;
  }

  await runResume(key, { message: opts.message, skipDocker: opts.skipDocker });
}

export const restartCommand = new Command('restart')
  .description("Wipe state and re-run the agent on a ticket's worktree")
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--hard', 'also remove worktree + branch (full clean slate via crew run)')
  .option('-m, --message <message>', 'additional context to pass through to the underlying command')
  .option('--skip-docker', 'skip the docker stack step')
  .action(async (key: string, opts: RestartOptions) => {
    await runRestart(key, opts);
  });
