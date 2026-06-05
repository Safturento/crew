import { accessSync, constants, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface RunnerPaths {
  /** Supervisor PID file: `~/.config/crew/runner.pid`. */
  pidFile: string;
  /** Directory holding `runner.log` (mounted into the daemon read-only). */
  logDir: string;
  /** `<logDir>/runner.log` — the file the worker appends to and the daemon tails. */
  logFile: string;
}

/**
 * Resolve runner filesystem paths from the environment. The log dir mirrors the
 * daemon's `CREW_RUNNER_LOG_DIR` default (`~/.crew/runner`) so the file the
 * worker writes is the same one `GET /api/runner/logs` tails through the
 * docker mount.
 */
export function runnerPaths(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): RunnerPaths {
  const configDir = env.CREW_CONFIG_DIR ?? join(homedir(), '.config', 'crew');
  const logDir = env.CREW_RUNNER_LOG_DIR ?? join(homedir(), '.crew', 'runner');
  return {
    pidFile: join(configDir, 'runner.pid'),
    logDir,
    logFile: join(logDir, 'runner.log'),
  };
}

/** Injected fs boundaries for {@link ensureRunnerLogDir} (test seam). */
export interface EnsureLogDirDeps {
  /** Create the dir (recursively). May throw — the caller recovers. */
  mkdir: (dir: string) => void;
  /** True when the current user can write into the dir. */
  isWritable: (dir: string) => boolean;
}

const defaultEnsureLogDirDeps: EnsureLogDirDeps = {
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

export interface EnsureLogDirResult {
  /** The resolved runner log dir. */
  dir: string;
  /** True when the dir exists and is writable by the current user. */
  writable: boolean;
}

/**
 * Ensure `~/.crew/runner` exists host-side, owned by the invoking user, before
 * anything writes `runner.log`.
 *
 * Docker auto-creates a missing bind-mount source as the container user
 * (`nobody`), so if `docker compose up` runs before this dir exists the host
 * runner can't write its log (EACCES). Creating it here first means compose
 * mounts an already-present, user-owned directory. When the dir already exists
 * but isn't writable (the damage is already done — Docker won this race), the
 * returned `writable` is false so the caller can surface a chown remediation
 * instead of a raw EACCES stack.
 */
export function ensureRunnerLogDir(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  deps: EnsureLogDirDeps = defaultEnsureLogDirDeps,
): EnsureLogDirResult {
  const { logDir } = runnerPaths(env);
  try {
    deps.mkdir(logDir);
  } catch {
    // A pre-existing dir owned by another user makes mkdir throw; the
    // writability probe below is the real signal and yields a remediation.
  }
  return { dir: logDir, writable: deps.isWritable(logDir) };
}
