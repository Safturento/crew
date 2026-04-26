import { execa } from 'execa';
import { basename, dirname, join } from 'node:path';

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
 * `git fetch origin <branch>` in the worktree. Throws on non-zero exit.
 */
export async function fetchOrigin(cwd: string, branch: string): Promise<void> {
  await execa('git', ['fetch', 'origin', branch], { cwd });
}

export type RebaseResult = { ok: true } | { ok: false; conflicts: string[] };

/**
 * Rebase the current branch onto `ref`. Returns `{ok: true}` on a clean
 * rebase, or `{ok: false, conflicts: [...]}` when git is left in a rebase
 * state with conflicts. Throws on any other failure (so the caller can
 * surface the unexpected error and leave the worktree as-is).
 */
export async function rebaseOnto(cwd: string, ref: string): Promise<RebaseResult> {
  try {
    await execa('git', ['rebase', ref], { cwd });
    return { ok: true };
  } catch (rebaseErr) {
    if (await isMidRebase(cwd)) {
      const conflicts = await listConflictFiles(cwd);
      return { ok: false, conflicts };
    }
    throw rebaseErr;
  }
}

async function isMidRebase(cwd: string): Promise<boolean> {
  for (const variant of ['rebase-merge', 'rebase-apply']) {
    const { stdout: relPath } = await execa('git', ['rev-parse', '--git-path', variant], { cwd });
    const fullPath = relPath.trim();
    try {
      await execa('test', ['-d', fullPath], { cwd });
      return true;
    } catch {
      // not a directory; try next variant
    }
  }
  return false;
}

async function listConflictFiles(cwd: string): Promise<string[]> {
  const { stdout } = await execa('git', ['diff', '--name-only', '--diff-filter=U'], { cwd });
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Given the path to a project's main repo, derive the conventional sibling
 * worktree path for a ticket: `<repo>-<KEY>`.
 */
export function resolveWorktreePath(repoRoot: string, key: string): string {
  const trimmed = repoRoot.replace(/\/+$/, '');
  return join(dirname(trimmed), `${basename(trimmed)}-${key}`);
}
