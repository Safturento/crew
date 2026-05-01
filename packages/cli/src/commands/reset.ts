import { Command } from 'commander';
import pc from 'picocolors';
import { discoverProjectConfig } from '../lib/discover-project-config.js';
import { worktreePathFor } from '../lib/run/paths.js';
import { deleteSessionsForWorktree } from '../lib/sessions/cleanup.js';
import { removeWorktreeAndBranch } from '../lib/run/cleanup-worktree.js';

interface ResetOptions {
  hard?: boolean;
}

export async function runReset(key: string, opts: ResetOptions): Promise<void> {
  const config = await discoverProjectConfig(process.cwd());
  if (!config) {
    process.stderr.write(pc.red(`error: no crew project config found from ${process.cwd()}\n`));
    process.exit(1);
  }
  const worktree = worktreePathFor(config.repo_path, key);

  const sessions = deleteSessionsForWorktree({ worktree });
  if (!sessions.dirExisted) {
    process.stderr.write(pc.dim(`→ no sessions to delete (no project dir)\n`));
  } else {
    process.stderr.write(pc.dim(`→ deleted ${sessions.deletedCount} session file(s)\n`));
  }

  if (!opts.hard) return;

  const { worktreeRemoved, branchRemoved } = await removeWorktreeAndBranch({
    worktree,
    key,
  });
  process.stderr.write(
    pc.dim(
      worktreeRemoved
        ? `→ worktree removed: ${worktree}\n`
        : `→ worktree already removed: ${worktree}\n`,
    ),
  );
  process.stderr.write(
    pc.dim(branchRemoved ? `→ branch removed: ${key}\n` : `→ branch already removed: ${key}\n`),
  );
}

export const resetCommand = new Command('reset')
  .description("Wipe state for a ticket's worktree (sessions only by default)")
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--hard', 'also remove the worktree directory and the local branch')
  .action(async (key: string, opts: ResetOptions) => {
    await runReset(key, opts);
  });
