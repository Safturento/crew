import { createWriteStream } from 'node:fs';
import { execa } from 'execa';
import { dockerLogPathFor } from '../run/paths.js';

export interface EnsureStackRunningOptions {
  worktree: string;
  key: string;
  env: NodeJS.ProcessEnv;
}

export interface EnsureStackRunningResult {
  rc: number;
  logPath: string;
}

/**
 * Foreground/blocking idempotent docker bringup for resume scenarios. Runs
 * `docker compose up -d` (no `--build`, no db-clone, no stop), captures output
 * to /tmp/crew-docker-<key>.log, and returns the rc without throwing — the
 * caller decides how to handle a non-zero result. Distinct from the run.ts
 * fresh-mode bringup, which builds, optionally clones data from the canonical
 * worktree, and may stop the stack after.
 */
export async function ensureStackRunning(
  opts: EnsureStackRunningOptions,
): Promise<EnsureStackRunningResult> {
  const logPath = dockerLogPathFor(opts.key);
  const stream = createWriteStream(logPath, { flags: 'w' });

  const proc = execa('docker', ['compose', 'up', '-d'], {
    cwd: opts.worktree,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: opts.env,
    reject: false,
  });

  proc.stdout?.pipe(stream);
  proc.stderr?.pipe(stream);

  const result = await proc;
  stream.end();

  return {
    rc: typeof result.exitCode === 'number' ? result.exitCode : 1,
    logPath,
  };
}
