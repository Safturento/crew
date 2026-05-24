import { STATE_CLASSES } from '@/data/state-meta';
import { TOOL_COLOR_CLASSES, type ToolColorKey } from '@/data/tool-colors';
import type { AgentState } from '@/data/types';

export type PillColor = AgentState | 'white';

export type PillIntensity = 'ghost' | 'muted' | 'mid' | 'loud';

interface PillTokens {
  text: string;
  textOnSolid: string;
  bg: string;
  border: string;
  solidBg: string;
  solidBorder: string;
}

// Source-of-truth for the 7 state colors is STATE_CLASSES in data/state-meta.ts.
// Pill adds: `textOnSolid` (the dark text on a solid surface, identical across
// states) and the extra `white` color used by neutral CTAs.
const STATE_PILL_TOKENS = Object.fromEntries(
  (Object.entries(STATE_CLASSES) as [AgentState, (typeof STATE_CLASSES)[AgentState]][]).map(
    ([state, c]) => [
      state,
      {
        text: c.text,
        textOnSolid: 'text-slate-950',
        bg: c.bg,
        border: c.border,
        solidBg: c.solidBg,
        solidBorder: c.solidBorder,
      },
    ],
  ),
) as Record<AgentState, PillTokens>;

const PILL_TOKENS: Record<PillColor, PillTokens> = {
  ...STATE_PILL_TOKENS,
  white: {
    text: 'text-foreground',
    // Figma's `white/loud` pill resolves to zinc/50 bg + zinc/950 text — not
    // pure white / slate-950. Other colors keep slate-950 text on their solids.
    textOnSolid: 'text-zinc-950',
    bg: 'bg-white/5',
    border: 'border-white/10',
    solidBg: 'bg-zinc-50',
    solidBorder: 'border-zinc-50',
  },
};

const TOOL_PILL_TOKENS = Object.fromEntries(
  (Object.entries(TOOL_COLOR_CLASSES) as [ToolColorKey, (typeof TOOL_COLOR_CLASSES)[ToolColorKey]][]).map(
    ([key, c]) => [
      key,
      {
        text: c.text,
        textOnSolid: 'text-slate-950',
        bg: c.bg,
        border: c.border,
        solidBg: c.solidBg,
        solidBorder: c.solidBorder,
      },
    ],
  ),
) as Record<ToolColorKey, PillTokens>;

export function pillSurfaceClasses(
  color: PillColor,
  intensity: PillIntensity,
  toolColor?: ToolColorKey,
): string {
  const t = toolColor ? TOOL_PILL_TOKENS[toolColor] : PILL_TOKENS[color];
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
