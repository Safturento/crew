import type { ActionRequest } from 'crew-shared';
import type { CrewDaemonClient } from '../daemon-client/index.js';
import type { ExecutionResult } from './executor.js';

/** The daemon surface a single poll iteration needs. */
type ClaimReportClient = Pick<CrewDaemonClient, 'claimPendingAction' | 'reportActionResult'>;

export interface RunnerLoopDeps {
  client: ClaimReportClient;
  /** Bound {@link executeAction} — claimed action → host-side launch outcome. */
  execute: (action: ActionRequest) => Promise<ExecutionResult>;
  /** Structured log sink — one line per lifecycle event (to runner.log). */
  log: (line: string) => void;
  /** How long the claim long-poll holds open before returning idle. */
  timeoutMs?: number;
}

/** Outcome of one poll iteration, surfaced so the loop can decide on backoff. */
export type PollOutcome = 'idle' | 'launched' | 'failed' | 'poll_error';

/**
 * One claim→execute→report cycle. Long-polls for a pending action; on a claim,
 * reports `launching`, shells the verb via `execute`, then reports the terminal
 * `launched`/`failed` with any error. A null claim is `idle` (re-poll); a claim
 * transport error is `poll_error` (the loop backs off before re-polling).
 */
export async function runOnce(deps: RunnerLoopDeps): Promise<PollOutcome> {
  const claim = await deps.client.claimPendingAction(deps.timeoutMs);
  if (!('action' in claim)) {
    deps.log(`poll error: ${claim.reason}`);
    return 'poll_error';
  }
  if (claim.action === null) return 'idle';

  const action = claim.action;
  try {
    deps.log(
      `claimed action ${action.id} (${action.kind} ${action.ticketKey} @ ${action.project})`,
    );
    await deps.client.reportActionResult(action.id, 'launching');

    const result = await deps.execute(action);
    if (result.status === 'launched') {
      await deps.client.reportActionResult(action.id, 'launched');
      deps.log(`launched action ${action.id} (${action.kind} ${action.ticketKey})`);
      return 'launched';
    }

    await deps.client.reportActionResult(action.id, 'failed', result.error);
    deps.log(`failed action ${action.id} (${action.kind} ${action.ticketKey}): ${result.error}`);
    return 'failed';
  } catch (err) {
    // Defensive: nothing in the happy path is expected to throw (the client
    // is never-throws and executeAction catches), but the loop runs under a
    // crash-respawning supervisor — so absorb an unexpected throw into a
    // backoff-and-retry rather than killing the worker and churning respawns.
    deps.log(`iteration error on action ${action.id}: ${(err as Error).message}`);
    return 'poll_error';
  }
}

export interface RunLoopDeps extends RunnerLoopDeps {
  client: ClaimReportClient & Pick<CrewDaemonClient, 'heartbeat'>;
  /** Aborting this signal stops the loop after the in-flight iteration. */
  signal: AbortSignal;
  /**
   * Heartbeat cadence; fires once immediately on start. Default 5s — the
   * daemon's runner-staleness window is 15s, so 5s gives a 3× margin where a
   * single dropped heartbeat can't flap the dashboard chip offline.
   */
  heartbeatMs?: number;
  /** Delay after a poll error before re-polling, so a downed daemon doesn't busy-spin. Default 2s. */
  errorBackoffMs?: number;
  /** Injectable sleep (abortable in production); defaults to a timer. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Start a heartbeat that pings the daemon immediately and then every
 * `intervalMs`, until `signal` aborts. Returns a stop fn (idempotent).
 */
function startHeartbeat(
  client: Pick<CrewDaemonClient, 'heartbeat'>,
  intervalMs: number,
  signal: AbortSignal,
): () => void {
  void client.heartbeat();
  const timer = setInterval(() => void client.heartbeat(), intervalMs);
  const stop = (): void => clearInterval(timer);
  signal.addEventListener('abort', stop, { once: true });
  return stop;
}

/**
 * The runner's main loop: heartbeat on an interval while repeatedly draining
 * the action queue via {@link runOnce}. Idle iterations re-poll immediately (the
 * long-poll itself paces them); a transport error backs off first. Exits cleanly
 * once `signal` aborts.
 */
export async function runLoop(deps: RunLoopDeps): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  const stopHeartbeat = startHeartbeat(deps.client, deps.heartbeatMs ?? 5_000, deps.signal);
  try {
    while (!deps.signal.aborted) {
      const outcome = await runOnce(deps);
      if (outcome === 'poll_error' && !deps.signal.aborted) {
        await sleep(deps.errorBackoffMs ?? 2_000);
      }
    }
  } finally {
    stopHeartbeat();
  }
}
