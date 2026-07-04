import * as React from 'react';
import { Clock, Coins, Hash } from 'lucide-react';
import { MetaList } from 'crew-dashboard';

/** Icon + value items — the AgentRow treatment (key · runtime · tokens). */
export const AgentRowMeta = () => (
  <MetaList>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Hash aria-hidden style={{ width: 12, height: 12 }} />
      crew/CREW-295
    </span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Clock aria-hidden style={{ width: 12, height: 12 }} />
      47m 12s
    </span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Coins aria-hidden style={{ width: 12, height: 12 }} />
      1.3M
    </span>
  </MetaList>
);

/** Label + value pairs — the DrawerHeader status strip treatment. */
export const DrawerStatusMeta = () => (
  <MetaList>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>runtime</span>
      <span style={{ color: 'var(--color-foreground)', fontVariantNumeric: 'tabular-nums' }}>
        47m 12s
      </span>
    </span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>tokens</span>
      <span style={{ color: 'var(--color-foreground)', fontVariantNumeric: 'tabular-nums' }}>
        1.3M
      </span>
    </span>
  </MetaList>
);

/** Plain-text items — a timeline run summary; the dot separators come from the list itself. */
export const TimelineRunMeta = () => (
  <MetaList>
    <span>run · fix-pr</span>
    <span>started 12:41</span>
    <span>agent/crew-CREW-295</span>
    <span>3 files changed</span>
  </MetaList>
);
