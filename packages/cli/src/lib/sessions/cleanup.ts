import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { encodeWorktreeProjectPath } from './index.js';

const DEFAULT_PROJECTS_ROOT = join(homedir(), '.claude', 'projects');

export interface DeleteSessionsOptions {
  worktree: string;
  /** Override `~/.claude/projects/` for testing. */
  projectsRoot?: string;
}

export interface DeleteSessionsResult {
  /** Number of `.jsonl` files removed. 0 if dir didn't exist. */
  deletedCount: number;
  /** Whether the project dir existed before deletion. */
  dirExisted: boolean;
}

/**
 * Delete every `.jsonl` transcript under
 * `~/.claude/projects/<encoded-worktree>/`. Non-`.jsonl` files (e.g. a
 * `README` an operator dropped in) are preserved. Idempotent — returns
 * dirExisted: false when there's nothing to do.
 */
export function deleteSessionsForWorktree(opts: DeleteSessionsOptions): DeleteSessionsResult {
  const root = opts.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  const dir = join(root, encodeWorktreeProjectPath(opts.worktree));

  if (!existsSync(dir)) {
    return { deletedCount: 0, dirExisted: false };
  }

  let deletedCount = 0;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.jsonl')) continue;
    unlinkSync(join(dir, entry));
    deletedCount += 1;
  }
  return { deletedCount, dirExisted: true };
}
