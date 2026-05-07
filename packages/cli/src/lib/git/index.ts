import { execa } from 'execa';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';

/**
 * Returns true if the worktree has any uncommitted changes (working tree
 * or staged). Wraps `git diff --quiet` + `git diff --cached --quiet`.
 */
export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const dirty = async (args: string[]): Promise<boolean> => {
    try {
      await execa('git', args, { cwd });
      return false;
    } catch {
      return true;
    }
  };
  const wt = await dirty(['diff', '--quiet']);
  const staged = await dirty(['diff', '--cached', '--quiet']);
  return wt || staged;
}

/**
 * Returns true if the worktree is mid-rebase — i.e. a prior `git rebase`
 * stopped on conflicts or was interrupted, leaving `.git/rebase-merge` or
 * `.git/rebase-apply` behind. Used by callers that want to fail fast with
 * recovery guidance before doing any other work.
 */
export async function isMidRebase(cwd: string): Promise<boolean> {
  for (const variant of ['rebase-merge', 'rebase-apply']) {
    const { stdout: relPath } = await execa('git', ['rev-parse', '--git-path', variant], { cwd });
    const trimmed = relPath.trim();
    const fullPath = isAbsolute(trimmed) ? trimmed : join(cwd, trimmed);
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) return true;
  }
  return false;
}

/**
 * Returns the SHA of HEAD in the worktree.
 */
export async function getHeadSha(cwd: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd });
  return stdout.trim();
}

/**
 * Given the path to a project's main repo, derive the conventional sibling
 * worktree path for a ticket: `<repo>-<KEY>`.
 */
export function resolveWorktreePath(repoRoot: string, key: string): string {
  const trimmed = repoRoot.replace(/\/+$/, '');
  return join(dirname(trimmed), `${basename(trimmed)}-${key}`);
}
