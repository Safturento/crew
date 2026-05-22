import type { ProjectConfig, TranscriptEvent } from 'crew-shared';

export type AgentState =
  | 'initializing'
  | 'running'
  | 'idle'
  | 'waiting'
  | 'pr_open'
  | 'error'
  | 'finished';

/**
 * The state-history endpoint reports its own narrower vocabulary —
 * `init` instead of `initializing`, plus `idle`/`waiting` derived from
 * tool-call quiescence. Kept separate from `AgentState` so the list
 * shape doesn't drift.
 */
export type TransitionState =
  | 'init'
  | 'running'
  | 'pr_open'
  | 'error'
  | 'finished'
  | 'idle'
  | 'waiting';

export interface Project {
  name: string;
  repoPath: string;
  branch: string;
  jiraKey: string;
  activeCount: number;
}

export interface ProjectDetailResponse {
  project: ProjectConfig;
  configPath: string;
}

export interface Agent {
  key: string;
  projectName: string;
  ticketTitle: string;
  state: AgentState;
  startedAt: string;
  tokens: number;
  prUrl?: string;
}

export interface AgentDetailRun {
  id: string;
  command: 'run' | 'fix-pr' | 'finish';
  started_at: string;
  completed_at: string | null;
  // Layer-1 metrics (CREW-164) — null until the run is measured on completion.
  doc_load_coverage_pct: number | null;
  cleanliness_pass: number | null;
  pr_claim_input_tokens: number | null;
  parity_violations: number | null;
}

/** Cohort-level metrics aggregate from `GET /api/metrics`. */
export interface AggregateMetrics {
  runCount: number;
  avgDocLoadCoverage: number | null;
  cleanlinessPassRate: number;
  avgPrClaimInputTokens: number;
  parityViolationRate: number;
}

export interface AgentDetailTokens {
  total: number;
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export interface AgentDetailTokensByTool {
  tool: string;
  tokens: number;
  /** Share of the agent's total tool-call tokens, 0–100. */
  percent: number;
}

export interface AgentDetail {
  key: string;
  project: string;
  ticket_key: string;
  ticket_title: string | null;
  state: AgentState;
  worktree_path: string;
  pr_url: string | null;
  /** Browsable app URL for the project (CREW-178). Null when not configured. */
  app_url: string | null;
  /** `<jira.site>/browse/<ticket_key>` (CREW-178). Null when not derivable. */
  jira_url: string | null;
  /** Per-tool token aggregate served by the daemon (CREW-178). */
  tokens_by_tool: AgentDetailTokensByTool[];
  runs: AgentDetailRun[];
  tokens: AgentDetailTokens;
  tool_call_count: number;
}

export interface StateTransition {
  from: TransitionState | null;
  to: TransitionState;
  ts: number;
}

export type { ProjectConfig, TranscriptEvent };
