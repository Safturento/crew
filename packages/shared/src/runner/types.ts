/**
 * Shared contracts for runner control parity (Epic CREW-235). The host
 * runner tracks the agent subprocesses it spawns and pushes a live-process
 * snapshot on its heartbeat; the operator drives those processes back
 * through a persisted reverse-command queue the runner drains each cycle.
 * These types are the single source of truth referenced by the daemon,
 * runner, and dashboard tickets of the Epic.
 *
 * Enums live as `as const` tuples so the runtime values can be reused
 * (DB checks, zod `enum`s) and the union types derive from them — mirrors
 * the `actions` and `startup-events` conventions.
 */

/**
 * Reverse-queue command kinds the runner applies against a tracked process.
 * `cancel_soft`/`cancel_hard` signal the process group; `dequeue` drops a
 * still-pending action request (no live process); `reap` settles an orphan
 * terminal without signalling. `pause`/`resume`/`message` are designed-for
 * and carried from day one, but applied only in the fast-follow (CREW-248).
 * `supervisor_stop`/`supervisor_restart` are queue-level (null `agentKey`):
 * they target the supervisor process itself (CREW-293) — stop = graceful exit,
 * restart = exit-and-respawn via the runner's self-respawn loop.
 */
export const RUNNER_COMMAND_KINDS = [
  'cancel_soft',
  'cancel_hard',
  'dequeue',
  'reap',
  'pause',
  'resume',
  'message',
  'supervisor_stop',
  'supervisor_restart',
] as const;
export type RunnerCommandKind = (typeof RUNNER_COMMAND_KINDS)[number];

/** Lifecycle of a queued runner command, from enqueue through apply. */
export const RUNNER_COMMAND_STATUSES = ['pending', 'claimed', 'applied', 'failed'] as const;
export type RunnerCommandStatus = (typeof RUNNER_COMMAND_STATUSES)[number];

/** Live state of a tracked agent subprocess, as reported in the snapshot. */
export const LIVE_PROCESS_STATES = ['launching', 'running', 'cancelling', 'paused'] as const;
export type LiveProcessState = (typeof LIVE_PROCESS_STATES)[number];

/**
 * Lifecycle status persisted on a `runs` row (CREW-244). Additive on top of
 * the older `completed_at`/`exit_code` derivation — legacy and normal runs
 * leave `status` null. The launching → failed-start path is the only writer:
 *
 * - `launching` — pre-registered before preflight, no transcript yet.
 * - `running`   — designed-for; reserved for the snapshot lane (B/C) that
 *   promotes a launching row once Claude is live. Carried from day one so the
 *   contract is stable.
 * - `failed-start` — died during init/preflight; carries the `RunFailure`
 *   diagnosis and surfaces on the Runner page's "Failed to start" section.
 */
export const RUN_STATUSES = ['launching', 'running', 'failed-start'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * One agent subprocess the runner is currently supervising. Ended processes
 * drop out of the next snapshot; "recently ended" history reads from `runs`.
 * Correlation key throughout the Epic is `agentKey`.
 */
export interface LiveProcess {
  agentKey: string;
  command: 'run' | 'fix-pr' | 'finish' | 'resume';
  pid: number;
  pgid: number;
  /** The action_request that spawned this process, when it came from the queue. */
  actionRequestId: number | null;
  spawnedAt: string; // ISO
  state: LiveProcessState;
  project: string;
}

/** The full live-process snapshot the runner pushes on each heartbeat. */
export interface RunnerSnapshot {
  processes: LiveProcess[];
}

/** Optional per-command payload (the steering message for `message`/`resume`). */
export interface RunnerCommandPayload {
  message?: string;
}

/**
 * A queued reverse-command as stored by the daemon and drained by the
 * runner. `agentKey` is null for queue-level commands that target a pending
 * action rather than a live process (`dequeue`). `error` is set only on the
 * `failed` terminal status.
 */
export interface RunnerCommand {
  id: number;
  agentKey: string | null;
  kind: RunnerCommandKind;
  payload: RunnerCommandPayload | null;
  status: RunnerCommandStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Structured diagnosis of a run that failed during init/preflight, before it
 * ever reached `running`. Persisted on the `runs` row alongside the
 * `failed-start` status (CREW-244) and surfaced on the Runner page's
 * "Failed to start" section.
 */
export interface RunFailure {
  /** Identifier of the preflight check that failed (e.g. `git-remote`). */
  check: string;
  /** One-line human summary of what went wrong. */
  headline: string;
  /** What the operator should do to fix it. */
  remediation: string;
  /** Captured diagnostic output (rendered preflight error / stderr). */
  output: string;
}
