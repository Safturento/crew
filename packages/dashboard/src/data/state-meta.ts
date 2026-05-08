import type { Agent, AgentState, TransitionState } from './types.js';

export interface StateMetaEntry {
  label: string;
  colorVar: string;
  attention: boolean;
  sortRank: number;
}

export const STATE_META: Record<AgentState, StateMetaEntry> = {
  waiting: { label: 'Waiting', colorVar: 'state-waiting', attention: true, sortRank: 0 },
  error: { label: 'Error', colorVar: 'state-error', attention: true, sortRank: 1 },
  pr_open: { label: 'PR open', colorVar: 'state-pr-open', attention: true, sortRank: 2 },
  running: { label: 'Running', colorVar: 'state-running', attention: false, sortRank: 3 },
  initializing: {
    label: 'Initializing',
    colorVar: 'state-initializing',
    attention: false,
    sortRank: 4,
  },
  idle: { label: 'Idle', colorVar: 'state-idle', attention: false, sortRank: 5 },
  finished: { label: 'Finished', colorVar: 'state-finished', attention: false, sortRank: 6 },
};

export interface StateClassTokens {
  text: string;
  borderSolid: string;
  border30: string;
  border40: string;
  bg: string;
  bg10: string;
}

export const STATE_CLASSES: Record<AgentState, StateClassTokens> = {
  initializing: {
    text: 'text-state-initializing',
    borderSolid: 'border-state-initializing',
    border30: 'border-state-initializing/30',
    border40: 'border-state-initializing/40',
    bg: 'bg-state-initializing',
    bg10: 'bg-state-initializing/10',
  },
  running: {
    text: 'text-state-running',
    borderSolid: 'border-state-running',
    border30: 'border-state-running/30',
    border40: 'border-state-running/40',
    bg: 'bg-state-running',
    bg10: 'bg-state-running/10',
  },
  idle: {
    text: 'text-state-idle',
    borderSolid: 'border-state-idle',
    border30: 'border-state-idle/30',
    border40: 'border-state-idle/40',
    bg: 'bg-state-idle',
    bg10: 'bg-state-idle/10',
  },
  waiting: {
    text: 'text-state-waiting',
    borderSolid: 'border-state-waiting',
    border30: 'border-state-waiting/30',
    border40: 'border-state-waiting/40',
    bg: 'bg-state-waiting',
    bg10: 'bg-state-waiting/10',
  },
  pr_open: {
    text: 'text-state-pr-open',
    borderSolid: 'border-state-pr-open',
    border30: 'border-state-pr-open/30',
    border40: 'border-state-pr-open/40',
    bg: 'bg-state-pr-open',
    bg10: 'bg-state-pr-open/10',
  },
  error: {
    text: 'text-state-error',
    borderSolid: 'border-state-error',
    border30: 'border-state-error/30',
    border40: 'border-state-error/40',
    bg: 'bg-state-error',
    bg10: 'bg-state-error/10',
  },
  finished: {
    text: 'text-state-finished',
    borderSolid: 'border-state-finished',
    border30: 'border-state-finished/30',
    border40: 'border-state-finished/40',
    bg: 'bg-state-finished',
    bg10: 'bg-state-finished/10',
  },
};

/**
 * The state-history endpoint reports `init` where the agents-list reports
 * `initializing`. Map the transition vocabulary onto the AgentState keys
 * STATE_META and STATE_CLASSES use.
 */
const TRANSITION_TO_AGENT_STATE: Record<TransitionState, AgentState> = {
  init: 'initializing',
  running: 'running',
  pr_open: 'pr_open',
  error: 'error',
  finished: 'finished',
  idle: 'idle',
  waiting: 'waiting',
};

export function transitionToAgentState(t: TransitionState): AgentState {
  return TRANSITION_TO_AGENT_STATE[t];
}

export function sortAgentsByPriority(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const rankDiff = STATE_META[a.state].sortRank - STATE_META[b.state].sortRank;
    if (rankDiff !== 0) return rankDiff;
    return b.startedAt.localeCompare(a.startedAt);
  });
}
