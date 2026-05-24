import type { StartupPhaseSubtype } from 'crew-shared';

import { emitStartupEvent, type EmitOptions } from './writer.js';

export interface BracketStartupPhaseSpec<T> {
  subtype: StartupPhaseSubtype;
  /** Summary on the `started` event ("npm ci begun"). */
  startedSummary: string;
  /** Summary on the `completed` event, given the work's resolved value. */
  completedSummary: (result: T) => string;
  /** Optional logPath on the `completed` event. May be a static string
   *  or derived from the work's result. */
  completedLogPath?: string | ((result: T) => string | undefined);
  /** Optional logPath on the `failed` event. Static string. */
  failedLogPath?: string;
}

/**
 * Bracket a startup phase with `started` / `completed` / `failed`
 * events written to `~/.crew/startup/<key>.jsonl`. Re-throws the work's
 * error after recording the failed event so existing dispatch failure
 * semantics are preserved.
 */
export async function bracketStartupPhase<T>(
  key: string,
  spec: BracketStartupPhaseSpec<T>,
  work: () => Promise<T>,
  opts: EmitOptions = {},
): Promise<T> {
  const t0 = Date.now();
  await emitStartupEvent(
    key,
    {
      type: 'system',
      subtype: spec.subtype,
      status: 'started',
      timestamp: new Date().toISOString(),
      summary: spec.startedSummary,
    },
    opts,
  );

  try {
    const result = await work();
    const logPath =
      typeof spec.completedLogPath === 'function'
        ? spec.completedLogPath(result)
        : spec.completedLogPath;
    await emitStartupEvent(
      key,
      {
        type: 'system',
        subtype: spec.subtype,
        status: 'completed',
        timestamp: new Date().toISOString(),
        summary: spec.completedSummary(result),
        durationMs: Date.now() - t0,
        ...(logPath ? { logPath } : {}),
      },
      opts,
    );
    return result;
  } catch (err) {
    await emitStartupEvent(
      key,
      {
        type: 'system',
        subtype: spec.subtype,
        status: 'failed',
        timestamp: new Date().toISOString(),
        summary: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
        ...(spec.failedLogPath ? { logPath: spec.failedLogPath } : {}),
      },
      opts,
    );
    throw err;
  }
}
