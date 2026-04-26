import { execa, type ResultPromise } from 'execa';
import { createWriteStream } from 'node:fs';

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
 */
export function spawnClaudeResume(opts: SpawnClaudeResumeOptions): ResultPromise {
  const sub = execa('claude', [
    '--dangerously-skip-permissions',
    '--resume',
    opts.sessionId,
    '-p',
    opts.prompt,
  ]);
  const log = createWriteStream(opts.logFile);
  sub.stdout?.pipe(log);
  sub.stderr?.pipe(log);
  return sub;
}
