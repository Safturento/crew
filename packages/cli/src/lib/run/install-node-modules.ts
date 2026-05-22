import { createWriteStream } from 'node:fs';
import { execa } from 'execa';
import { npmInstallLogPathFor } from './paths.js';

export interface InstallNodeModulesOptions {
  worktree: string;
  key: string;
  env: NodeJS.ProcessEnv;
}

export interface InstallNodeModulesResult {
  rc: number;
  logPath: string;
}

/**
 * Run `npm install` inside the worktree so dependent dispatch steps
 * (currently `installPlaywrightBrowsers`) can resolve project-local
 * binaries. Worktrees are bare by design; this is the targeted opt-in
 * that populates `<worktree>/node_modules` when a step needs it.
 */
export async function installNodeModules(
  opts: InstallNodeModulesOptions,
): Promise<InstallNodeModulesResult> {
  const logPath = npmInstallLogPathFor(opts.key);
  const stream = createWriteStream(logPath, { flags: 'w' });

  const proc = execa('npm', ['install'], {
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
