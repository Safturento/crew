import { Command } from 'commander';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import pc from 'picocolors';
import type { LiveProcess } from 'crew-shared';
import {
  crewDaemonClientFromEnv,
  ensureRunnerLogDir,
  isProcessAlive,
  runnerPaths,
  runWorker,
  formatLogLine,
  startRunner,
  stopRunner,
  runnerStatus,
  runSupervisor,
} from '../lib/index.js';

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

/** Read a pid from the pidfile; null when absent, unreadable, or not a positive int. */
export function readPidFile(path: string): number | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
  const pid = Number.parseInt(raw, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Spawn the detached supervisor (`crew runner __supervise`) with its output
 * redirected to runner.log. We invoke the `crew` binary by name — the same
 * PATH assumption the executor already makes — so this works identically in a
 * built install and a linked dev checkout. Returns the supervisor pid.
 */
function spawnSupervisor(env: Env, logFile: string, logDir: string): number {
  mkdirSync(logDir, { recursive: true });
  const out = openSync(logFile, 'a');
  const child = spawn('crew', ['runner', '__supervise'], {
    detached: true,
    stdio: ['ignore', out, out],
    env: env as NodeJS.ProcessEnv,
  });
  child.unref();
  return child.pid ?? -1;
}

function startAction(env: Env = process.env): void {
  const paths = runnerPaths(env);
  const result = startRunner({
    readPid: () => readPidFile(paths.pidFile),
    writePid: (pid) => {
      mkdirSync(dirname(paths.pidFile), { recursive: true });
      writeFileSync(paths.pidFile, String(pid));
    },
    isAlive: isProcessAlive,
    // Create ~/.crew/runner user-owned before opening the log. Standalone
    // `crew runner start` (no `crew up`) may run after a bare `docker compose
    // up` already fabricated the dir as `nobody`; surface a chown fix then.
    ensureLogDir: () => ensureRunnerLogDir(env),
    spawnDetached: () => spawnSupervisor(env, paths.logFile, paths.logDir),
    log: (m) => console.log(pc.green('✓'), m),
  });
  if (result.alreadyRunning) {
    console.log(pc.yellow('!'), `runner already running (pid ${result.pid})`);
  } else if (result.logDirError) {
    console.error(pc.red('✗'), result.logDirError);
    process.exitCode = 1;
  } else if (!result.started) {
    console.error(pc.red('✗'), 'runner failed to start (supervisor did not spawn)');
    process.exitCode = 1;
  }
}

function stopAction(env: Env = process.env): void {
  const paths = runnerPaths(env);
  const result = stopRunner({
    readPid: () => readPidFile(paths.pidFile),
    isAlive: isProcessAlive,
    kill: (pid, signal) => process.kill(pid, signal),
    removePid: () => {
      try {
        unlinkSync(paths.pidFile);
      } catch {
        // already gone — fine
      }
    },
    log: (m) => console.log(pc.green('✓'), m),
  });
  if (!result.stopped) console.log(pc.yellow('!'), 'runner not running');
}

/** Format an elapsed span the way `crew status` does (s / m s / h m). */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
}

/**
 * Render the runner's live-process registry as a list of human lines: one row
 * per tracked subprocess (key, command, pid, state, uptime), or a single
 * "no live processes" line when nothing is running. Pure over `now` so the
 * uptime column is deterministic in tests.
 */
export function renderLiveProcesses(processes: LiveProcess[], now: Date = new Date()): string[] {
  if (processes.length === 0) return [pc.dim('  no live processes')];
  return processes.map((p) => {
    const uptime = formatDuration(now.getTime() - new Date(p.spawnedAt).getTime());
    return `  ${p.agentKey}  ${pc.cyan(p.command)}  pid ${p.pid}  ${p.state}  ${pc.dim(uptime)}`;
  });
}

async function statusAction(env: Env = process.env): Promise<void> {
  const paths = runnerPaths(env);
  const client = crewDaemonClientFromEnv(env);
  // Read-only status fetch — GET /api/runner/status doesn't record a
  // heartbeat, so rendering status never falsely flips the runner online.
  const status = await client.getRunnerStatus();
  const reachable = 'processes' in status;
  const report = await runnerStatus({
    readPid: () => readPidFile(paths.pidFile),
    isAlive: isProcessAlive,
    checkDaemon: async () => reachable,
  });
  console.log(
    report.running
      ? pc.green(`✓ runner running (pid ${report.pid})`)
      : pc.yellow('! runner not running'),
  );
  console.log(
    report.daemonReachable ? pc.green('✓ daemon reachable') : pc.yellow('! daemon unreachable'),
  );
  if (reachable) {
    const processes = status.processes;
    console.log(pc.bold(`\nlive processes (${processes.length}):`));
    for (const line of renderLiveProcesses(processes)) console.log(line);
  }
}

