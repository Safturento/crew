import type { AgentState } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';

export type StateIntensity = 'muted' | 'mid' | 'loud';
export type StateSize = 'sm' | 'md';

interface StateBadgeProps {
  state: AgentState;
  intensity?: StateIntensity;
  size?: StateSize;
}

const SIZE_CLASSES: Record<StateSize, string> = {
  sm: 'h-[18px] px-1.5 text-[10px]',
  md: 'h-[22px] px-2 text-[11px]',
};

function classesForIntensity(intensity: StateIntensity, colorVar: string): string {
  const text = `text-${colorVar}`;
  switch (intensity) {
    case 'muted':
      return `${text} border border-${colorVar}/40 bg-transparent`;
    case 'loud':
      return `text-slate-950 border border-${colorVar} bg-${colorVar}`;
    case 'mid':
    default:
      return `${text} border border-${colorVar}/30 bg-${colorVar}/10`;
  }
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

export function StateBadge({ state, intensity = 'mid', size = 'md' }: StateBadgeProps) {
  const meta = STATE_META[state];
  const classes = [
    'inline-flex items-center gap-1.5 rounded-full font-mono leading-none whitespace-nowrap',
    SIZE_CLASSES[size],
    classesForIntensity(intensity, meta.colorVar),
  ].join(' ');
  return (
    <span
      role="status"
      aria-label={meta.label}
      data-intensity={intensity}
      data-state={state}
      className={classes}
    >
      {ACTIVE_STATES.has(state) ? (
        <PulseDot colorVar={meta.colorVar} />
      ) : (
        <Dot colorVar={meta.colorVar} />
      )}
      {meta.label}
    </span>
  );
}

function PulseDot({ colorVar }: { colorVar: string }) {
  return (
    <span
      data-testid="state-badge-pulse"
      className={`inline-block h-1.5 w-1.5 rounded-full bg-${colorVar} animate-pulse-dot`}
      aria-hidden
    />
  );
}

function Dot({ colorVar }: { colorVar: string }) {
  return (
    <span
      data-testid="state-badge-dot"
      className={`inline-block h-1.5 w-1.5 rounded-full bg-${colorVar}`}
      aria-hidden
    />
  );
}
