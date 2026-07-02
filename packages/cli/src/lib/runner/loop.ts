import type { ActionRequest } from 'crew-shared';
import type { CrewDaemonClient } from '../daemon-client/index.js';
import { applyCommand } from './commands.js';
import type { ExecutionResult, LaunchHandle } from './executor.js';
import { reapReason as defaultReapReason } from './reap-reason.js';
import type { Registry } from './registry.js';

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

/** The daemon surface one command-drain pass needs. */
type CommandClient = Pick<CrewDaemonClient, 'claimPendingCommand' | 'reportCommandResult'>;

export interface DrainCommandsDeps {
  client: CommandClient;
  /** The live-process registry the claimed command is applied against. */
  registry: Registry;
  /** Signal boundary forwarded to {@link applyCommand} (negative pid = group). */
  kill: (target: number, signal: NodeJS.Signals) => void;
  /**
   * Resume boundary forwarded to {@link applyCommand}: re-dispatch
   * `crew resume <key>` (with `-m <message>` when set) on the agent's existing
   * worktree/session. Optional — a `resume`/`message` command fails cleanly
   * when it's absent.
   */
  resume?: (agentKey: string, message?: string) => Promise<LaunchHandle>;
  /**
   * Pause-sentinel boundary forwarded to {@link applyCommand}: write the
   * CREW-273 pause marker before a `pause` SIGTERM. Optional — a pause without
   * it degrades to a terminal cancel on the `crew run` side.
   */
  writePauseSentinel?: (agentKey: string) => void;
  /**
   * Supervisor-control boundary forwarded to {@link applyCommand}: apply a
   * queue-level `supervisor_stop`/`supervisor_restart` against the runner
   * itself (CREW-293). Optional — a `supervisor_*` command fails cleanly when
   * it's absent.
   */
  supervisorControl?: (action: 'stop' | 'restart') => void;
  /** Structured log sink — one line per applied/failed command. */
  log: (line: string) => void;
}

/**
 * Claim and apply pending reverse-queue commands until the queue drains. Each
 * claimed command is applied against the registry (signalling the tracked
 * process group) and its outcome reported back to the daemon. A claim
 * transport error ends the pass (the next cycle retries) rather than throwing
 * — the worker runs under a respawning supervisor and a downed daemon must not
 * churn it.
 */
export async function drainCommands(deps: DrainCommandsDeps): Promise<void> {
  for (;;) {
    const claim = await deps.client.claimPendingCommand();
    if (!('command' in claim)) {
      deps.log(`command poll error: ${claim.reason}`);
      return;
    }
    const command = claim.command;
    if (command === null) return;

    const result = await applyCommand(command, {
      registry: deps.registry,
      kill: deps.kill,
      resume: deps.resume,
      writePauseSentinel: deps.writePauseSentinel,
      supervisorControl: deps.supervisorControl,
    });
    if (result.status === 'applied') {
      await deps.client.reportCommandResult(command.id, 'applied');
      deps.log(`applied command ${command.id} (${command.kind} ${command.agentKey ?? '-'})`);
    } else {
      await deps.client.reportCommandResult(command.id, 'failed', result.error);
      deps.log(`failed command ${command.id} (${command.kind}): ${result.error}`);
    }
  }
}

