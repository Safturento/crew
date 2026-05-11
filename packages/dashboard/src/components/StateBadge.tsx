import { cva } from 'class-variance-authority';

import type { AgentState } from '@/data/types';
import { STATE_CLASSES, STATE_META, type StateClassTokens } from '@/data/state-meta';

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
  muted: (c) => `${c.text} ${c.bg}`,
  mid: (c) => `${c.text} border ${c.border} ${c.bg}`,
  loud: (c) => `text-slate-950 border ${c.solidBorder} ${c.solidBg}`,
};

const stateBadge = cva(
  'inline-flex w-fit items-center gap-1.5 rounded-full font-mono leading-none whitespace-nowrap',
  {
    variants: {
      size: {
        sm: 'h-5 px-1.5 text-xs',
        md: 'h-6 px-2 text-xs',
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
    defaultVariants: { size: 'md', intensity: 'mid' } as const,
  },
);

const stateDot = cva('inline-block h-1.5 w-1.5 rounded-full', {
  variants: {
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
      loud: 'bg-slate-950',
    },
    pulse: { true: 'animate-pulse-dot' },
  },
  compoundVariants: ALL_STATES.flatMap((state) =>
    (['muted', 'mid'] as StateIntensity[]).map((intensity) => ({
      state,
      intensity,
      class: STATE_CLASSES[state].solidBg,
    })),
  ),
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
        className={stateDot({ state, intensity, pulse })}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
