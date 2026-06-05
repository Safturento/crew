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
export function runnerPaths(env: NodeJS.ProcessEnv | Record<string, string | undefined>): RunnerPaths {
  const configDir = env.CREW_CONFIG_DIR ?? join(homedir(), '.config', 'crew');
  const logDir = env.CREW_RUNNER_LOG_DIR ?? join(homedir(), '.crew', 'runner');
  return {
    pidFile: join(configDir, 'runner.pid'),
    logDir,
    logFile: join(logDir, 'runner.log'),
  };
}
