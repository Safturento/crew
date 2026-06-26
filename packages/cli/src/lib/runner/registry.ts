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

  /**
   * Liveness sweep: drop every tracked entry whose pid the injected probe
   * reports dead, returning the reaped agentKeys (for logging). Defense in
   * depth against phantom "running" entries — a `crew run` child that ends
   * without a terminal {@link remove} (early death, crash, OOM-kill) would
   * otherwise linger in the snapshot until the runner restarts. Distinct from
   * the daemon-driven `reap` command, which untracks one named orphan.
   *
   * `paused` entries are **exempt**: a paused `crew run` process exits (it
   * `process.exit`s on the pause path), so its pid is legitimately dead — but
   * the entry is deliberately kept tracked (CREW-273) as a resumable handle for
   * a later `resume`/`message` command. Reaping it would destroy that, so the
   * sweep skips paused state. Every other state with a dead pid is a genuine
   * reap target (`cancelling` that has finished exiting included).
   */
  reapDead(isAlive: (pid: number) => boolean): string[] {
    const reaped: string[] = [];
    for (const [key, proc] of this.procs) {
      if (proc.state === 'paused') continue;
      if (!isAlive(proc.pid)) {
        this.procs.delete(key);
        reaped.push(key);
      }
    }
    return reaped;
  }

  /** Serialize the current live-process set for the heartbeat snapshot. */
  toSnapshot(): RunnerSnapshot {
    return { processes: [...this.procs.values()] };
  }
}
