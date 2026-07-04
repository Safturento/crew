import * as React from 'react';
import { Badge, Separator, StateIcon } from 'crew-dashboard';

/** Horizontal rule between drawer sections. */
export const SectionDivider = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 320 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="text-sm font-medium text-foreground">Timeline</span>
      <Badge color="running" intensity="mid" icon={<StateIcon />}>
        Running
      </Badge>
    </div>
    <Separator />
    <span className="text-xs text-muted-foreground">
      Dispatched worktree crew-CREW-231 · branch cut from origin/main
    </span>
  </div>
);

/** Vertical dividers between inline meta items (agent subheader treatment). */
export const VerticalMeta = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <span className="font-mono text-xs text-muted-foreground">CREW-231</span>
    <Separator orientation="vertical" style={{ height: 14 }} />
    <span className="text-xs text-muted-foreground tabular-nums">12m 04s</span>
    <Separator orientation="vertical" style={{ height: 14 }} />
    <span className="text-xs text-muted-foreground tabular-nums">48.2k tokens</span>
  </div>
);

/** Dividing stacked list rows. */
export const BetweenListRows = () => (
  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 360 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
      <span className="text-sm text-foreground">Fix dispatch-gate visibility</span>
      <span className="font-mono text-xs text-muted-foreground">CREW-313</span>
    </div>
    <Separator />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
      <span className="text-sm text-foreground">Keep injected artifacts untracked</span>
      <span className="font-mono text-xs text-muted-foreground">CREW-315</span>
    </div>
    <Separator />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
      <span className="text-sm text-foreground">Copy pr_created hook into worktree</span>
      <span className="font-mono text-xs text-muted-foreground">CREW-314</span>
    </div>
  </div>
);
