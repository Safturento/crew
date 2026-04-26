import { existsSync, statSync } from 'node:fs';

/**
 * Throw with a useful message if the gh-token file is missing or empty. Used
 * by `crew run` to bail before creating a worktree it can't authorize.
 */
export function requireGhToken(path: string): void {
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(
      `gh-token file missing or empty: ${path}\n       create it with: echo 'github_pat_…' > ${path} && chmod 600 ${path}`,
    );
  }
}

/**
 * Throw with a useful message if a file or directory already lives at the
 * worktree path we're about to create.
 */
export function requireWorktreeAvailable(path: string): void {
  if (existsSync(path)) {
    throw new Error(
      `worktree already exists at ${path}\n       remove it first: git worktree remove '${path}'`,
    );
  }
}
