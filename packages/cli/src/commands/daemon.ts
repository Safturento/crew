import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startDaemon } from 'crew-daemon';

// daemon.ts lives at packages/cli/src/commands/daemon.ts; bin/crew is at
// packages/cli/bin/crew. Resolve via import.meta.url so the path works
// whether the CLI is run from the workspace root or symlinked.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CREW_BIN = resolve(__dirname, '..', '..', 'bin', 'crew');

function defaultConfigDir(): string {
  return process.env.CREW_CONFIG_DIR ?? join(homedir(), '.config', 'crew');
}

function defaultPidFile(): string {
  return process.env.CREW_PID_FILE ?? join(defaultConfigDir(), 'daemon.pid');
}

function defaultLogFile(): string {
  return process.env.CREW_LOG_FILE ?? join(defaultConfigDir(), 'daemon.log');
}

function defaultPort(): number {
  return Number(process.env.CREW_PORT ?? 7773);
}

export function readPid(path: string): number | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) {
    unlinkSync(path);
    return null;
  }
  return pid;
}

export function writePid(path: string, pid: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, String(pid), 'utf8');
}

export function removePid(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by a different user.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function runServe(): Promise<void> {
  await startDaemon(process.env);
}

function runStart(): void {
  const pidFile = defaultPidFile();
  const logFile = defaultLogFile();
  const port = defaultPort();

  const existingPid = readPid(pidFile);
  if (existingPid && isProcessAlive(existingPid)) {
    console.log(`crew daemon already running (pid ${existingPid})`);
    return;
  }

  mkdirSync(dirname(logFile), { recursive: true });
  const logFd = openSync(logFile, 'a');
  const child = spawn(CREW_BIN, ['daemon', 'serve'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });
  child.unref();
  if (!child.pid) {
    console.error('failed to spawn daemon');
    process.exitCode = 1;
    return;
  }
  writePid(pidFile, child.pid);
  console.log(`crew daemon started (pid ${child.pid}, port ${port})`);
  console.log(`logs: ${logFile}`);
}

function runStop(): void {
  const pidFile = defaultPidFile();
  const pid = readPid(pidFile);
  if (!pid) {
    console.log('crew daemon not running');
    return;
  }
  if (!isProcessAlive(pid)) {
    console.log(`crew daemon not running (stale pidfile, pid ${pid}) — cleaning up`);
    removePid(pidFile);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    console.error(`failed to signal pid ${pid}:`, (err as Error).message);
    process.exitCode = 1;
    return;
  }
  removePid(pidFile);
  console.log(`crew daemon stopped (pid ${pid})`);
}

function runStatus(): void {
  const pidFile = defaultPidFile();
  const port = defaultPort();
  const pid = readPid(pidFile);
  if (!pid) {
    console.log('crew daemon: stopped');
    return;
  }
  if (!isProcessAlive(pid)) {
    console.log(`crew daemon: stale pidfile (pid ${pid}) — cleaning up`);
    removePid(pidFile);
    return;
  }
  console.log(`crew daemon: running (pid ${pid}, port ${port})`);
}

export const daemonCommand = new Command('daemon').description(
  'start, stop, or inspect the crew daemon',
);

daemonCommand
  .command('serve')
  .description('run the daemon in the foreground (used by `start`)')
  .action(async () => {
    await runServe();
  });

daemonCommand.command('start').description('start the daemon detached').action(runStart);
daemonCommand.command('stop').description('stop the daemon').action(runStop);
daemonCommand.command('status').description('show daemon status').action(runStatus);
