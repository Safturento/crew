import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/**
 * Compute the worktree path for `<repo>-<KEY>`. The new worktree is a
 * sibling of the source repo so the docker host port allocator (which
 * keys off the basename) gives different worktrees different ports.
 */
export function worktreePathFor(repoPath: string, key: string): string {
  const trimmed = repoPath.replace(/\/+$/, '');
  return join(dirname(trimmed), `${basename(trimmed)}-${key}`);
}

/**
 * Path to the Claude Code project directory that holds JSONL transcripts
 * for runs invoked from `worktreePath`. Claude encodes the cwd by replacing
 * each `/` in the absolute path with `-` (so a leading slash becomes a
 * leading dash).
 */
export function claudeProjectDirFor(worktreePath: string, home: string = homedir()): string {
  const encoded = worktreePath.replace(/\//g, '-');
  return join(home, '.claude', 'projects', encoded);
}

export function runLogPathFor(key: string): string {
  return `/tmp/crew-run-${key}.log`;
}

export function dockerLogPathFor(key: string): string {
  return `/tmp/crew-docker-${key}.log`;
}
