import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

import { startupEventsFilePath } from '../startup-events/writer.js';

/**
 * CREW-308 — the operator-facing reason a `crew run` was reaped, read from its
 * startup-events log (`~/.crew/startup/<key>.jsonl`). Returns the `summary` of
 * the most-recent `failed` startup phase, or `null` when there is none (the log
 * is absent, or the run died without a `failed` phase).
 *
 * The runner heartbeat enriches its reap line with this so a preflight-gate
 * death surfaces its cause in the supervisor management log
 * (`reaped 1 dead process(es): HAI-12 — startup failed: worktree already exists`)
 * instead of a bare key. Best-effort + synchronous: it runs inside the
 * heartbeat tick, and a read/parse failure degrades to the bare form.
 */
export function reapReason(key: string, home: string = homedir()): string | null {
  let content: string;
  try {
    content = readFileSync(startupEventsFilePath(key, home), 'utf8');
  } catch {
    return null;
  }
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    let event: { status?: unknown; summary?: unknown };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.status === 'failed') {
      return typeof event.summary === 'string' && event.summary.length > 0 ? event.summary : null;
    }
  }
  return null;
}
