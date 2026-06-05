/**
 * Runner lifecycle orchestration. The functions here are pure over injected
 * process/fs boundaries (`readPid`, `spawnDetached`, `kill`, …) so the
 * start/stop/status/respawn logic is unit-tested without touching the host.
 * The `crew runner` command wires the real boundaries (child_process, fs,
 * process.kill, the daemon client).
 *
 * Two process layers: `crew runner start` spawns a detached **supervisor**
 * (`runSupervisor`) whose pid lands in the pidfile; the supervisor spawns the
 * long-poll **worker** as a child and respawns it on a crash. Killing the
 * supervisor (stop) tears the whole tree down.
 */

export interface StartDeps {
  /** Current pid from the pidfile, or null when absent/garbage. */
  readPid: () => number | null;
  writePid: (pid: number) => void;
  /** `process.kill(pid, 0)` liveness probe — true when the pid is alive. */
  isAlive: (pid: number) => boolean;
  /** Spawn the detached supervisor process; returns its pid. */
  spawnDetached: () => number;
  log: (msg: string) => void;
}

export interface StartResult {
  started: boolean;
  pid: number;
  alreadyRunning: boolean;
}

/**
 * Start the runner if not already up. A live pidfile is respected (no-op); a
 * stale one (dead pid) is replaced by spawning fresh.
 */
export function startRunner(deps: StartDeps): StartResult {
  const existing = deps.readPid();
  if (existing !== null && deps.isAlive(existing)) {
    deps.log(`runner already running (pid ${existing})`);
    return { started: false, pid: existing, alreadyRunning: true };
  }
  if (existing !== null) deps.log(`stale pidfile (pid ${existing} dead); respawning`);
  const pid = deps.spawnDetached();
  if (pid <= 0) {
    // Spawn failed to yield a usable pid. Never record it — a 0/-1 pidfile is
    // dangerous (`process.kill(-1, …)` signals every process we may signal).
    deps.log(`runner failed to start (no pid)`);
    return { started: false, pid, alreadyRunning: false };
  }
  deps.writePid(pid);
  deps.log(`runner started (pid ${pid})`);
  return { started: true, pid, alreadyRunning: false };
}

export interface StopDeps {
  readPid: () => number | null;
  isAlive: (pid: number) => boolean;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  removePid: () => void;
  log: (msg: string) => void;
}

export interface StopResult {
  stopped: boolean;
  reason?: 'not_running';
}

/** Stop the runner: SIGTERM a live supervisor pid and clear the pidfile. */
export function stopRunner(deps: StopDeps): StopResult {
  const pid = deps.readPid();
  if (pid === null) return { stopped: false, reason: 'not_running' };
  if (deps.isAlive(pid)) {
    deps.kill(pid, 'SIGTERM');
    deps.log(`runner stopped (pid ${pid})`);
  } else {
    deps.log(`removed stale pidfile (pid ${pid})`);
  }
  deps.removePid();
  return { stopped: true };
}

export interface StatusDeps {
  readPid: () => number | null;
  isAlive: (pid: number) => boolean;
  /** Probe the daemon (heartbeat) — true when reachable. */
  checkDaemon: () => Promise<boolean>;
}

export interface RunnerStatusReport {
  running: boolean;
  pid: number | null;
  daemonReachable: boolean;
}

/** Snapshot the runner: pidfile liveness + daemon connectivity. */
export async function runnerStatus(deps: StatusDeps): Promise<RunnerStatusReport> {
  const pid = deps.readPid();
  const running = pid !== null && deps.isAlive(pid);
  const daemonReachable = await deps.checkDaemon();
  return { running, pid: running ? pid : null, daemonReachable };
}

export interface WorkerHandle {
  /** Resolves with the worker process's exit code. */
  exited: Promise<number>;
}

export interface SuperviseDeps {
  /** Spawn the foreground long-poll worker child. */
  spawnWorker: () => WorkerHandle;
  /** True once a stop was requested (SIGTERM handler set a flag). */
  shouldStop: () => boolean;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
  /** Delay before respawning a crashed worker. Default 1s. */
  respawnDelayMs?: number;
}

/**
 * Supervisor respawn loop (runs inside the detached process). Spawns the worker
 * and waits; on a crash (non-zero exit) and no stop request, respawns after a
 * short delay. A clean exit or a stop request ends the loop.
 */
export async function runSupervisor(deps: SuperviseDeps): Promise<void> {
  while (!deps.shouldStop()) {
    const worker = deps.spawnWorker();
    const code = await worker.exited;
    if (deps.shouldStop()) break;
    if (code === 0) break;
    deps.log(`worker exited ${code}; respawning`);
    await deps.sleep(deps.respawnDelayMs ?? 1_000);
  }
}
