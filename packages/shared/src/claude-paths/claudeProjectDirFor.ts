import { homedir } from 'node:os';
import { join } from 'node:path';

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
