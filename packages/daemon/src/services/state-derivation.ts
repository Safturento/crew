/**
 * State name as it appears in `state_transitions.to_state`. Distinct from the
 * `AgentState` UI label union (which uses `initializing`); the transitions
 * table uses the spec's canonical `init`.
 *
 * `finished` is emitted by `IngestService.recordFinishCompleted` when a
 * `crew finish` run completes cleanly (CREW-116) — it is not produced by
 * the tool-call-driven `deriveStateFromToolCalls` helper below.
 */
export type TransitionState = 'init' | 'running' | 'pr_open' | 'finished' | 'error';

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
    (c) => c.tool_name === 'Bash' && (c.input_summary ?? '').startsWith('gh pr create'),
  );
  return hasPrCreate ? 'pr_open' : 'running';
}
