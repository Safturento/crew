import * as React from 'react';
import { Badge, StateIcon } from 'crew-dashboard';

/** In its canonical home — the icon slot of state Badges (AgentRow, DrawerHeader, TimelineSection). */
export const InStateBadges = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Badge color="running" intensity="mid" icon={<StateIcon />}>
      Running
    </Badge>
    <Badge color="waiting" intensity="mid" icon={<StateIcon />}>
      Waiting
    </Badge>
    <Badge color="pr_open" intensity="mid" icon={<StateIcon />}>
      PR open
    </Badge>
    <Badge color="error" intensity="mid" icon={<StateIcon />}>
      Error
    </Badge>
  </div>
);

/**
 * The bare glyph inheriting each state's text color via currentColor.
 * The wrapper reuses the pill sets' svg-sizing class so the disc renders at
 * its in-pill size (12px) instead of lucide's 24px default.
 */
export const StateColorGlyphs = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
    {(
      [
        ['text-blue-400', 'starting'],
        ['text-slate-400', 'running'],
        ['text-slate-500', 'idle'],
        ['text-amber-400', 'waiting'],
      ] as const
    ).map(([cls, label]) => (
      <span
        key={label}
        className={`inline-flex items-center gap-1 text-xs ${cls} [&_svg:not([class*='size-'])]:size-3`}
      >
        <StateIcon />
        <span className="text-muted-foreground">{label}</span>
      </span>
    ))}
  </div>
);

/** Loud-intensity pills — the disc reads on solid state surfaces too. */
export const OnSolidSurfaces = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Badge color="waiting" intensity="loud" icon={<StateIcon />}>
      Waiting
    </Badge>
    <Badge color="error" intensity="loud" icon={<StateIcon />}>
      Error
    </Badge>
    <Badge color="pr_merged" intensity="loud" icon={<StateIcon />}>
      PR merged
    </Badge>
  </div>
);
