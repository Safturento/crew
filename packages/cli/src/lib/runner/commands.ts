import type { RunnerCommand } from 'crew-shared';
import type { LaunchHandle } from './executor.js';
import type { Registry } from './registry.js';

/** Outcome of applying one claimed command — reported back to the daemon. */
export type ApplyResult = { status: 'applied' } | { status: 'failed'; error: string };

export interface ApplyCommandDeps {
  /** The live-process registry this runner is supervising. */
  registry: Registry;
  /**
   * Signal boundary. Called with a **negative** pid to target the whole
   * process group (`kill(-pgid, signal)`), so a `crew run` and every child it
   * spawned (claude, docker, …) receive the signal together. Injected so the
   * mapping is unit-tested without signalling real processes.
   */
  kill: (target: number, signal: NodeJS.Signals) => void;
  /**
   * Resume boundary. Re-dispatches `crew resume <agentKey>` (forwarding
   * `message` as `-m <message>` when set) on the agent's existing
   * worktree/session, resolving the spawned process's `{ pid, pgid }`. Injected
   * so the mapping is unit-tested without spawning. Optional: a runner wired
   * before resume support — or a test exercising only cancels — can omit it, in
   * which case a `resume`/`message` command fails cleanly rather than throwing.
   */
  resume?: (agentKey: string, message?: string) => Promise<LaunchHandle>;
  /**
   * Pause-sentinel boundary (CREW-273). Called for a `pause` **immediately
   * before** the SIGTERM, to durably mark the interrupt as a pause: a pause and
   * a cancel both reach `crew run` as a SIGTERM, so `crew run`'s signal handler
   * consumes this sentinel to settle non-terminally (`run_paused` → resumable)
   * instead of erroring like a cancel. Injected so ordering (sentinel before
   * kill) is unit-tested without touching the filesystem. Optional and
   * best-effort: when absent the pause still SIGTERMs — it just degrades to a
   * terminal cancel on the `crew run` side.
   */
  writePauseSentinel?: (agentKey: string) => void;
  /**
   * Supervisor-control boundary (CREW-293). Called for the queue-level
   * `supervisor_stop` / `supervisor_restart` commands, which target the
   * supervisor process itself rather than a tracked agent. `stop` requests a
   * graceful runner shutdown; `restart` requests an exit-and-respawn (the
   * worker exits non-zero and the supervisor's self-respawn loop relaunches
   * it). Injected so the mapping is unit-tested without exiting the process.
   * Optional: a runner wired before supervisor-control support — or a test
   * exercising only the per-process kinds — can omit it, in which case a
   * `supervisor_*` command fails cleanly rather than throwing.
   */
  supervisorControl?: (action: 'stop' | 'restart') => void;
}

/**
 * Pure mapping from a claimed {@link RunnerCommand} to its host-side effect.
 * The loop claims a command, calls this, and reports the {@link ApplyResult}
 * back to the daemon (`applied` / `failed`).
 *
 * - `cancel_soft` → `SIGTERM` the tracked process group + mark the entry
 *   `cancelling`. The agent exits gracefully and reports its own run
 *   completion; the entry drops from the next snapshot when it dies.
 * - `cancel_hard` → `SIGKILL` the tracked process group + stop tracking it
 *   (the force-killed process can't self-report; the daemon settles the
 *   orphaned run from the snapshot).
 * - `pause` → `SIGTERM` the tracked process group to interrupt the current
 *   turn, then mark the entry `paused` and **keep** it tracked (unlike
 *   `cancel_*`). The paused entry persists in the heartbeat snapshot so the
 *   operator can later `resume` it.
 * - `resume` → re-dispatch `crew resume <key>` (via the injected `resume`
 *   boundary) on the existing worktree/session and re-register the entry
 *   `running` with the new pid/pgid.
 * - `message` → identical to `resume`, always forwarding `payload.message` into
 *   `crew resume <key> -m <message>` (the steer/inject path).
 * - `reap` → stop tracking an orphan terminal without signalling (idempotent;
 *   `applied` even when nothing is tracked — the process is already gone).
 * - `supervisor_stop` / `supervisor_restart` → queue-level (no `agentKey`):
 *   invoke the injected `supervisorControl` boundary to gracefully stop the
 *   runner (`stop`) or exit-and-respawn it (`restart`). `failed` when no
 *   boundary is wired.
 * - `dequeue` → `failed` "not yet supported": it needs a daemon action-drop
 *   route (out of the host runner's scope).
 *
 * `kill` throwing (e.g. `ESRCH` — the group already exited) or the `resume`
 * boundary rejecting is absorbed into a `failed` result so a racey command
 * never crashes the drain loop.
 */
