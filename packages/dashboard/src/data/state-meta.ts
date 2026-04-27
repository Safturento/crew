import type { Agent, AgentState } from './types.js';

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

export function sortAgentsByPriority(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const rankDiff = STATE_META[a.state].sortRank - STATE_META[b.state].sortRank;
    if (rankDiff !== 0) return rankDiff;
    return b.startedAt.localeCompare(a.startedAt);
  });
}
