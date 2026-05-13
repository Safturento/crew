import { STATE_CLASSES, type StateClassTokens } from '@/data/state-meta';
import type { AgentState } from '@/data/types';

export type PillStateColor = AgentState;
export type PillColor = PillStateColor | 'white';
export type PillIntensity = 'ghost' | 'muted' | 'mid' | 'loud';

const WHITE_CLASSES: StateClassTokens = {
  text: 'text-slate-950',
  bg: 'bg-neutral-200',
  border: 'border-slate-500',
  solidBg: 'bg-neutral-200',
  solidBorder: 'border-slate-500',
};

function tokensFor(color: PillColor): StateClassTokens {
  return color === 'white' ? WHITE_CLASSES : STATE_CLASSES[color];
}

export function pillSurfaceClasses(color: PillColor, intensity: PillIntensity): string {
  const t = tokensFor(color);
  switch (intensity) {
    case 'loud':
      return `${t.solidBg} text-slate-950`;
    case 'mid':
      return `${t.bg} border ${t.border} ${color === 'white' ? 'text-slate-950' : t.text}`;
    case 'muted':
      return `${color === 'white' ? '' : t.bg} ${color === 'white' ? 'text-slate-950' : t.text}`.trim();
    case 'ghost':
      return color === 'white' ? 'text-slate-950' : t.text;
  }
}

export const PILL_COLORS: PillColor[] = [
  'idle',
  'initializing',
  'running',
  'waiting',
  'pr_open',
  'error',
  'finished',
  'white',
];

export const PILL_INTENSITIES: PillIntensity[] = ['ghost', 'muted', 'mid', 'loud'];
