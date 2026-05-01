import { execa, type ResultPromise } from 'execa';
import { createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SpawnClaudeResumeOptions {
  sessionId: string;
  prompt: string;
  logFile: string;
  /**
   * Working directory the spawned `claude` runs in. Required because claude
   * derives its project directory (and thus where to look up `--resume`
   * sessions) from cwd — letting it inherit the parent shell's cwd causes
   * "No conversation found" when fix-pr is invoked from outside the worktree.
   */
  cwd: string;
  /**
   * Extra env vars to merge on top of `process.env`. PATH is always
   * augmented with `~/.local/bin` after this merge, so callers cannot
   * override the helper's PATH handling.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * Spawn `claude --dangerously-skip-permissions --resume <id> -p <prompt>`
 * in the background, piping all stdio to `logFile`. Returns the execa
 * subprocess so the caller can `await` it for completion or wire signal
 * handling (SIGINT) to it.
 *
 * Prepends `~/.local/bin` to PATH if missing — claude is commonly
 * installed there and a non-interactive shell may not have it.
 */
export function spawnClaudeResume(opts: SpawnClaudeResumeOptions): ResultPromise {
  const sub = execa(
    'claude',
    ['--dangerously-skip-permissions', '--resume', opts.sessionId, '-p', opts.prompt],
    {
      cwd: opts.cwd,
      env: {
        ...process.env,
        ...(opts.env ?? {}),
        PATH: ensureLocalBinOnPath(process.env.PATH),
      },
    },
  );
  const log = createWriteStream(opts.logFile);
  sub.stdout?.pipe(log);
  sub.stderr?.pipe(log);
  return sub;
}

export interface SpawnClaudeFreshOptions {
  prompt: string;
  logFile: string;
  /** Working directory the spawned claude runs in. */
  cwd: string;
  /** Extra env vars to merge on top of process.env. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Spawn `claude --dangerously-skip-permissions -p <prompt>` (no
 * `--resume`) so claude starts a fresh conversation. Sibling of
 * `spawnClaudeResume`; identical PATH augmentation + env merge.
 */
export function spawnClaudeFresh(opts: SpawnClaudeFreshOptions): ResultPromise {
  const sub = execa('claude', ['--dangerously-skip-permissions', '-p', opts.prompt], {
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...(opts.env ?? {}),
      PATH: ensureLocalBinOnPath(process.env.PATH),
    },
  });
  const log = createWriteStream(opts.logFile);
  sub.stdout?.pipe(log);
  sub.stderr?.pipe(log);
  return sub;
}

function ensureLocalBinOnPath(currentPath: string | undefined): string {
  const localBin = join(homedir(), '.local', 'bin');
  const segments = (currentPath ?? '').split(':').filter(Boolean);
  if (segments.includes(localBin)) return currentPath ?? '';
  return [localBin, ...segments].join(':');
}
