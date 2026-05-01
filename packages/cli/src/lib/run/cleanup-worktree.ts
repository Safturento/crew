import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RemoveWorktreeOptions {
  worktree: string;
  key: string;
}

export interface RemoveWorktreeResult {
  /** True if `git worktree remove` ran and succeeded. False if path didn't exist or removal returned non-zero. */
  worktreeRemoved: boolean;
  /** True if `git branch -D` ran and succeeded. False if branch didn't exist. */
  branchRemoved: boolean;
}

/**
 * Idempotent `git worktree remove` + `git branch -D`. Treats either
 * artifact's absence as "already removed" rather than an error — so
 * `crew reset --hard` can run after a partial manual cleanup without
 * blowing up.
 *
 * git is invoked from the *parent* of the worktree path. `dirname`
 * returns a directory that should always be inside the source repo
 * (worktree paths from `worktreePathFor` are siblings of the source).
 */
export async function removeWorktreeAndBranch(
  opts: RemoveWorktreeOptions,
): Promise<RemoveWorktreeResult> {
  const cwd = dirname(opts.worktree);

  let worktreeRemoved = false;
  if (existsSync(opts.worktree)) {
    const result = await execa('git', ['worktree', 'remove', opts.worktree, '--force'], {
      cwd,
      reject: false,
    });
    worktreeRemoved = result.exitCode === 0;
  }

  // Try branch deletion regardless of worktree state — branch can outlive the worktree dir.
  const branchResult = await execa('git', ['branch', '-D', opts.key], {
    cwd,
    reject: false,
  });
  const branchRemoved = branchResult.exitCode === 0;

  return { worktreeRemoved, branchRemoved };
}
