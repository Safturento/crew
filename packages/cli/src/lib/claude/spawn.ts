import { execa, type ResultPromise } from 'execa';
import { createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SpawnClaudeResumeOptions {
  sessionId: string;
  prompt: string;
  logFile: string;
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
    { env: { ...process.env, PATH: ensureLocalBinOnPath(process.env.PATH) } },
  );
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
