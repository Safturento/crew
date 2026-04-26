import { existsSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import type { TranscriptEvent } from './types.js';

export interface TailOptions {
  signal?: AbortSignal;
  pollMs?: number;
  /**
   * When true, skip any content already in the file at the moment tailing
   * starts and only yield events appended afterwards. Use this for resumed
   * Claude sessions where the prior history shouldn't be replayed.
   */
  startAtEnd?: boolean;
}

/**
 * Yield TranscriptEvent values as they appear in `path`, in append order,
 * including events already present when tailing starts. Polls for changes
 * every `pollMs` (default 200ms) and survives the file not yet existing.
 * Stops cleanly when `signal` is aborted.
 */
export async function* tailTranscript(
  path: string,
  opts: TailOptions = {},
): AsyncGenerator<TranscriptEvent> {
  const pollMs = opts.pollMs ?? 200;
  let position = opts.startAtEnd && existsSync(path) ? statSync(path).size : 0;
  let buffer = '';

  // Read-first-then-check-abort: guarantees one final drain pass after the
  // signal aborts so trailing lines written just before claude exit are not
  // dropped.
  while (true) {
    if (existsSync(path)) {
      const handle = await open(path, 'r');
      try {
        const stat = await handle.stat();
        if (stat.size < position) {
          position = 0;
          buffer = '';
        }
        if (stat.size > position) {
          const len = stat.size - position;
          const buf = Buffer.alloc(len);
          await handle.read(buf, 0, len, position);
          position = stat.size;
          buffer += buf.toString('utf8');

          let nl = buffer.indexOf('\n');
          while (nl !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) {
              try {
                yield JSON.parse(line) as TranscriptEvent;
              } catch {
                // skip malformed lines
              }
            }
            nl = buffer.indexOf('\n');
          }
        }
      } finally {
        await handle.close();
      }
    }

    if (opts.signal?.aborted) return;
    await delay(pollMs);
  }
}
