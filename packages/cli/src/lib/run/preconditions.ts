import { existsSync } from 'node:fs';

/**
 * Throw with a useful message if a file or directory already lives at the
 * worktree path we're about to create.
 */
export function requireWorktreeAvailable(path: string): void {
  if (existsSync(path)) {
    throw new Error(
      `worktree already exists at ${path}\n` +
        `       • To continue an interrupted run:    crew resume <KEY>\n` +
        `       • To wipe state and start fresh:    crew restart <KEY> --hard\n` +
        `         (or, manually:                    crew reset <KEY> --hard && crew run <KEY>)`,
    );
  }
}
