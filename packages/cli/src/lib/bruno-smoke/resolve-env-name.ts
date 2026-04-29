import { basename } from 'node:path';

export function resolveBrunoEnvName(worktreePath: string): string {
  return basename(worktreePath.replace(/\/+$/, '')).toLowerCase();
}
