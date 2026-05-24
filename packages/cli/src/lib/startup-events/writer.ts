import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { StartupEvent } from 'crew-shared';

export interface EmitOptions {
  /** Test seam — override `~` to a temp dir. Defaults to `os.homedir()`. */
  home?: string;
}

export function startupEventsRootForHome(home: string): string {
  return join(home, '.crew', 'startup');
}

export function startupEventsFilePath(key: string, home: string = homedir()): string {
  return join(startupEventsRootForHome(home), `${key}.jsonl`);
}

/**
 * Append a single startup event as one JSONL line to
 * `~/.crew/startup/<key>.jsonl`. Daemon's chokidar watcher picks the
 * file up and ingests new lines as they arrive.
 *
 * Best-effort: failures are not thrown — the dispatch flow must never
 * break because the dashboard's startup-capture stream couldn't be
 * appended to. Logged to stderr instead.
 */
export async function emitStartupEvent(
  key: string,
  event: StartupEvent,
  opts: EmitOptions = {},
): Promise<void> {
  const file = startupEventsFilePath(key, opts.home);
  try {
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(
      `crew: failed to emit startup event for ${key}/${event.subtype}/${event.status}: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
  }
}