export async function applyCommand(
  command: RunnerCommand,
  deps: ApplyCommandDeps,
): Promise<ApplyResult> {
  switch (command.kind) {
    case 'cancel_soft':
      return signalGroup(command, deps, 'SIGTERM', 'cancelling');
    case 'cancel_hard':
      return signalGroup(command, deps, 'SIGKILL', 'remove');
    case 'pause':
      return signalGroup(command, deps, 'SIGTERM', 'paused');
    case 'resume':
    case 'message':
      // `resume` carries no message; `message` always forwards one. Both flow
      // through the same re-dispatch — forward whatever the payload holds.
      return resumeAgent(command, deps, command.payload?.message);
    case 'reap':
      // No signal — the orphan is already dead; just stop tracking it.
      if (command.agentKey) deps.registry.remove(command.agentKey);
      return { status: 'applied' };
    case 'supervisor_stop':
      return supervisorControl(command, deps, 'stop');
    case 'supervisor_restart':
      return supervisorControl(command, deps, 'restart');
    default:
      return {
        status: 'failed',
        error: `command kind '${command.kind}' not yet supported by the host runner`,
      };
  }
}

/**
 * Shared signal path: resolve the tracked entry, signal its process group, then
 * either transition state (`cancel_soft`→`cancelling`, `pause`→`paused`, both
 * kept tracked) or drop tracking (`cancel_hard`→`remove`). A missing entry or a
 * null `agentKey` is a `failed` result — these commands target a live process.
 *
 * For `pause` only, a pause sentinel is written **before** the SIGTERM (CREW-273)
 * so `crew run`'s signal handler can tell the pause-interrupt apart from a
 * cancel and settle the run non-terminally. It is written only after the entry
 * is resolved (so a no-op `pause` against a missing process leaves no stale
 * sentinel to mis-mark a later cancel).
 */
function signalGroup(
  command: RunnerCommand,
  deps: ApplyCommandDeps,
  signal: NodeJS.Signals,
  after: 'cancelling' | 'paused' | 'remove',
): ApplyResult {
  if (!command.agentKey) {
    return { status: 'failed', error: `${command.kind} command ${command.id} has no agentKey` };
  }
  const proc = deps.registry.get(command.agentKey);
  if (!proc) {
    return { status: 'failed', error: `no tracked process for ${command.agentKey}` };
  }
  if (after === 'paused') deps.writePauseSentinel?.(command.agentKey);
  try {
    deps.kill(-proc.pgid, signal);
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }
  if (after === 'remove') deps.registry.remove(command.agentKey);
  else deps.registry.setState(command.agentKey, after);
  return { status: 'applied' };
}

/**
 * Shared `resume`/`message` path: re-dispatch `crew resume <key>` on the
 * existing worktree/session (forwarding `message` when set) and re-register the
 * tracked entry `running` with the spawned pid/pgid. A null `agentKey`, a
 * missing entry, an absent `resume` boundary, or a boundary that rejects all
 * yield a `failed` result and leave the registry entry untouched, so the
 * operator can retry without the drain loop crashing.
 */
async function resumeAgent(
  command: RunnerCommand,
  deps: ApplyCommandDeps,
  message?: string,
): Promise<ApplyResult> {
  if (!command.agentKey) {
    return { status: 'failed', error: `${command.kind} command ${command.id} has no agentKey` };
  }
  if (!deps.resume) {
    return {
      status: 'failed',
      error: `runner has no resume boundary configured for '${command.kind}'`,
    };
  }
  const proc = deps.registry.get(command.agentKey);
  if (!proc) {
    return { status: 'failed', error: `no tracked process for ${command.agentKey}` };
  }
  let handle: LaunchHandle;
  try {
    handle = await deps.resume(command.agentKey, message);
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }
  deps.registry.add({ ...proc, pid: handle.pid, pgid: handle.pgid, state: 'running' });
  return { status: 'applied' };
}

/**
 * Supervisor-control path (CREW-293): hand a `stop`/`restart` request to the
 * injected `supervisorControl` boundary, which translates it into the worker's
 * exit behavior (`stop` → clean exit ends the supervisor loop; `restart` →
 * non-zero exit triggers the supervisor's self-respawn). Queue-level — no
 * `agentKey`. A missing boundary or one that throws yields a `failed` result so
 * a runner wired before supervisor-control support never crashes the drain loop.
 */
function supervisorControl(
  command: RunnerCommand,
  deps: ApplyCommandDeps,
  action: 'stop' | 'restart',
): ApplyResult {
  if (!deps.supervisorControl) {
    return {
      status: 'failed',
      error: `runner has no supervisorControl boundary configured for '${command.kind}'`,
    };
  }
  try {
    deps.supervisorControl(action);
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }
  return { status: 'applied' };
}
