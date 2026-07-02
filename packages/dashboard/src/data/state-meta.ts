import type { Agent, AgentState, TransitionState } from './types.js';

export interface StateMetaEntry {
  label: string;
  attention: boolean;
  sortRank: number;
}

export const STATE_META: Record<AgentState, StateMetaEntry> = {
  waiting: { label: 'Waiting', attention: true, sortRank: 0 },
  error: { label: 'Error', attention: true, sortRank: 1 },
  // CREW-311: orphaned = the DB says running but no live process exists —
  // housekeeping the operator should act on (Reap), so it sorts with the
  // attention cluster, just below error (which usually needs diagnosis).
  orphaned: { label: 'Orphaned', attention: true, sortRank: 1.5 },
  pr_open: { label: 'PR open', attention: true, sortRank: 2 },
  // CREW-202: pr_merged signals "PR closed, ready to finish". Ranked just
  // after pr_open (still attention-worthy because Finish is the next user
  // action), before running so it isn't buried.
  pr_merged: { label: 'PR merged', attention: true, sortRank: 2.5 },
  running: { label: 'Running', attention: false, sortRank: 3 },
  initializing: { label: 'Starting', attention: false, sortRank: 4 },
  // CREW-311: queued = row born at enqueue, waiting for a runner slot. A
  // normal transient state — non-attention, parked between the active
  // states and idle.
  queued: { label: 'Queued', attention: false, sortRank: 4.5 },
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
  // CREW-311: queued is pre-run quiescence, so it reads in idle's dim slate
  // family — visually calm until the runner picks it up.
  queued: {
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
  // CREW-311: orphaned shares waiting's amber family — an anomaly the
  // operator should reap, urgent-ish but not error-red.
  orphaned: {
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
  // CREW-202: pr_merged uses the same emerald success family as `finished`
  // — the PR work is done, only the local cleanup (Finish) remains. The
  // green + check icon read instantly as "ready to cleanup."
  pr_merged: {
    text: 'text-emerald-500',
    bg: 'bg-emerald-1050',
    border: 'border-emerald-600',
    solidBg: 'bg-emerald-500',
    solidBorder: 'border-emerald-500',
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
  queued: 'queued',
  running: 'running',
  pr_open: 'pr_open',
  pr_merged: 'pr_merged',
  error: 'error',
  orphaned: 'orphaned',
  finished: 'finished',
  idle: 'idle',
  waiting: 'waiting',
};

export function transitionToAgentState(t: TransitionState): AgentState {
  return TRANSITION_TO_AGENT_STATE[t];
}

// CREW-260: the override route speaks the daemon's TransitionState vocabulary
// (`init`), while the dashboard models agents in AgentState (`initializing`).
// `initializing → init` is the only divergence; the other nine labels match.
const AGENT_STATE_TO_TRANSITION: Record<AgentState, TransitionState> = {
  initializing: 'init',
  queued: 'queued',
  running: 'running',
  idle: 'idle',
  waiting: 'waiting',
  pr_open: 'pr_open',
  pr_merged: 'pr_merged',
  error: 'error',
  orphaned: 'orphaned',
  finished: 'finished',
};

export function agentStateToTransitionState(s: AgentState): TransitionState {
  return AGENT_STATE_TO_TRANSITION[s];
}

export function sortAgentsByPriority(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const rankDiff = STATE_META[a.state].sortRank - STATE_META[b.state].sortRank;
    if (rankDiff !== 0) return rankDiff;
    return b.startedAt.localeCompare(a.startedAt);
  });
}
