/**
 * State name as it appears in `state_transitions.to_state`. Distinct from the
 * `AgentState` UI label union (which uses `initializing`); the transitions
 * table uses the spec's canonical `init`.
 */
export type TransitionState = 'init' | 'running' | 'pr_open';

export interface ToolCallSlice {
  tool_name: string;
  input_summary: string | null;
}

/**
 * Replays a tool_call sequence and reports the agent's state at the end of
 * the slice. Used by the migration backfill (CREW-96) and by the live
 * IngestService write path (CREW-100); a single helper keeps the two in
 * lock-step.
 */
export function deriveStateFromToolCalls(calls: readonly ToolCallSlice[]): TransitionState {
  if (calls.length === 0) return 'init';
  const hasPrCreate = calls.some(
    (c) => c.tool_name === 'Bash' && (c.input_summary ?? '').startsWith('gh pr create'),
  );
  return hasPrCreate ? 'pr_open' : 'running';
}