function logsAction(opts: { lines?: string }, env: Env = process.env): void {
  const paths = runnerPaths(env);
  const n = Number.parseInt(opts.lines ?? '200', 10);
  let content: string;
  try {
    content = readFileSync(paths.logFile, 'utf8');
  } catch {
    console.log(pc.yellow('!'), `no runner log at ${paths.logFile}`);
    return;
  }
  const lines = content.replace(/\n$/, '').split('\n');
  console.log(lines.slice(-(Number.isInteger(n) && n > 0 ? n : 200)).join('\n'));
}

/**
 * The detached supervisor process. Spawns the worker as a child and respawns it
 * on a crash via {@link runSupervisor}; a SIGTERM/SIGINT requests a clean stop
 * and tears the current worker down.
 */
async function superviseAction(env: Env = process.env): Promise<void> {
  let stop = false;
  let currentWorker: ChildProcess | null = null;
  const onSignal = (): void => {
    stop = true;
    if (currentWorker) {
      try {
        currentWorker.kill('SIGTERM');
      } catch {
        // worker already gone
      }
    }
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  await runSupervisor({
    spawnWorker: () => {
      const child = spawn('crew', ['runner', '__worker'], {
        stdio: 'inherit',
        env: env as NodeJS.ProcessEnv,
      });
      currentWorker = child;
      return {
        exited: new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 0))),
      };
    },
    shouldStop: () => stop,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (m) => console.log(m),
  });
}

/**
 * Exit code the worker uses to ask the supervisor to respawn it (CREW-293
 * `supervisor_restart`). Any non-zero code triggers the supervisor's
 * self-respawn loop; this named value documents the intent and keeps it
 * distinct from a 1 that would read as an ordinary crash.
 */
export const WORKER_RESTART_EXIT_CODE = 75;

/**
 * The foreground long-poll worker process. A SIGTERM/SIGINT or a queue-level
 * supervisor command aborts the loop; the worker then exits with a code the
 * supervisor reads: 0 (stop) ends the supervisor loop, non-zero (restart)
 * triggers its self-respawn (CREW-293).
 */
async function workerAction(env: Env = process.env): Promise<void> {
  const controller = new AbortController();
  let restartRequested = false;
  const abort = (): void => controller.abort();
  process.on('SIGTERM', abort);
  process.on('SIGINT', abort);
  await runWorker({
    env,
    signal: controller.signal,
    // Supervisor-control boundary: a drained `supervisor_stop` aborts the loop
    // for a clean (exit 0) shutdown; `supervisor_restart` also flags a non-zero
    // exit so the supervisor respawns a fresh worker. The abort fires after the
    // command's `applied` result is reported, so the queue row never sticks.
    supervisorControl: (action) => {
      if (action === 'restart') restartRequested = true;
      controller.abort();
    },
    log: (line) => process.stdout.write(formatLogLine(line)),
  });
  if (restartRequested) process.exitCode = WORKER_RESTART_EXIT_CODE;
}

export const runnerCommand = new Command('runner').description(
  'manage the host action runner (drains dashboard-triggered actions)',
);

runnerCommand
  .command('start')
  .description('start the runner (detached, auto-restarts on crash)')
  .action(() => startAction());
runnerCommand
  .command('stop')
  .description('stop the runner')
  .action(() => stopAction());
runnerCommand
  .command('restart')
  .description('restart the runner')
  .action(() => {
    stopAction();
    startAction();
  });
runnerCommand
  .command('status')
  .description('report runner liveness + daemon connectivity')
  .action(async () => {
    await statusAction();
  });
runnerCommand
  .command('logs')
  .description('print the tail of the runner log')
  .option('-n, --lines <n>', 'number of trailing lines', '200')
  .action((opts: { lines?: string }) => logsAction(opts));

const superviseCmd = new Command('__supervise').action(async () => {
  await superviseAction();
});
runnerCommand.addCommand(superviseCmd, { hidden: true });

const workerCmd = new Command('__worker').action(async () => {
  await workerAction();
});
runnerCommand.addCommand(workerCmd, { hidden: true });
