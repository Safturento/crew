import { Command } from 'commander';
import { execa } from 'execa';
import pc from 'picocolors';
import { ensureRunnerLogDir } from '../lib/index.js';

export interface UpDeps {
  /** Run a command in the current directory; rejects on non-zero exit. */
  exec: (file: string, args: string[]) => Promise<unknown>;
  log: (msg: string) => void;
  /**
   * Pre-create the host runner log dir (user-owned) before compose mounts it.
   * Must run before `docker compose up` — see {@link ensureRunnerLogDir}.
   */
  ensureRunnerDir: () => void;
}

/**
 * `crew up` — convenience wrapper: bring the docker compose stack up detached,
 * then start the host runner. Plain `docker compose up` stays standalone (it
 * never requires a runner); this is just the one-liner for "stack + runner".
 *
 * `~/.crew/runner` is created first: Docker fabricates a missing bind-mount
 * source as `nobody`, so letting `docker compose up` run before the dir exists
 * leaves the host runner unable to write `runner.log` (EACCES).
 */
export async function runUp(deps: UpDeps): Promise<void> {
  deps.ensureRunnerDir();
  deps.log('docker compose up -d');
  await deps.exec('docker', ['compose', 'up', '-d']);
  deps.log('crew runner start');
  await deps.exec('crew', ['runner', 'start']);
}

export const upCommand = new Command('up')
  .description('docker compose up -d + crew runner start')
  .action(async () => {
    await runUp({
      exec: (file, args) => execa(file, args, { stdio: 'inherit' }),
      log: (msg) => console.log(pc.cyan('→'), msg),
      ensureRunnerDir: () => {
        const { dir, writable } = ensureRunnerLogDir(process.env);
        if (!writable) {
          console.warn(
            pc.yellow('!'),
            `runner log dir ${dir} is not writable; runner start may fail with EACCES.\n` +
              `  Fix ownership with: sudo chown -R "$(id -u):$(id -g)" ${dir}`,
          );
        }
      },
    });
  });
