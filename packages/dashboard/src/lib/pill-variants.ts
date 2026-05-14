export type PillColor =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'waiting'
  | 'pr_open'
  | 'error'
  | 'finished'
  | 'white';

export type PillIntensity = 'ghost' | 'muted' | 'mid' | 'loud';

interface PillTokens {
  text: string;
  textOnSolid: string;
  bg: string;
  border: string;
  solidBg: string;
  solidBorder: string;
}

const PILL_TOKENS: Record<PillColor, PillTokens> = {
  initializing: {
    text: 'text-blue-400',
    textOnSolid: 'text-slate-950',
    bg: 'bg-blue-1050',
    border: 'border-blue-500',
    solidBg: 'bg-blue-400',
    solidBorder: 'border-blue-400',
  },
  running: {
    text: 'text-slate-400',
    textOnSolid: 'text-slate-950',
    bg: 'bg-slate-1050',
    border: 'border-slate-500',
    solidBg: 'bg-slate-400',
    solidBorder: 'border-slate-400',
  },
  idle: {
    text: 'text-slate-500',
    textOnSolid: 'text-slate-950',
    bg: 'bg-slate-1100',
    border: 'border-slate-600',
    solidBg: 'bg-slate-500',
    solidBorder: 'border-slate-500',
  },
  waiting: {
    text: 'text-amber-400',
    textOnSolid: 'text-slate-950',
    bg: 'bg-amber-1050',
    border: 'border-amber-500',
    solidBg: 'bg-amber-400',
    solidBorder: 'border-amber-400',
  },
  pr_open: {
    text: 'text-violet-400',
    textOnSolid: 'text-slate-950',
    bg: 'bg-violet-1050',
    border: 'border-violet-500',
    solidBg: 'bg-violet-400',
    solidBorder: 'border-violet-400',
  },
  error: {
    text: 'text-red-400',
    textOnSolid: 'text-slate-950',
    bg: 'bg-red-1050',
    border: 'border-red-500',
    solidBg: 'bg-red-400',
    solidBorder: 'border-red-400',
  },
  finished: {
    text: 'text-emerald-500',
    textOnSolid: 'text-slate-950',
    bg: 'bg-emerald-1050',
    border: 'border-emerald-600',
    solidBg: 'bg-emerald-500',
    solidBorder: 'border-emerald-500',
  },
  white: {
    text: 'text-foreground',
    textOnSolid: 'text-slate-950',
    bg: 'bg-white/5',
    border: 'border-white/10',
    solidBg: 'bg-white',
    solidBorder: 'border-white',
  },
};

export function pillSurfaceClasses(color: PillColor, intensity: PillIntensity): string {
  const t = PILL_TOKENS[color];
  switch (intensity) {
    case 'ghost':
      return `${t.text} bg-transparent`;
    case 'muted':
      return `${t.text} ${t.bg}`;
    case 'mid':
      return `${t.text} ${t.bg} border ${t.border}`;
    case 'loud':
      return `${t.textOnSolid} ${t.solidBg} border ${t.solidBorder}`;
  }
}
