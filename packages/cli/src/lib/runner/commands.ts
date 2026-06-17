import type { RunnerCommand } from 'crew-shared';
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
 * - `reap` → stop tracking an orphan terminal without signalling (idempotent;
 *   `applied` even when nothing is tracked — the process is already gone).
 * - `dequeue` / `pause` / `resume` / `message` → `failed` "not yet supported":
 *   `dequeue` needs a daemon action-drop route (out of the host runner's
 *   scope); `pause`/`resume`/`message` are designed-for and graduate in the
 *   CREW-248 fast-follow.
 *
 * `kill` throwing (e.g. `ESRCH` — the group already exited) is absorbed into a
 * `failed` result so a racey cancel never crashes the drain loop.
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
    case 'reap':
      // No signal — the orphan is already dead; just stop tracking it.
      if (command.agentKey) deps.registry.remove(command.agentKey);
      return { status: 'applied' };
    default:
      return {
        status: 'failed',
        error: `command kind '${command.kind}' not yet supported by the host runner`,
      };
  }
}

/**
 * Shared cancel path: resolve the tracked entry, signal its process group, and
 * either transition state (soft) or drop tracking (hard). A missing entry or a
 * null `agentKey` is a `failed` result — cancels target a live process.
 */
function signalGroup(
  command: RunnerCommand,
  deps: ApplyCommandDeps,
  signal: NodeJS.Signals,
  after: 'cancelling' | 'remove',
): ApplyResult {
  if (!command.agentKey) {
    return { status: 'failed', error: `cancel command ${command.id} has no agentKey` };
  }
  const proc = deps.registry.get(command.agentKey);
  if (!proc) {
    return { status: 'failed', error: `no tracked process for ${command.agentKey}` };
  }
  try {
    deps.kill(-proc.pgid, signal);
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }
  if (after === 'cancelling') deps.registry.setState(command.agentKey, 'cancelling');
  else deps.registry.remove(command.agentKey);
  return { status: 'applied' };
}
