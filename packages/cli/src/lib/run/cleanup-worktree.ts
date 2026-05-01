import { execa } from 'execa';
import { existsSync, rmSync } from 'node:fs';

export interface RemoveWorktreeOptions {
  worktree: string;
  key: string;
  repoPath: string;
}

export type WorktreeRemovalState =
  | 'removed' // git successfully removed it
  | 'notFound' // path didn't exist at start
  | 'orphanCleaned' // git refused, dir existed, fell back to rm -rf (succeeded)
  | 'failed'; // git refused AND fallback failed (or unrelated error)

export type BranchRemovalState = 'removed' | 'notFound' | 'failed';

export interface RemoveWorktreeResult {
  worktree: WorktreeRemovalState;
  worktreeError?: string;
  branch: BranchRemovalState;
  branchError?: string;
}

/**
 * Idempotent `git worktree remove` + `git branch -D` with orphan recovery.
 *
 * All git invocations run with `opts.repoPath` as cwd — branch queries need
 * to resolve against the source repo, not whatever happens to surround the
 * worktree path on disk.
 */
export async function removeWorktreeAndBranch(
  opts: RemoveWorktreeOptions,
): Promise<RemoveWorktreeResult> {
  const cwd = opts.repoPath;

  // Cheap, safe upfront — clears stale admin entries that may confuse the remove call.
  await execa('git', ['worktree', 'prune'], { cwd, reject: false });

  let worktree: WorktreeRemovalState = 'notFound';
  let worktreeError: string | undefined;
  if (existsSync(opts.worktree)) {
    const result = await execa('git', ['worktree', 'remove', opts.worktree, '--force'], {
      cwd,
      reject: false,
    });
    if (result.exitCode === 0) {
      worktree = 'removed';
    } else if (existsSync(opts.worktree)) {
      // Orphan: git refused, dir still there. --hard intent is "make it gone."
      try {
        rmSync(opts.worktree, { recursive: true, force: true });
        worktree = 'orphanCleaned';
        worktreeError = result.stderr.trim() || `git worktree remove rc=${result.exitCode}`;
      } catch (err) {
        worktree = 'failed';
        worktreeError = err instanceof Error ? err.message : String(err);
      }
    } else {
      // Race: dir disappeared between existsSync and remove. Treat as removed.
      worktree = 'removed';
    }
  }

  const listResult = await execa('git', ['branch', '--list', opts.key], { cwd, reject: false });
  const branchExists = listResult.stdout.trim().length > 0;

  let branch: BranchRemovalState = 'notFound';
  let branchError: string | undefined;
  if (branchExists) {
    const result = await execa('git', ['branch', '-D', opts.key], { cwd, reject: false });
    if (result.exitCode === 0) {
      branch = 'removed';
    } else {
      branch = 'failed';
      branchError = result.stderr.trim() || `git branch -D rc=${result.exitCode}`;
    }
  }

  return { worktree, worktreeError, branch, branchError };
}
