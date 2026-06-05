import { Command } from 'commander';
import { execa } from 'execa';
import pc from 'picocolors';

export interface UpDeps {
  /** Run a command in the current directory; rejects on non-zero exit. */
  exec: (file: string, args: string[]) => Promise<unknown>;
  log: (msg: string) => void;
}

/**
 * `crew up` — convenience wrapper: bring the docker compose stack up detached,
 * then start the host runner. Plain `docker compose up` stays standalone (it
 * never requires a runner); this is just the one-liner for "stack + runner".
 */
export async function runUp(deps: UpDeps): Promise<void> {
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
    });
  });
