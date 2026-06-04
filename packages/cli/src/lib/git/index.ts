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
 * Returns the absolute path to the top of the working tree containing `cwd`.
 * Wraps `git rev-parse --show-toplevel`.
 */
export async function getRepoRoot(cwd: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd });
  return stdout.trim();
}

/**
 * Parse the output of `git ls-files --eol` and return the paths whose
 * working-tree representation is CRLF.
 *
 * Each line looks like:
 *   `i/<idx-eol>  w/<wt-eol>  attr/<attrs><TAB><path>`
 * The columns before the tab are space-padded; the path follows the first
 * tab (and may itself contain spaces). This is the TypeScript equivalent of
 * the bash `awk -F'\t' '$1 ~ /w\/crlf/ { print $2 }'` one-liner — easier to
 * unit-test than shelling out to awk.
 */
export function parseLsFilesEol(output: string): string[] {
  const paths: string[] = [];
  for (const line of output.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const info = line.slice(0, tab);
    const path = line.slice(tab + 1);
    if (/\bw\/crlf\b/.test(info)) paths.push(path);
  }
  return paths;
}

/**
 * List tracked files in `cwd`'s repo whose working-tree representation is
 * CRLF, one path per array entry (relative to the repo root).
 */
export async function listCrlfWorkingTreeFiles(cwd: string): Promise<string[]> {
  const { stdout } = await execa('git', ['ls-files', '--eol'], { cwd });
  return parseLsFilesEol(stdout);
}

/**
 * Given the path to a project's main repo, derive the conventional sibling
 * worktree path for a ticket: `<repo>-<KEY>`.
 */
export function resolveWorktreePath(repoRoot: string, key: string): string {
  const trimmed = repoRoot.replace(/\/+$/, '');
  return join(dirname(trimmed), `${basename(trimmed)}-${key}`);
}
