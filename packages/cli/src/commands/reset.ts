import { Command } from 'commander';
import pc from 'picocolors';
import { discoverProjectConfig } from '../lib/discover-project-config.js';
import { worktreePathFor } from '../lib/run/paths.js';
import { deleteSessionsForWorktree } from '../lib/sessions/cleanup.js';
import {
  removeWorktreeAndBranch,
  type BranchRemovalState,
  type WorktreeRemovalState,
} from '../lib/run/cleanup-worktree.js';

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

  const result = await removeWorktreeAndBranch({ worktree, key, repoPath: config.repo_path });
  writeWorktreeMessage(worktree, result.worktree, result.worktreeError);
  writeBranchMessage(key, result.branch, result.branchError);
}

function writeWorktreeMessage(
  worktree: string,
  state: WorktreeRemovalState,
  error: string | undefined,
): void {
  switch (state) {
    case 'removed':
      process.stderr.write(pc.dim(`→ worktree removed: ${worktree}\n`));
      return;
    case 'notFound':
      process.stderr.write(pc.dim(`→ worktree not present: ${worktree}\n`));
      return;
    case 'orphanCleaned':
      process.stderr.write(
        pc.yellow(`→ worktree's git admin was missing; removed orphaned directory: ${worktree}\n`),
      );
      if (error) process.stderr.write(pc.dim(`   (git error: ${error})\n`));
      return;
    case 'failed':
      process.stderr.write(pc.red(`→ worktree removal failed: ${worktree}\n`));
      if (error) process.stderr.write(pc.dim(`   (error: ${error})\n`));
      return;
  }
}

function writeBranchMessage(
  key: string,
  state: BranchRemovalState,
  error: string | undefined,
): void {
  switch (state) {
    case 'removed':
      process.stderr.write(pc.dim(`→ branch removed: ${key}\n`));
      return;
    case 'notFound':
      process.stderr.write(pc.dim(`→ branch not present: ${key}\n`));
      return;
    case 'failed':
      process.stderr.write(pc.red(`→ branch removal failed: ${key}\n`));
      if (error) process.stderr.write(pc.dim(`   (error: ${error})\n`));
      return;
  }
}

export const resetCommand = new Command('reset')
  .description("Wipe state for a ticket's worktree (sessions only by default)")
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--hard', 'also remove the worktree directory and the local branch')
  .action(async (key: string, opts: ResetOptions) => {
    await runReset(key, opts);
  });
