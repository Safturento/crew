/**
 * State name as it appears in `state_transitions.to_state`. Distinct from the
 * `AgentState` UI label union (which uses `initializing`); the transitions
 * table uses the spec's canonical `init`.
 *
 * `finished` is emitted by `IngestService.recordFinishCompleted` when a
 * `crew finish` run completes cleanly (CREW-116) — it is not produced by
 * the tool-call-driven `deriveStateFromToolCalls` helper below.
 *
 * `pr_merged` is emitted by `PrPoller.checkAgent` when GitHub reports the
 * PR is no longer OPEN (CREW-202). Like `finished`, it is not produced by
 * the tool-call-driven helper.
 */
import { hasPrCreateInvocation } from 'crew-shared';
import type { AgentState } from './AgentsService.js';

export type TransitionState = 'init' | 'running' | 'pr_open' | 'pr_merged' | 'finished' | 'error';

/**
 * Every value `state_transitions.to_state` can hold (mirrors the DB column
 * union in `db.ts`). The concrete-event reducer (`reduceState`, CREW-254/257)
 * can land an agent in `idle`; `waiting` remains schema-reserved for a future
 * producer. Kept here so `currentStateFromTransitions` can accept a raw
 * `to_state` without an unsafe cast at the call site.
 */
export type TransitionTarget = TransitionState | 'idle' | 'waiting';

/**
 * Maps a `state_transitions.to_state` value to the UI badge union `AgentState`.
 * `init` → `initializing` (the transitions table uses the spec's canonical
 * `init`; the badge uses `initializing`). `idle`/`waiting` project to their own
 * badge state (CREW-257): a clean `run_exited` with no PR makes `idle` a real
 * current state visible in the agents list, not just an intermediate transition.
 */
const TRANSITION_TO_AGENT_STATE: Record<TransitionTarget, AgentState> = {
  init: 'initializing',
  running: 'running',
  pr_open: 'pr_open',
  pr_merged: 'pr_merged',
  finished: 'finished',
  error: 'error',
  idle: 'idle',
  waiting: 'waiting',
};

/**
 * Projects an agent's current non-terminal badge state from its
 * `state_transitions` log: the `to_state` of the latest transition (by `ts`),
 * mapped to `AgentState`. Falls back to `initializing` when the agent has no
 * transitions yet.
 *
 * The log is maintained by `IngestService` (live `gh pr create` detection — the
 * ⏎/cd-prefixed variant included — and the fix-pr `pr_open → running` cycle), so
 * projecting from it keeps the list and drawer badges in lock-step with the
 * timeline instead of recomputing from divergent SQL flags. `AgentsService`
 * layers the authoritative terminal guards (finish/error/pr_merged) on top —
 * see its `deriveState` — because the CREW-96 backfill never wrote those
 * terminal transitions for historical agents.
 */
export function currentStateFromTransitions(
  transitions: ReadonlyArray<{ to: TransitionTarget; ts: number }>,
): AgentState {
  if (transitions.length === 0) return 'initializing';
  // On a `ts` tie this keeps the last element in input order (`>=`). The
  // AgentsService callers never hit that path — they pre-select exactly one row
  // in SQL (`ORDER BY ts DESC, id DESC LIMIT 1`) and hand it over as a
  // single-element array — but a future caller feeding a real multi-row slice
  // should order it by (ts, id) first to match the DB's tie-break.
  const latest = transitions.reduce((a, b) => (b.ts >= a.ts ? b : a));
  return TRANSITION_TO_AGENT_STATE[latest.to];
}

export interface ToolCallSlice {
  tool_name: string;
  input_summary: string | null;
}

/** State narrowed to what the tool-call replay produces. */
export type ToolCallDerivedState = Extract<TransitionState, 'init' | 'running' | 'pr_open'>;

/**
 * Replays a tool_call sequence and reports the agent's state at the end of
 * the slice. Used by the migration backfill (CREW-96) and by the live
 * IngestService write path (CREW-100); a single helper keeps the two in
 * lock-step.
 */
export function deriveStateFromToolCalls(calls: readonly ToolCallSlice[]): ToolCallDerivedState {
  if (calls.length === 0) return 'init';
  const hasPrCreate = calls.some(
    (c) => c.tool_name === 'Bash' && hasPrCreateInvocation(c.input_summary),
  );
  return hasPrCreate ? 'pr_open' : 'running';
}
