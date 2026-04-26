import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

export * from './discovery.js';

const DEFAULT_PROJECTS_ROOT = join(homedir(), '.claude', 'projects');

/**
 * Convert an absolute worktree path into the encoded directory name Claude
 * Code uses under `~/.claude/projects/`. The format is the path with each
 * `/` replaced by `-` (so a leading `/` becomes a leading `-`).
 *
 * Example: `/home/u/repo` → `-home-u-repo`.
 */
export function encodeWorktreeProjectPath(worktree: string): string {
  return worktree.replace(/\//g, '-');
}

export interface FindLatestSessionOptions {
  worktree: string;
  /** Override `~/.claude/projects/` for testing. */
  projectsRoot?: string;
}

export interface SessionRef {
  sessionId: string;
  transcriptPath: string;
}

/**
 * Find the most recently modified JSONL transcript in the Claude Code
 * project folder for a worktree. Returns null if the folder doesn't exist
 * or contains no transcripts.
 */
export function findLatestSession(opts: FindLatestSessionOptions): SessionRef | null {
  const root = opts.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  const dir = join(root, encodeWorktreeProjectPath(opts.worktree));
  if (!existsSync(dir)) return null;

  let latest: { path: string; mtimeMs: number } | null = null;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.jsonl')) continue;
    const full = join(dir, entry);
    const mtimeMs = statSync(full).mtimeMs;
    if (!latest || mtimeMs > latest.mtimeMs) {
      latest = { path: full, mtimeMs };
    }
  }

  if (!latest) return null;
  return {
    sessionId: basename(latest.path, '.jsonl'),
    transcriptPath: latest.path,
  };
}
