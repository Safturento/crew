import { statSync, openSync, readSync, closeSync } from 'node:fs';

export interface TailOptions {
  transcriptPath: string;
  /** When this resolves, the tail loop exits after one final flush. */
  until: Promise<unknown>;
  onLine: (line: string) => void;
  /** Poll interval in milliseconds (default 250ms). */
  pollMs?: number;
}

/**
 * Poll-based equivalent of `tail -n 0 -F --pid=PID`. Skips any pre-existing
 * content, then emits each newline-terminated line of new content via
 * `onLine` until `until` resolves. After `until` resolves, performs one
 * final read so a terminal flush isn't lost.
 */
export async function tailTranscript(opts: TailOptions): Promise<void> {
  const pollMs = opts.pollMs ?? 250;
  let pos = currentSize(opts.transcriptPath);
  let leftover = '';
  let done = false;
  // Set done on either resolve OR reject so a crashing subprocess (or any
  // rejected `until`) doesn't strand the polling loop.
  void Promise.resolve(opts.until)
    .catch(() => {})
    .finally(() => {
      done = true;
    });

  const drain = (): void => {
    const next = readNewBytes(opts.transcriptPath, pos);
    if (!next) return;
    pos += next.length;
    const text = leftover + next.toString('utf8');
    const parts = text.split('\n');
    leftover = parts.pop() ?? '';
    for (const line of parts) {
      if (line.length > 0) opts.onLine(line);
    }
  };

  while (!done) {
    await delay(pollMs);
    drain();
  }
  drain();
  if (leftover.length > 0) {
    opts.onLine(leftover);
    leftover = '';
  }
}

function readNewBytes(path: string, from: number): Buffer | null {
  const size = currentSize(path);
  if (size <= from) return null;
  const length = size - from;
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, from);
    return buf;
  } finally {
    closeSync(fd);
  }
}

function currentSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
