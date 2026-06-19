import { promises as fs, appendFileSync, mkdirSync, accessSync, constants } from 'node:fs';
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

/** Injected fs boundaries for {@link ensureStateEventsDir} (test seam). */
export interface EnsureStateEventsDirDeps {
  /** Create the dir (recursively). May throw — the caller recovers. */
  mkdir: (dir: string) => void;
  /** True when the current user can write into the dir. */
  isWritable: (dir: string) => boolean;
}

const defaultEnsureStateEventsDirDeps: EnsureStateEventsDirDeps = {
  mkdir: (dir) => {
    mkdirSync(dir, { recursive: true });
  },
  isWritable: (dir) => {
    try {
      accessSync(dir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
};

export interface EnsureStateEventsDirResult {
  /** The resolved state-events root (`~/.crew/state-events`). */
  dir: string;
  /** True when the dir exists and is writable by the current user. */
  writable: boolean;
}

/**
 * The chown remediation an operator runs when `~/.crew/state-events` ended up
 * `nobody`-owned (Docker fabricated the bind-mount source before crew created
 * it). Mirrors the runner-log remediation in `runner/supervisor.ts`.
 */
export function stateEventsChownRemediation(dir: string): string {
  return (
    `state-events dir ${dir} is not writable by the current user — ` +
    `Docker likely created it as 'nobody'. ` +
    `Fix ownership with: sudo chown -R "$(id -u):$(id -g)" ${dir}`
  );
}

/**
 * Ensure `~/.crew/state-events` exists host-side, owned by the invoking user,
 * before docker compose mounts it read-only or dispatch appends to it.
 *
 * Mirrors `ensureRunnerLogDir`: Docker fabricates a missing bind-mount source as
 * the container user (`nobody`), so a `docker compose up` that beats this dir
 * into existence leaves every host-side emitter unable to append (EACCES,
 * swallowed by the best-effort writer → zero `state_transitions` are ever
 * written). Pre-creating here means compose mounts an already-present,
 * user-owned directory. When the dir already exists but isn't writable (Docker
 * won the race), `writable` is false so the caller can surface the chown
 * remediation instead of a silent no-op.
 */
export function ensureStateEventsDir(
  opts: EmitOptions = {},
  deps: EnsureStateEventsDirDeps = defaultEnsureStateEventsDirDeps,
): EnsureStateEventsDirResult {
  const dir = stateEventsRootForHome(opts.home ?? homedir());
  try {
    deps.mkdir(dir);
  } catch {
    // A pre-existing dir owned by another user makes mkdir throw; the
    // writability probe below is the real signal and yields a remediation.
  }
  return { dir, writable: deps.isWritable(dir) };
}

/**
 * Build the stderr line for a failed emit. On a permission error (EACCES/EPERM
 * — the `nobody`-owned-dir footgun) the chown remediation is appended so a
 * perms regression is loud and self-explanatory rather than a swallowed no-op.
 */
export function emitFailureLine(
  dir: string,
  key: string,
  event: StateEventKind,
  err: unknown,
): string {
  const reason = err instanceof Error ? err.message : String(err);
  const code = (err as NodeJS.ErrnoException | null)?.code;
  const remediation =
    code === 'EACCES' || code === 'EPERM' ? `\n${stateEventsChownRemediation(dir)}` : '';
  return `crew: failed to emit state event ${key}/${event}: ${reason}${remediation}`;
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
    process.stderr.write(`${emitFailureLine(dirname(file), key, input.event, err)}\n`);
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
    process.stderr.write(`${emitFailureLine(dirname(file), key, input.event, err)}\n`);
  }
}
