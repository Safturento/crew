import type { Agent, AgentState, TransitionState } from './types.js';

export interface StateMetaEntry {
  label: string;
  attention: boolean;
  sortRank: number;
}

export const STATE_META: Record<AgentState, StateMetaEntry> = {
  waiting: { label: 'Waiting', attention: true, sortRank: 0 },
  error: { label: 'Error', attention: true, sortRank: 1 },
  pr_open: { label: 'PR open', attention: true, sortRank: 2 },
  running: { label: 'Running', attention: false, sortRank: 3 },
  initializing: { label: 'Starting', attention: false, sortRank: 4 },
  idle: { label: 'Idle', attention: false, sortRank: 5 },
  finished: { label: 'Finished', attention: false, sortRank: 6 },
};

export interface StateClassTokens {
  text: string;
  bg: string;
  border: string;
  solidBg: string;
  solidBorder: string;
}

export const STATE_CLASSES: Record<AgentState, StateClassTokens> = {
  initializing: {
    text: 'text-blue-400',
    bg: 'bg-blue-1050',
    border: 'border-blue-500',
    solidBg: 'bg-blue-400',
    solidBorder: 'border-blue-400',
  },
  running: {
    text: 'text-slate-400',
    bg: 'bg-slate-1050',
    border: 'border-slate-500',
    solidBg: 'bg-slate-400',
    solidBorder: 'border-slate-400',
  },
  idle: {
    text: 'text-slate-500',
    bg: 'bg-slate-1100',
    border: 'border-slate-600',
    solidBg: 'bg-slate-500',
    solidBorder: 'border-slate-500',
  },
  waiting: {
    text: 'text-amber-400',
    bg: 'bg-amber-1050',
    border: 'border-amber-500',
    solidBg: 'bg-amber-400',
    solidBorder: 'border-amber-400',
  },
  pr_open: {
    text: 'text-violet-400',
    bg: 'bg-violet-1050',
    border: 'border-violet-500',
    solidBg: 'bg-violet-400',
    solidBorder: 'border-violet-400',
  },
  error: {
    text: 'text-red-400',
    bg: 'bg-red-1050',
    border: 'border-red-500',
    solidBg: 'bg-red-400',
    solidBorder: 'border-red-400',
  },
  finished: {
    text: 'text-emerald-500',
    bg: 'bg-emerald-1050',
    border: 'border-emerald-600',
    solidBg: 'bg-emerald-500',
    solidBorder: 'border-emerald-500',
  },
};

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
