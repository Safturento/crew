/**
 * Shared contracts for dashboard-triggered agent actions. The dashboard
 * enqueues an action request; the daemon records it and exposes it over
 * HTTP; a host-side runner claims it and shells the matching CLI verb.
 * These types are the single source of truth referenced by the daemon,
 * runner, and dashboard tickets of Epic CREW-208.
 *
 * Enums live as `as const` tuples so the runtime values can be reused
 * (DB checks, zod `enum`s) and the union types derive from them — mirrors
 * the `startup-events` convention.
 */

/** The three agent verbs the dashboard can trigger. */
export const ACTION_KINDS = ['run', 'fix_pr', 'finish'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Lifecycle of a queued action, from enqueue through host-side launch. */
export const ACTION_STATUSES = ['pending', 'claimed', 'launching', 'launched', 'failed'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/**
 * Per-kind payload. `run` and `finish` carry nothing beyond the request
 * envelope; `fix_pr` carries the review comment posted to the PR before
 * `crew fix-pr` runs.
 */
export type ActionPayload =
  | { kind: 'run' }
  | { kind: 'fix_pr'; comment: string }
  | { kind: 'finish' };

/** A queued action request as stored by the daemon and surfaced over HTTP. */
export interface ActionRequest {
  id: number;
  kind: ActionKind;
  ticketKey: string;
  project: string;
  payload: ActionPayload;
  status: ActionStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of a single `crew finish` step. */
export const FINISH_STEP_STATUSES = ['ok', 'skip', 'error'] as const;
export type FinishStepStatus = (typeof FINISH_STEP_STATUSES)[number];

/**
 * One step of a `crew finish` run, emitted by the CLI to the daemon and
 * rendered as a live checklist row in the agent drawer.
 */
export interface FinishStepEvent {
  key: string; // agent key
  index: number; // step ordinal within the finish run
  label: string;
  status: FinishStepStatus;
  detail?: string;
  ts: number;
}
