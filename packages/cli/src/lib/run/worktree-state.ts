import { execa } from 'execa';

export interface WorktreeState {
  branch: string;
  commitsAhead: number;
  uncommittedCount: number;
}

/**
 * Read git state from a worktree: current branch, commits ahead of
 * origin/main, count of uncommitted files (modified + untracked).
 *
 * Assumes `git fetch origin` has already run — the caller is responsible
 * for refreshing refs before this is meaningful. Each subprocess uses
 * `reject: false` so a missing remote ref resolves to 0 rather than
 * throwing.
 */
export async function readWorktreeState(worktree: string): Promise<WorktreeState> {
  const branchResult = await execa('git', ['branch', '--show-current'], {
    cwd: worktree,
    reject: false,
  });
  const branch = branchResult.stdout.trim();

  const aheadResult = await execa('git', ['rev-list', '--count', 'origin/main..HEAD'], {
    cwd: worktree,
    reject: false,
  });
  const parsed = Number.parseInt(aheadResult.stdout.trim() || '0', 10);
  const commitsAhead = Number.isFinite(parsed) ? parsed : 0;

  const statusResult = await execa('git', ['status', '--porcelain'], {
    cwd: worktree,
    reject: false,
  });
  const uncommittedCount = statusResult.stdout.split('\n').filter((line) => line.length > 0).length;

  return { branch, commitsAhead, uncommittedCount };
}
