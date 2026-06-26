import { homedir } from 'node:os';
import { join } from 'node:path';

import { startupEventsRootForHome } from './writer.js';

/**
 * Path to a `crew run`'s raw startup console log:
 * `~/.crew/startup/<key>.log` — a sibling of the `<key>.jsonl` startup events
 * under the same root. The runner redirects the detached child's stdout+stderr
 * here (append-mode) so a silent pre-registration death still leaves a log the
 * daemon can serve.
 */
export function startupLogFilePath(key: string, home: string = homedir()): string {
  return join(startupEventsRootForHome(home), `${key}.log`);
}
