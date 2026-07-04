import * as React from 'react';
import { PillBase } from 'crew-dashboard';

// PillBase is the shared surface under Button / Tag / Badge: callers supply a
// `shape` (sizing + typography classes) and PillBase paints the color ×
// intensity surface. These stories use a Tag-like chip shape.
const CHIP = 'h-[17px] gap-1 rounded-[4px] px-1.5 font-mono text-[11px] leading-none';

/** One chip per agent-state color at `mid` intensity. */
export const StateColors = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    {(['initializing', 'queued', 'running', 'idle', 'waiting', 'pr_open', 'pr_merged', 'error', 'orphaned', 'finished'] as const).map(
      (color) => (
        <PillBase key={color} shape={CHIP} color={color}>
          {color}
        </PillBase>
      ),
    )}
  </div>
);

/** The intensity ramp, ghost → loud, on the `running` color plus `white`. */
export const IntensityRamp = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {(['ghost', 'muted', 'mid', 'loud'] as const).map((intensity) => (
        <PillBase key={intensity} shape={CHIP} color="running" intensity={intensity}>
          {intensity}
        </PillBase>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {(['ghost', 'muted', 'mid', 'loud'] as const).map((intensity) => (
        <PillBase key={intensity} shape={CHIP} color="white" intensity={intensity}>
          {intensity}
        </PillBase>
      ))}
    </div>
  </div>
);

/** Interactive pill (`as="button"`) — gets hover styling static spans don't. */
export const InteractivePill = () => (
  <PillBase shape="h-8 gap-1.5 rounded-md px-3 text-sm font-medium" color="white" intensity="loud" as="button">
    Clickable pill
  </PillBase>
);
