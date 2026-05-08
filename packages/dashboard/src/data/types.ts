import type { TranscriptEvent } from 'crew-shared';

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
}

export interface AgentDetailTokens {
  total: number;
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export interface AgentDetail {
  key: string;
  project: string;
  ticket_key: string;
  ticket_title: string | null;
  state: AgentState;
  worktree_path: string;
  pr_url: string | null;
  runs: AgentDetailRun[];
  tokens: AgentDetailTokens;
  tool_call_count: number;
}

export interface StateTransition {
  from: TransitionState | null;
  to: TransitionState;
  ts: number;
}

export type { TranscriptEvent };
