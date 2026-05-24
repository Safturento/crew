import { STATE_CLASSES } from '../../data/state-meta.js';
import type { AgentState } from '../../data/types.js';
import { cn } from '../../lib/utils.js';

export const MIN_SEG_PX = 16;
export const STRIPE_WIDTH = 8;
export const SCROLLBAR_GUTTER = 14;
export const JUMP_DURATION_MS = 250;

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
 * `stripeHeight`. No viewport indicator — the native scrollbar thumb (just to
 * the right of the stripe) handles "you are here".
 */
export function MinimapStripe({ sections, stripeHeight, onSectionJump: _onSectionJump }: MinimapStripeProps) {
  if (sections.length === 0) return null;
  const segments = computeSegmentHeights(sections, stripeHeight);
  return (
    <div
      data-testid="minimap-stripe"
      className="absolute top-0 bottom-0 z-10 flex flex-col"
      style={{ right: `${SCROLLBAR_GUTTER}px`, width: `${STRIPE_WIDTH}px` }}
    >
      {sections.map((sec, i) => (
        <div
          key={i}
          data-testid="minimap-segment"
          data-state={sec.state}
          className={cn('w-full', STATE_CLASSES[sec.state].solidBg)}
          style={{ height: `${segments[i]}px` }}
        />
      ))}
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
  const clampedSum = clampedFlags.reduce(
    (sum, isClamped) => sum + (isClamped ? MIN_SEG_PX : 0),
    0,
  );
  const unclampedSum = raw.reduce((sum, h, i) => sum + (clampedFlags[i] ? 0 : h), 0);
  const remainingForUnclamped = Math.max(0, stripeHeight - clampedSum);
  const unclampedScale = unclampedSum > 0 ? remainingForUnclamped / unclampedSum : 0;

  return raw.map((h, i) => (clampedFlags[i] ? MIN_SEG_PX : h * unclampedScale));
}
