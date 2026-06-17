import type { LiveProcess, LiveProcessState, RunnerSnapshot } from 'crew-shared';

/**
 * In-memory record of the agent subprocesses this runner has spawned and is
 * currently supervising, keyed by `agentKey` (the ticket key). The loop
 * serializes it to a {@link RunnerSnapshot} on each heartbeat so the daemon
 * can mirror the live-process list; ended processes are `remove`d and drop
 * out of the next snapshot.
 *
 * State lives only in this process — a runner restart starts empty, which is
 * correct: the snapshot is the *current* truth, and "recently ended" history
 * is reconstructed daemon-side from the `runs` table, not here.
 */
export class Registry {
  private readonly procs = new Map<string, LiveProcess>();

  /** Track a freshly-spawned process. Re-adding a key replaces the entry. */
  add(proc: LiveProcess): void {
    this.procs.set(proc.agentKey, proc);
  }

  /** Stop tracking a process (it ended / was force-killed / reaped). Idempotent. */
  remove(agentKey: string): void {
    this.procs.delete(agentKey);
  }

  /** The currently-tracked entry for a key, or undefined when not tracked. */
  get(agentKey: string): LiveProcess | undefined {
    return this.procs.get(agentKey);
  }

  /** Transition a tracked entry's state (e.g. running → cancelling). No-op when absent. */
  setState(agentKey: string, state: LiveProcessState): void {
    const proc = this.procs.get(agentKey);
    if (proc) this.procs.set(agentKey, { ...proc, state });
  }

  /** Serialize the current live-process set for the heartbeat snapshot. */
  toSnapshot(): RunnerSnapshot {
    return { processes: [...this.procs.values()] };
  }
}