export interface RunLoopDeps extends RunnerLoopDeps {
  client: ClaimReportClient & Pick<CrewDaemonClient, 'heartbeat'> & CommandClient;
  /** The live-process registry: serialized into each heartbeat snapshot. */
  registry: Registry;
  /** Signal boundary for command apply (negative pid = process group). */
  kill: (target: number, signal: NodeJS.Signals) => void;
  /**
   * `process.kill(pid, 0)` liveness probe — true when the pid is alive. Used
   * by the heartbeat's reap sweep to drop dead tracked processes before each
   * snapshot, so an agent that died without a terminal remove (early death,
   * crash, OOM-kill) doesn't linger as a phantom "running".
   */
  isAlive: (pid: number) => boolean;
  /**
   * CREW-308: resolve a reaped key's startup-failure reason for the enriched
   * reap log line. Optional — defaults to the real startup-log reader; tests
   * inject a fake to avoid touching disk.
   */
  reapReason?: (key: string) => string | null;
  /** Resume boundary for command apply (re-dispatch `crew resume <key>`). */
  resume?: (agentKey: string, message?: string) => Promise<LaunchHandle>;
  /** Pause-sentinel boundary for command apply (CREW-273 pause marker). */
  writePauseSentinel?: (agentKey: string) => void;
  /** Supervisor-control boundary for command apply (CREW-293 stop/restart). */
  supervisorControl?: (action: 'stop' | 'restart') => void;
  /** Aborting this signal stops the loop after the in-flight iteration. */
  signal: AbortSignal;
  /**
   * Heartbeat cadence; fires once immediately on start. Default 5s — the
   * daemon's runner-staleness window is 15s, so 5s gives a 3× margin where a
   * single dropped heartbeat can't flap the dashboard chip offline.
   */
  heartbeatMs?: number;
  /**
   * Command-drain cadence; fires once immediately on start. Default 2s. Runs on
   * its own timer — **not** gated behind the action long-poll — so a queued
   * `cancel` applies within ~2s even when the action queue is idle (the action
   * `claimPendingAction` poll otherwise blocks the main loop for up to 25s).
   */
  commandDrainMs?: number;
  /** Delay after a poll error before re-polling, so a downed daemon doesn't busy-spin. Default 2s. */
  errorBackoffMs?: number;
  /** Injectable sleep (abortable in production); defaults to a timer. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Start a heartbeat that pushes the current live-process snapshot to the
 * daemon immediately and then every `intervalMs`, until `signal` aborts. Each
 * tick first runs a liveness sweep (`registry.reapDead`) so a tracked process
 * that died without a terminal remove is dropped before the snapshot — no
 * phantom "running". The snapshot is re-serialized from the registry on each
 * tick so it always reflects the latest tracked processes. Returns a stop fn
 * (idempotent).
 */
function startHeartbeat(
  client: Pick<CrewDaemonClient, 'heartbeat'>,
  registry: Registry,
  isAlive: (pid: number) => boolean,
  reapReason: (key: string) => string | null,
  intervalMs: number,
  signal: AbortSignal,
  log: (line: string) => void,
): () => void {
  const beat = (): void => {
    const reaped = registry.reapDead(isAlive);
    if (reaped.length > 0) {
      // CREW-308: annotate each reaped key with its startup-failure reason (from
      // the startup log) so a preflight-gate death names its cause in the
      // supervisor management log instead of being a bare, unexplained key.
      const detail = reaped
        .map((key) => {
          const reason = reapReason(key);
          return reason ? `${key} — startup failed: ${reason}` : key;
        })
        .join(', ');
      log(`reaped ${reaped.length} dead process(es): ${detail}`);
    }
    void client.heartbeat(registry.toSnapshot());
  };
  beat();
  const timer = setInterval(beat, intervalMs);
  const stop = (): void => clearInterval(timer);
  signal.addEventListener('abort', stop, { once: true });
  return stop;
}

/**
 * Start a command-drain loop that applies queued operator control commands
 * immediately and then every `intervalMs`, until `signal` aborts. Runs on its
 * own timer so cancel latency is decoupled from the action long-poll. An
 * in-flight guard skips a tick while the previous drain is still running, so a
 * slow daemon can't stack overlapping drains. Returns a stop fn (idempotent).
 */
function startCommandDrain(
  deps: DrainCommandsDeps,
  intervalMs: number,
  signal: AbortSignal,
): () => void {
  let draining = false;
  const tick = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    try {
      await drainCommands(deps);
    } finally {
      draining = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  const stop = (): void => clearInterval(timer);
  signal.addEventListener('abort', stop, { once: true });
  return stop;
}

/**
 * The runner's main loop: heartbeat and command-drain run on their own
 * intervals while the loop repeatedly drains the action queue via
 * {@link runOnce}. Idle iterations re-poll immediately (the long-poll itself
 * paces them); a transport error backs off first. Exits cleanly once `signal`
 * aborts. Command apply is on a dedicated timer — not gated behind the action
 * long-poll — so a queued cancel doesn't wait out a 25s idle poll.
 */
export async function runLoop(deps: RunLoopDeps): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  const stopHeartbeat = startHeartbeat(
    deps.client,
    deps.registry,
    deps.isAlive,
    deps.reapReason ?? defaultReapReason,
    deps.heartbeatMs ?? 5_000,
    deps.signal,
    deps.log,
  );
  const stopCommandDrain = startCommandDrain(
    {
      client: deps.client,
      registry: deps.registry,
      kill: deps.kill,
      resume: deps.resume,
      writePauseSentinel: deps.writePauseSentinel,
      supervisorControl: deps.supervisorControl,
      log: deps.log,
    },
    deps.commandDrainMs ?? 2_000,
    deps.signal,
  );
  try {
    while (!deps.signal.aborted) {
      const outcome = await runOnce(deps);
      if (outcome === 'poll_error' && !deps.signal.aborted) {
        await sleep(deps.errorBackoffMs ?? 2_000);
      }
    }
  } finally {
    stopHeartbeat();
    stopCommandDrain();
  }
}
