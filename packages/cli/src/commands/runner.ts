import { Command } from 'commander';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import pc from 'picocolors';
import {
  crewDaemonClientFromEnv,
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

/** `process.kill(pid, 0)` liveness probe. EPERM means alive-but-not-ours. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
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
    spawnDetached: () => spawnSupervisor(env, paths.logFile, paths.logDir),
    log: (m) => console.log(pc.green('✓'), m),
  });
  if (result.alreadyRunning) {
    console.log(pc.yellow('!'), `runner already running (pid ${result.pid})`);
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

async function statusAction(env: Env = process.env): Promise<void> {
  const paths = runnerPaths(env);
  const client = crewDaemonClientFromEnv(env);
  const report = await runnerStatus({
    readPid: () => readPidFile(paths.pidFile),
    isAlive: isProcessAlive,
    // Read-only reachability probe — GET /api/runner/status doesn't record a
    // heartbeat, so checking status never falsely flips the runner online.
    checkDaemon: async () => {
      try {
        const res = await fetch(`${client.baseUrl}/api/runner/status`);
        return res.ok;
      } catch {
        return false;
      }
    },
  });
  console.log(
    report.running
      ? pc.green(`✓ runner running (pid ${report.pid})`)
      : pc.yellow('! runner not running'),
  );
  console.log(
    report.daemonReachable ? pc.green('✓ daemon reachable') : pc.yellow('! daemon unreachable'),
  );
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

/** The foreground long-poll worker process. */
async function workerAction(env: Env = process.env): Promise<void> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  process.on('SIGTERM', abort);
  process.on('SIGINT', abort);
  await runWorker({
    env,
    signal: controller.signal,
    log: (line) => process.stdout.write(formatLogLine(line)),
  });
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
