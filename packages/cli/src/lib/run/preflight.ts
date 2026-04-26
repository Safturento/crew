import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

/**
 * Whether `name` exists as an executable file in one of the `:`-separated
 * directories of `path` (defaults to $PATH). Avoids spawning `which` so the
 * check is portable to minimal containers and Alpine/musl images that don't
 * ship one by default.
 */
export function hasBinary(name: string, path: string = process.env.PATH ?? ''): boolean {
  for (const dir of path.split(':')) {
    if (!dir) continue;
    try {
      accessSync(join(dir, name), constants.X_OK);
      return true;
    } catch {
      // not in this dir; try next
    }
  }
  return false;
}

/**
 * Return the subset of `tools` that are not on $PATH (or `path`), preserving
 * input order.
 */
export function preflightTools(
  tools: readonly string[],
  path: string = process.env.PATH ?? '',
): string[] {
  return tools.filter((tool) => !hasBinary(tool, path));
}
