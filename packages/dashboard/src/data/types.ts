import type { FinishStepStatus, ProjectConfig, TranscriptEvent } from 'crew-shared';

export type AgentState =
  | 'initializing'
  | 'running'
  | 'idle'
  | 'waiting'
  | 'pr_open'
  | 'pr_merged'
  | 'error'
  | 'finished';

/**
 * The state-history endpoint reports its own narrower vocabulary —
 * `init` instead of `initializing`, plus `idle`/`waiting` derived from
 * tool-call quiescence. Kept separate from `AgentState` so the list
 * shape doesn't drift.
 *
 * CREW-202: `pr_merged` is written by the daemon's PrPoller when GitHub
 * reports a PR is no longer OPEN. Both vocabularies carry it.
 */
export type TransitionState =
  | 'init'
  | 'running'
  | 'pr_open'
  | 'pr_merged'
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

/** Per-category token bucket (CREW-195) — drives cost-weighted display. */
export interface TokenCategoryBucket {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export interface AgentDetailTokensByTool {
  tool: string;
  /** Per-category bucket — multiply by per-model rates for USD cost. */
  tokens: TokenCategoryBucket;
  /** Sum of all bucket entries — convenience for sort + bar widths. */
  totalTokens: number;
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
  /** Per-tool token aggregate served by the daemon (CREW-178/195). */
  tokens_by_tool: AgentDetailTokensByTool[];
  /**
   * Dominant transcript model (CREW-195). Drives per-row cost weighting in
   * TokensByTool. Empty string when unknown — pricing helpers fall back to
   * Sonnet rates.
   */
  model: string;
  runs: AgentDetailRun[];
  tokens: AgentDetailTokens;
  tool_call_count: number;
}

export interface StateTransition {
  from: TransitionState | null;
  to: TransitionState;
  ts: number;
}

/**
 * One `crew finish` step as read back from the daemon (CREW-220). Mirrors
 * the stored shape: `detail` is `string | null` (NULL in the DB) rather
 * than the optional `string` the CLI emit side accepts.
 */
export interface FinishStep {
  key: string;
  index: number;
  label: string;
  status: FinishStepStatus;
  detail: string | null;
  ts: number;
}

export type { FinishStepStatus, ProjectConfig, TranscriptEvent };
