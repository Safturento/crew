import { appendFileSync, mkdirSync } from 'node:fs';
import { execa } from 'execa';
import { loadProjectConfigByName } from 'crew-shared';
import { crewDaemonClientFromEnv } from '../daemon-client/index.js';
import { executeAction } from './executor.js';
import { runLoop } from './loop.js';
import { runnerPaths } from './paths.js';

/** Format one runner.log line: ISO timestamp prefix, newline-terminated. */
export function formatLogLine(msg: string, now: Date = new Date()): string {
  return `[${now.toISOString()}] ${msg}\n`;
}

/** Resolve a project slug to its repo path via the on-disk crew config. */
export function resolveRepoDir(project: string): string {
  return loadProjectConfigByName(project).repo_path;
}

/** Run a short command to completion in `cwd` (rejects on non-zero exit). */
function runToCompletion(file: string, args: string[], opts: { cwd: string }): Promise<unknown> {
  return execa(file, args, { cwd: opts.cwd });
}

/**
 * Launch a long-running agent verb detached and resolve the moment it spawns
 * (not when the minutes-long run finishes). Rejects if the spawn itself fails
 * — e.g. `crew` not on PATH — so the runner reports `failed`.
 */
function launchDetached(file: string, args: string[], opts: { cwd: string }): Promise<unknown> {
  const child = execa(file, args, { cwd: opts.cwd, detached: true, stdio: 'ignore' });
  // We don't track the detached run's completion; swallow its eventual
  // settle so a later non-zero exit can't surface as an unhandledRejection.
  child.catch(() => {});
  child.unref();
  return new Promise((resolve, reject) => {
    child.once('spawn', () => resolve(undefined));
    child.once('error', (err) => reject(err));
  });
}

export interface WorkerDeps {
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** Aborting this stops the loop after the in-flight iteration. */
  signal: AbortSignal;
  /** Override the log sink (tests); defaults to appending runner.log. */
  log?: (line: string) => void;
}

/**
 * The runner worker: long-poll the daemon's action queue and shell each claimed
 * verb in its project repo, until `signal` aborts. Glue over the tested
 * units — daemon client, {@link executeAction}, {@link runLoop} — with the
 * real execa boundaries. `crew run`/`fix-pr`/`finish` launch detached (they
 * outlive a single iteration); `gh pr comment` runs to completion first.
 */
export async function runWorker(deps: WorkerDeps): Promise<void> {
  const paths = runnerPaths(deps.env);
  // The supervised path (`crew runner __worker`) overrides `log` to write to
  // stdout, which the supervisor has already redirected to runner.log — so
  // this file-append default is only for a standalone/test invocation. Don't
  // rely on both being active at once (two fds → interleaved writes).
  const log =
    deps.log ??
    ((line: string): void => {
      mkdirSync(paths.logDir, { recursive: true });
      appendFileSync(paths.logFile, formatLogLine(line));
    });

  await runLoop({
    client: crewDaemonClientFromEnv(deps.env),
    execute: (action) =>
      executeAction(action, { exec: runToCompletion, launch: launchDetached, resolveRepoDir }),
    log,
    signal: deps.signal,
  });
}
