import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Cross-process pause signalling between the host runner and `crew run`
 * (CREW-273). A `pause` and a `cancel` both reach `crew run` as a SIGTERM, so
 * the parent can't tell them apart from the signal alone. The runner's `pause`
 * apply path (slice 1 / CREW-272 in `lib/runner/commands.ts`) writes a per-key
 * sentinel file *before* SIGTERMing the tracked process group; `crew run`'s
 * signal handler {@link consumePauseSentinel}s it — present ⇒ this interrupt is a
 * pause, so the run stays resumable (emit `run_paused`, suppress `completeRun`)
 * instead of settling terminally.
 *
 * The sentinel lives under `~/.crew/` alongside the state-event stream so both
 * host processes resolve the same path. Keyed by `agentKey` (the ticket key);
 * `home` is a test seam mirroring the state-events writer.
 */
export interface PauseSentinelOptions {
  /** Test seam — override `~` to a temp dir. Defaults to `os.homedir()`. */
  home?: string;
}

export function pauseSentinelsDir(home: string = homedir()): string {
  return join(home, '.crew', 'pause-sentinels');
}

export function pauseSentinelPath(key: string, opts: PauseSentinelOptions = {}): string {
  return join(pauseSentinelsDir(opts.home ?? homedir()), key);
}

/**
 * Write the pause sentinel for `key`. Called by the runner immediately before
 * it SIGTERMs the `crew run` process group for a `pause`. Synchronous so the
 * file is durable before the signal is delivered. Best-effort: a failed write
 * is swallowed (the pause then degrades to a normal cancel rather than
 * crashing the runner's drain loop).
 */
export function writePauseSentinel(key: string, opts: PauseSentinelOptions = {}): void {
  const file = pauseSentinelPath(key, opts);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${new Date().toISOString()}\n`, 'utf8');
  } catch {
    // best-effort — see doc comment.
  }
}

/**
 * Read-and-delete the pause sentinel for `key`. Returns `true` when one was
 * present (the interrupt was a pause). Consume-on-read so a stale sentinel from
 * an earlier paused run can't make a later genuine cancel be misread as a pause.
 * Synchronous so it is safe to call from a signal handler.
 */
export function consumePauseSentinel(key: string, opts: PauseSentinelOptions = {}): boolean {
  const file = pauseSentinelPath(key, opts);
  if (!existsSync(file)) return false;
  try {
    rmSync(file, { force: true });
  } catch {
    // If removal fails the file lingers, but we still report the pause we saw.
  }
  return true;
}
