import { Command } from 'commander';
import { execa } from 'execa';
import pc from 'picocolors';

export interface DownDeps {
  /** Run a command in the current directory; rejects on non-zero exit. */
  exec: (file: string, args: string[]) => Promise<unknown>;
  log: (msg: string) => void;
}

/**
 * `crew down` — convenience wrapper: stop the host runner, then tear the docker
 * compose stack down. Inverse of {@link runUp}; runner first so it isn't
 * orphaned polling a daemon that's about to vanish.
 */
export async function runDown(deps: DownDeps): Promise<void> {
  deps.log('crew runner stop');
  await deps.exec('crew', ['runner', 'stop']);
  deps.log('docker compose down');
  await deps.exec('docker', ['compose', 'down']);
}

export const downCommand = new Command('down')
  .description('crew runner stop + docker compose down')
  .action(async () => {
    await runDown({
      exec: (file, args) => execa(file, args, { stdio: 'inherit' }),
      log: (msg) => console.log(pc.cyan('→'), msg),
    });
  });
