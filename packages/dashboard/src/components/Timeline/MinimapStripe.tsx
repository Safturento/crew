import { useState, type KeyboardEvent } from 'react';

import { STATE_CLASSES, STATE_META } from '../../data/state-meta.js';
import type { AgentState } from '../../data/types.js';
import { cn } from '../../lib/utils.js';

export const MIN_SEG_PX = 16;
export const STRIPE_WIDTH = 8;
export const SCROLLBAR_GUTTER = 14;

export interface MinimapSection {
  state: AgentState;
  startedAt: number;
  eventCount: number;
  /** Pixel height of the section in the scroll viewport (from ResizeObserver). */
  height: number;
}

interface MinimapStripeProps {
  sections: ReadonlyArray<MinimapSection>;
  /** Pixel height the stripe occupies (== scroll viewport's clientHeight). */
  stripeHeight: number;
  onSectionJump: (sectionIdx: number) => void;
}

/**
 * Compressed full-timeline minimap. Always fills `stripeHeight` regardless of
 * scroll content. Each segment is proportional to its section's pixel height,
 * clamped to `MIN_SEG_PX` for clickability, then normalized so the sum equals
 * `stripeHeight`. No viewport indicator — the drawer body's native scrollbar
 * thumb (at the drawer's right edge, outside the timeline padding) handles
 * "you are here".
 */
export function MinimapStripe({ sections, stripeHeight, onSectionJump }: MinimapStripeProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  if (sections.length === 0) return null;
  const segments = computeSegmentHeights(sections, stripeHeight);
  const tooltipTop =
    hoveredIdx === null
      ? 0
      : segments.slice(0, hoveredIdx).reduce((sum, h) => sum + h, 0) + segments[hoveredIdx] / 2;

  const jumpTo = (idx: number) => {
    setActiveIdx(idx);
    onSectionJump(idx);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = sections.length - 1;
    let nextIdx: number;
    if (e.key === 'ArrowDown') nextIdx = activeIdx < 0 ? 0 : Math.min(activeIdx + 1, last);
    else if (e.key === 'ArrowUp') nextIdx = activeIdx < 0 ? last : Math.max(activeIdx - 1, 0);
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = last;
    else return;
    e.preventDefault();
    if (nextIdx !== activeIdx) jumpTo(nextIdx);
  };

  return (
    <div
      data-testid="minimap-stripe"
      role="group"
      aria-label="Timeline minimap — click a section or use arrow keys to navigate"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="pointer-events-auto absolute top-0 bottom-0 z-10 flex flex-col outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
      style={{ right: `${SCROLLBAR_GUTTER}px`, width: `${STRIPE_WIDTH}px` }}
    >
      {sections.map((sec, i) => (
        <button
          key={`${i}:${sec.state}:${sec.startedAt}`}
          type="button"
          data-testid="minimap-segment"
          data-state={sec.state}
          aria-label={`${STATE_META[sec.state].label} section, ${sec.eventCount} event${
            sec.eventCount === 1 ? '' : 's'
          }`}
          className={cn('w-full cursor-pointer', STATE_CLASSES[sec.state].solidBg)}
          style={{ height: `${segments[i]}px` }}
          onMouseEnter={() => setHoveredIdx(i)}
          onMouseLeave={() => setHoveredIdx(null)}
          onClick={() => jumpTo(i)}
        />
      ))}
      {hoveredIdx !== null && <MinimapTooltip section={sections[hoveredIdx]} top={tooltipTop} />}
    </div>
  );
}

function MinimapTooltip({ section, top }: { section: MinimapSection; top: number }) {
  const label = STATE_META[section.state].label;
  const time = new Date(section.startedAt).toISOString().slice(11, 19);
  const count = section.eventCount;
  return (
    <div
      data-testid="minimap-tooltip"
      role="tooltip"
      className="pointer-events-none absolute right-full mr-2 flex items-center gap-2 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 font-mono text-xs text-foreground shadow-md"
      style={{ top: `${top}px`, transform: 'translateY(-50%)' }}
    >
      <span>{label}</span>
      <span className="text-muted-foreground">·</span>
      <span className="tabular-nums">{time}</span>
      <span className="text-muted-foreground">·</span>
      <span className="tabular-nums">
        {count} event{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

/**
 * Proportional sizing with min-segment clamp + normalize-to-fill.
 *
 * - Each section's raw share = `(height / totalHeight) * stripeHeight`
 * - Clamp each share to `>= MIN_SEG_PX`
 * - Renormalize: scale unclamped segments so the total equals stripeHeight
 *
 * Trade-off acknowledged in spec: under heavy clamping, segment boundaries
 * drift from the native scrollbar's thumb position by O(clamped-px). Accepted.
 */
export function computeSegmentHeights(
  sections: ReadonlyArray<{ height: number }>,
  stripeHeight: number,
): number[] {
  const n = sections.length;
  if (n === 0) return [];
  if (stripeHeight <= 0) return Array(n).fill(0);
  const total = sections.reduce((sum, s) => sum + Math.max(s.height, 0), 0);
  if (total === 0) return Array(n).fill(stripeHeight / n);

  // Raw proportional shares.
  const raw = sections.map((s) => (Math.max(s.height, 0) / total) * stripeHeight);

  // Apply min-clamp: any segment below MIN_SEG_PX is bumped up.
  const clampedFlags = raw.map((h) => h < MIN_SEG_PX);
  const clampedSum = clampedFlags.reduce((sum, isClamped) => sum + (isClamped ? MIN_SEG_PX : 0), 0);
  const unclampedSum = raw.reduce((sum, h, i) => sum + (clampedFlags[i] ? 0 : h), 0);
  const remainingForUnclamped = Math.max(0, stripeHeight - clampedSum);
  const unclampedScale = unclampedSum > 0 ? remainingForUnclamped / unclampedSum : 0;

  return raw.map((h, i) => (clampedFlags[i] ? MIN_SEG_PX : h * unclampedScale));
}
