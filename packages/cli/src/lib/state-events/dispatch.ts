import {
  emitStateEvent,
  emitStateEventSync,
  type EmitOptions,
  type StateEventInput,
} from './writer.js';

/**
 * Thin lifecycle-emit helpers for the dispatch commands. Each encodes the
 * `event` + `source` for one moment in a run's life so the command bodies stay
 * thin wrappers (crew-cli convention) and the decisions are unit-testable via
 * the `home` opts seam. Production callers pass no opts → real `~/.crew`.
 */

/** `crew run`, right after `registerRun` succeeds. */
export async function emitRunStarted(key: string, opts?: EmitOptions): Promise<void> {
  await emitStateEvent(key, { event: 'run_started', source: 'cli-run' }, opts);
}

/** `crew fix-pr`, at dispatch (after `registerRun`). */
export async function emitFixprStarted(key: string, opts?: EmitOptions): Promise<void> {
  await emitStateEvent(key, { event: 'fixpr_started', source: 'cli-fixpr' }, opts);
}

/** `crew finish`, once all post-merge cleanup steps complete. */
export async function emitFinishCompleted(key: string, opts?: EmitOptions): Promise<void> {
  await emitStateEvent(key, { event: 'finish_completed', source: 'cli-finish' }, opts);
}

/**
 * `crew run`, sync, on a pause-interrupt (the runner wrote a pause sentinel
 * before SIGTERMing the group — see `lib/pause-sentinel`). Emits `run_paused`
 * instead of the terminal `run_exited`: the daemon reduces it to a
 * non-terminal, resumable `idle` (CREW-273). Carries no `exitCode` — a pause
 * must never be mistaken for a non-zero (error) exit. Sync because `crew run`
 * calls `process.exit()` immediately after.
 */
export function emitRunPausedSync(key: string, opts?: EmitOptions): void {
  emitStateEventSync(key, { event: 'run_paused', source: 'runner-exit' }, opts);
}

/** The two dispatch commands whose child-process exit drives a state event. */
export type DispatchCommand = 'run' | 'fix-pr';

/**
 * Command-aware exit event: `run` → `run_exited`, `fix-pr` → `fixpr_exited`.
 * `exitCode` is carried so the daemon can route a non-zero exit to `error`;
 * `source` is always `runner-exit` (the exit half of the dispatch lifecycle).
 */
function dispatchExitedInput(command: DispatchCommand, exitCode: number): StateEventInput {
  return {
    event: command === 'run' ? 'run_exited' : 'fixpr_exited',
    source: 'runner-exit',
    exitCode,
  };
}

/** Async exit emit — for paths that drain naturally (e.g. `crew fix-pr`). */
export async function emitDispatchExited(
  key: string,
  command: DispatchCommand,
  exitCode: number,
  opts?: EmitOptions,
): Promise<void> {
  await emitStateEvent(key, dispatchExitedInput(command, exitCode), opts);
}

/**
 * Sync exit emit — for paths that call `process.exit()` immediately after
 * (e.g. `crew run`), where the async variant's microtask would never resolve.
 */
export function emitDispatchExitedSync(
  key: string,
  command: DispatchCommand,
  exitCode: number,
  opts?: EmitOptions,
): void {
  emitStateEventSync(key, dispatchExitedInput(command, exitCode), opts);
}
