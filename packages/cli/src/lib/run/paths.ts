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

export function runLogPathFor(key: string): string {
  return `/tmp/crew-run-${key}.log`;
}

export function dockerLogPathFor(key: string): string {
  return `/tmp/crew-docker-${key}.log`;
}

export function playwrightLogPathFor(key: string): string {
  return `/tmp/crew-playwright-${key}.log`;
}

export function npmInstallLogPathFor(key: string): string {
  return `/tmp/crew-npm-install-${key}.log`;
}

export function verifyGateLogPathFor(key: string): string {
  return `/tmp/crew-verify-gate-${key}.log`;
}
