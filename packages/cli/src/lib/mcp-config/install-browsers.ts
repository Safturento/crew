import { createWriteStream } from 'node:fs';
import { execa } from 'execa';
import { playwrightLogPathFor } from '../run/paths.js';

export interface InstallBrowsersOptions {
  worktree: string;
  key: string;
  env: NodeJS.ProcessEnv;
}

export interface InstallBrowsersResult {
  rc: number;
  logPath: string;
}

export async function installPlaywrightBrowsers(
  opts: InstallBrowsersOptions,
): Promise<InstallBrowsersResult> {
  const logPath = playwrightLogPathFor(opts.key);
  const stream = createWriteStream(logPath, { flags: 'w' });

  const proc = execa('npx', ['playwright', 'install', 'chromium'], {
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
