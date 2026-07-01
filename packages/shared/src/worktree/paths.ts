import { basename, dirname, join } from 'node:path';

/**
 * Compute the worktree path for `<repo>-<KEY>`. The worktree is a sibling of
 * the source repo so the docker host port allocator (which keys off the
 * basename) gives different worktrees different ports.
 *
 * Canonical home is `crew-shared` so both the CLI (which creates the worktree)
 * and the daemon (which births the agent row at enqueue, CREW-307) derive the
 * same path from one implementation. `packages/cli/src/lib/run/paths.ts`
 * re-exports it for existing callers.
 */
export function worktreePathFor(repoPath: string, key: string): string {
  const trimmed = repoPath.replace(/\/+$/, '');
  return join(dirname(trimmed), `${basename(trimmed)}-${key}`);
}
