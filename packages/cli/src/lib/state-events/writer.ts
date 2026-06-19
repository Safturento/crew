import { promises as fs, appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { EventSource, StateEvent, StateEventKind } from 'crew-shared';

export interface EmitOptions {
  /** Test seam — override `~` to a temp dir. Defaults to `os.homedir()`. */
  home?: string;
}

/**
 * The producer-supplied half of a state event. The writer fills in the
 * `eventId`, `key`, and `ts` — callers only assert the lifecycle fact.
 */
export interface StateEventInput {
  event: StateEventKind;
  source: EventSource;
  prUrl?: string;
  runId?: number;
  exitCode?: number | null;
}

export function newEventId(): string {
  return randomUUID();
}

export function stateEventsRootForHome(home: string): string {
  return join(home, '.crew', 'state-events');
}

export function stateEventsFilePath(key: string, home: string = homedir()): string {
  return join(stateEventsRootForHome(home), `${key}.jsonl`);
}

function build(key: string, input: StateEventInput): StateEvent {
  return { eventId: newEventId(), key, ts: new Date().toISOString(), ...input };
}

/**
 * Append a single state event as one JSONL line to
 * `~/.crew/state-events/<key>.jsonl`. The daemon's chokidar watcher picks
 * the file up and reduces new lines into concrete state transitions.
 *
 * Best-effort: failures are never thrown — the dispatch flow must not break
 * because the state-event stream couldn't be appended to. Logged to stderr.
 */
export async function emitStateEvent(
  key: string,
  input: StateEventInput,
  opts: EmitOptions = {},
): Promise<void> {
  const file = stateEventsFilePath(key, opts.home);
  try {
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(build(key, input))}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(
      `crew: failed to emit state event ${key}/${input.event}: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
  }
}

/**
 * Synchronous variant of `emitStateEvent`. Used in error/exit paths that
 * immediately call `process.exit()`: the async variant's microtask would
 * never resolve before the process tears down, so the event would be lost.
 * Same best-effort error handling.
 */
export function emitStateEventSync(
  key: string,
  input: StateEventInput,
  opts: EmitOptions = {},
): void {
  const file = stateEventsFilePath(key, opts.home);
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(build(key, input))}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(
      `crew: failed to emit state event ${key}/${input.event}: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
  }
}
