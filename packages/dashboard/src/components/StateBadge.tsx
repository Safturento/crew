import { cva } from 'class-variance-authority';

import type { AgentState } from '../data/types.js';
import { STATE_CLASSES, STATE_META, type StateClassTokens } from '../data/state-meta.js';

export type StateIntensity = 'muted' | 'mid' | 'loud';
export type StateSize = 'sm' | 'md';

interface StateBadgeProps {
  state: AgentState;
  intensity?: StateIntensity;
  size?: StateSize;
}

const ALL_STATES: AgentState[] = [
  'initializing',
  'running',
  'idle',
  'waiting',
  'pr_open',
  'error',
  'finished',
];

const INTENSITY_TEMPLATES: Record<StateIntensity, (c: StateClassTokens) => string> = {
  muted: (c) => `${c.text} border ${c.border40} bg-transparent`,
  mid: (c) => `${c.text} border ${c.border30} ${c.bg10}`,
  loud: (c) => `text-slate-950 border ${c.borderSolid} ${c.bg}`,
};

const stateBadge = cva(
  'inline-flex items-center gap-1.5 rounded-full font-mono leading-none whitespace-nowrap',
  {
    variants: {
      size: {
        sm: 'h-[18px] px-1.5 text-[10px]',
        md: 'h-[22px] px-2 text-[11px]',
      },
      state: {
        initializing: '',
        running: '',
        idle: '',
        waiting: '',
        pr_open: '',
        error: '',
        finished: '',
      },
      intensity: {
        muted: '',
        mid: '',
        loud: '',
      },
    },
    compoundVariants: ALL_STATES.flatMap((state) =>
      (Object.keys(INTENSITY_TEMPLATES) as StateIntensity[]).map((intensity) => ({
        state,
        intensity,
        class: INTENSITY_TEMPLATES[intensity](STATE_CLASSES[state]),
      })),
    ),
    defaultVariants: { size: 'md', intensity: 'mid' },
  },
);

const stateDot = cva('inline-block h-1.5 w-1.5 rounded-full', {
  variants: {
    state: {
      initializing: STATE_CLASSES.initializing.bg,
      running: STATE_CLASSES.running.bg,
      idle: STATE_CLASSES.idle.bg,
      waiting: STATE_CLASSES.waiting.bg,
      pr_open: STATE_CLASSES.pr_open.bg,
      error: STATE_CLASSES.error.bg,
      finished: STATE_CLASSES.finished.bg,
    },
    pulse: { true: 'animate-pulse-dot' },
  },
});

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

export function StateBadge({ state, intensity = 'mid', size = 'md' }: StateBadgeProps) {
  const meta = STATE_META[state];
  const pulse = ACTIVE_STATES.has(state);
  return (
    <span
      role="status"
      aria-label={meta.label}
      data-intensity={intensity}
      data-state={state}
      className={stateBadge({ state, intensity, size })}
    >
      <span
        data-testid={pulse ? 'state-badge-pulse' : 'state-badge-dot'}
        className={stateDot({ state, pulse })}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
