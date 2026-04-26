import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export interface FindNewestTranscriptOptions {
  signal: AbortSignal;
  pollMs?: number;
}

/**
 * Wait for a `.jsonl` file to appear in `projectDir` and return the path of
 * the newest (highest mtime). Returns null if `signal` aborts before any
 * `.jsonl` file shows up. Used to discover Claude Code's session transcript
 * once the headless agent has started writing.
 */
export async function findNewestTranscript(
  projectDir: string,
  opts: FindNewestTranscriptOptions,
): Promise<string | null> {
  const pollMs = opts.pollMs ?? 200;

  while (!opts.signal.aborted) {
    if (existsSync(projectDir)) {
      let newestPath: string | null = null;
      let newestMtime = -Infinity;
      for (const entry of readdirSync(projectDir)) {
        if (!entry.endsWith('.jsonl')) continue;
        const full = join(projectDir, entry);
        const mtime = statSync(full).mtimeMs;
        if (mtime > newestMtime) {
          newestMtime = mtime;
          newestPath = full;
        }
      }
      if (newestPath) return newestPath;
    }
    await delay(pollMs);
  }
  return null;
}
