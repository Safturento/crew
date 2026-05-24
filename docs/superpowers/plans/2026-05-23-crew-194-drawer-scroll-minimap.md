# CREW-194 — Drawer Timeline scroll + minimap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoist scroll from per-`TimelineSection` to the Timeline body (toolbar sticks, `DrawerHeader` stays above), and add a parallel 8px colored-segments minimap scrollbar that compresses the entire timeline into the viewport height.

**Architecture:** Native scrollbar keeps owning scroll mechanics. `TimelineSection` drops `overflow-hidden` so content flows. `Timeline.tsx` becomes `[sticky toolbar | scrolling sections | absolute MinimapStripe]`. `MinimapStripe.tsx` is a new composite that observes section heights via `ResizeObserver`, renders proportional+clamped+normalized segments, and exposes hover tooltip + click-to-jump + keyboard nav. No viewport indicator on the stripe (native scrollbar thumb already serves that role).

**Tech Stack:** React 19 + TypeScript + Tailwind v4. `vitest` + `@testing-library/react` for unit tests. Playwright for e2e. No new runtime deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-194-drawer-scroll-minimap-design.md`](../specs/2026-05-23-crew-194-drawer-scroll-minimap-design.md)
**Ticket:** [CREW-194](https://safturento.atlassian.net/browse/CREW-194) (Epic: [CREW-189](https://safturento.atlassian.net/browse/CREW-189))

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/dashboard/src/components/Timeline/TimelineSection.tsx` | Drop `overflow-hidden` (one line) |
| Modify | `packages/dashboard/src/components/Timeline/TimelineSection.test.tsx` | Assert overflow class is gone |
| Modify | `packages/dashboard/src/components/Timeline/Timeline.tsx` | Refactor: single ScrollViewport, sticky toolbar, mount MinimapStripe, handle jump |
| Modify | `packages/dashboard/src/components/Timeline/Timeline.test.tsx` | Update to reflect new DOM shape |
| Create | `packages/dashboard/src/components/Timeline/useSectionHeights.ts` | `ResizeObserver`-driven height tracking hook |
| Create | `packages/dashboard/src/components/Timeline/useSectionHeights.test.ts` | Hook unit tests |
| Create | `packages/dashboard/src/components/Timeline/MinimapStripe.tsx` | New composite — segments + hover + click + keyboard |
| Create | `packages/dashboard/src/components/Timeline/MinimapStripe.test.tsx` | Component unit tests |
| Modify | `packages/dashboard/tests/e2e/agent-drawer.spec.ts` | New cases: long-section scrolling, minimap click jump |
| Modify | `.agents/design-system.md` | Register `MinimapStripe` in the composites table |
| Create | `docs/visual-fidelity-reports/CREW-194.md` | Visual fidelity check output |

---

## Task 1: Drop `overflow-hidden` from `TimelineSection`

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/TimelineSection.tsx:39`
- Test: `packages/dashboard/src/components/Timeline/TimelineSection.test.tsx`

- [ ] **Step 1: Write failing assertion in the existing render test**

In `TimelineSection.test.tsx`, add a new test inside the `describe('TimelineSection', ...)` block:

```tsx
it('does not clip its children with overflow-hidden (scroll lives on the Timeline body now)', () => {
  render(
    <TimelineSection {...baseProps}>
      <div data-testid="body" />
    </TimelineSection>,
  );
  const section = screen.getByTestId('timeline-section');
  expect(section.className).not.toMatch(/\boverflow-hidden\b/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run --workspace=crew-dashboard -- TimelineSection
```

Expected: FAIL on the new assertion ("Expected ... not to contain 'overflow-hidden'") because the current `className` includes it.

- [ ] **Step 3: Remove `overflow-hidden` from the section element**

Change `TimelineSection.tsx:39`:

```tsx
// Before
className={`overflow-hidden border-l-2 ${STATE_CLASSES[state].solidBorder}`}

// After
className={`border-l-2 ${STATE_CLASSES[state].solidBorder}`}
```

- [ ] **Step 4: Re-run the test to verify all TimelineSection tests pass**

```bash
npm run test:run --workspace=crew-dashboard -- TimelineSection
```

Expected: PASS (all 7+ TimelineSection tests).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/TimelineSection.tsx \
        packages/dashboard/src/components/Timeline/TimelineSection.test.tsx
git commit -m "refactor(dashboard): drop overflow-hidden from TimelineSection (CREW-194)

Scroll moves to the Timeline body in the next task; per-section clipping
is no longer needed and was the root cause of long sections rendering
only their first few events."
```

---

## Task 2: Refactor `Timeline.tsx` to a sticky-toolbar + single-scroll-viewport shape

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx:139-205`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.test.tsx`

- [ ] **Step 1: Write failing structural test in `Timeline.test.tsx`**

Add inside the existing `describe('Timeline', ...)`:

```tsx
it('renders the toolbar inside the scroll region as sticky', () => {
  // Use a fixture with at least one section so the scroll container renders
  setupQueryMock({ events: [/* a few events */], transitions: [] });
  render(<Timeline agentKey="CREW-102" agentState="running" />);
  const toolbar = screen.getByTestId('timeline-toolbar');
  expect(toolbar.className).toMatch(/\bsticky\b/);
  expect(toolbar.className).toMatch(/\btop-0\b/);
});

it('mounts the section list inside the single scroll viewport (not its own scrollable div)', () => {
  setupQueryMock({ events: [/* ... */], transitions: [] });
  const { container } = render(<Timeline agentKey="CREW-102" agentState="running" />);
  const scrollables = container.querySelectorAll('[class*="overflow-y-auto"]');
  // Exactly one scroll container: the outer ScrollViewport. The old per-section
  // and inner-flex scrollers should be gone.
  expect(scrollables.length).toBe(1);
});
```

The toolbar needs a `data-testid="timeline-toolbar"`; add it in step 3.

- [ ] **Step 2: Run the test to verify both fail**

```bash
npm run test:run --workspace=crew-dashboard -- Timeline.test
```

Expected: FAIL — no `data-testid="timeline-toolbar"` element yet, and the current Timeline has its own `overflow-y-auto` div separate from where the toolbar lives.

- [ ] **Step 3: Refactor `Timeline.tsx` JSX**

Replace the current `return (...)` block (lines ~139-205) with:

```tsx
return (
  <div className="relative flex h-full min-h-0 flex-col">
    {/* Single ScrollViewport holds both toolbar (sticky) and sections (scrolling) */}
    <div
      ref={scrollRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ scrollbarGutter: 'stable' }}
    >
      <TimelineToolbar
        data-testid="timeline-toolbar"
        className="sticky top-0 z-10 bg-card"
        visibleGroups={...}
        onVisibleGroupsChange={...}
        searchValue={...}
        onSearchChange={...}
        liveMode={liveMode}
        onLiveModeChange={setLiveMode}
        onCollapseAll={collapseAll}
        canCollapseAll={sections.length > 0}
      />
      {events.length === 0 ? (
        <div data-testid="timeline-empty" className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          No timeline events yet.
        </div>
      ) : filteredEvents.length === 0 ? (
        <FilterEmptyState onShowAll={resetFilters} />
      ) : (
        <div className="flex flex-col gap-2 px-1 py-1">
          {sections.map((s) => {
            const key = sectionKey(s);
            const isOpen = !collapsed[key];
            const elapsedMs = (s.endedAt ?? now) - s.startedAt;
            const tokenSum = s.events.reduce((sum, e) => sum + eventTokens(e), 0);
            return (
              <TimelineSection
                key={key}
                state={s.state}
                startedAt={s.startedAt}
                elapsedMs={elapsedMs}
                eventCount={s.events.length}
                tokenSum={tokenSum}
                isOpen={isOpen}
                onToggle={() => toggleSection(key)}
              >
                {s.events.map((event) => (
                  <TranscriptRow key={eventKey(event)} event={event} />
                ))}
              </TimelineSection>
            );
          })}
        </div>
      )}
    </div>
    {/* MinimapStripe mounts in Task 8 */}
    {!liveMode && pendingNewCount > 0 && (
      <div className="pointer-events-none absolute right-3 bottom-3">
        <span className="pointer-events-auto">
          <NewEventsPill count={pendingNewCount} onClick={...} />
        </span>
      </div>
    )}
  </div>
);
```

Also update the `TimelineToolbar` function signature to accept and forward `className` + `data-testid`:

```tsx
interface TimelineToolbarProps {
  visibleGroups: ReadonlySet<ChipGroup>;
  onVisibleGroupsChange: (next: Set<ChipGroup>) => void;
  searchValue: string;
  onSearchChange: (next: string) => void;
  liveMode: boolean;
  onLiveModeChange: (next: boolean) => void;
  onCollapseAll: () => void;
  canCollapseAll: boolean;
  className?: string;
  'data-testid'?: string;
}

function TimelineToolbar({ className, 'data-testid': testId, ...rest }: TimelineToolbarProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      {/* existing children */}
    </div>
  );
}
```

(Import `cn` from `@/lib/utils`.)

- [ ] **Step 4: Re-run the Timeline tests**

```bash
npm run test:run --workspace=crew-dashboard -- Timeline.test
```

Expected: PASS — both new structural assertions plus all existing Timeline tests.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/Timeline.tsx \
        packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "refactor(dashboard): hoist Timeline scroll to single ScrollViewport + sticky toolbar (CREW-194)

Outer container becomes the scroll boundary; toolbar sticks at top so
Filters/Search/Collapse/LiveMode stay visible while scrolling. Sections
no longer carry their own scroll. Sets up Task 8's MinimapStripe mount."
```

---

## Task 3: `useSectionHeights` hook — ResizeObserver-driven height tracking

**Files:**
- Create: `packages/dashboard/src/components/Timeline/useSectionHeights.ts`
- Create: `packages/dashboard/src/components/Timeline/useSectionHeights.test.ts`

- [ ] **Step 1: Write the failing test**

`useSectionHeights.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { useSectionHeights } from './useSectionHeights.js';

class FakeResizeObserver {
  callback: ResizeObserverCallback;
  static instances: FakeResizeObserver[] = [];
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    FakeResizeObserver.instances.push(this);
  }
  observe(_el: Element) {}
  unobserve(_el: Element) {}
  disconnect() {}
  fire(entries: Array<{ target: Element; contentRect: { height: number } }>) {
    this.callback(entries as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
  // @ts-expect-error - test-only assignment
  globalThis.ResizeObserver = FakeResizeObserver;
});

describe('useSectionHeights', () => {
  it('returns one number per registered ref, defaulting to 0', () => {
    const { result } = renderHook(() => useSectionHeights(3));
    expect(result.current.heights).toEqual([0, 0, 0]);
    expect(result.current.refFor).toBeInstanceOf(Function);
  });

  it('updates a height when ResizeObserver fires for that section', () => {
    const { result } = renderHook(() => useSectionHeights(2));
    const el0 = document.createElement('section');
    const el1 = document.createElement('section');
    act(() => {
      result.current.refFor(0)(el0);
      result.current.refFor(1)(el1);
    });
    act(() => {
      FakeResizeObserver.instances[0].fire([
        { target: el0, contentRect: { height: 200 } },
      ]);
    });
    expect(result.current.heights).toEqual([200, 0]);
    act(() => {
      FakeResizeObserver.instances[0].fire([
        { target: el1, contentRect: { height: 80 } },
      ]);
    });
    expect(result.current.heights).toEqual([200, 80]);
  });

  it('resizes the heights array when sectionCount changes', () => {
    const { result, rerender } = renderHook(({ n }) => useSectionHeights(n), {
      initialProps: { n: 2 },
    });
    expect(result.current.heights).toEqual([0, 0]);
    rerender({ n: 4 });
    expect(result.current.heights).toEqual([0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run --workspace=crew-dashboard -- useSectionHeights
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

`useSectionHeights.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseSectionHeightsResult {
  heights: number[];
  refFor: (index: number) => (el: HTMLElement | null) => void;
}

/**
 * Tracks the rendered pixel height of N sibling sections via a single
 * ResizeObserver. Returns:
 *   - `heights[i]` — current height of section i (0 until first observation)
 *   - `refFor(i)` — a callback-ref to attach to that section's outer element
 *
 * Sections are addressed by index, not key, so the caller must keep the
 * index stable across renders (or accept that re-indexing resets heights
 * to 0 for the new positions).
 */
export function useSectionHeights(sectionCount: number): UseSectionHeightsResult {
  const [heights, setHeights] = useState<number[]>(() => Array(sectionCount).fill(0));
  const elementsRef = useRef<Map<HTMLElement, number>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<Map<number, number>>(new Map());
  // See refFor cache below — load-bearing for avoiding a re-observe loop.
  const refCacheRef = useRef<Map<number, (el: HTMLElement | null) => void>>(new Map());

  // Resize the heights array if sectionCount changes (preserve existing where possible).
  useEffect(() => {
    setHeights((prev) => {
      if (prev.length === sectionCount) return prev;
      const next = Array(sectionCount).fill(0);
      for (let i = 0; i < Math.min(prev.length, sectionCount); i++) next[i] = prev[i];
      return next;
    });
  }, [sectionCount]);

  // Create the observer once.
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const idx = elementsRef.current.get(entry.target as HTMLElement);
        if (idx === undefined) continue;
        pendingRef.current.set(idx, entry.contentRect.height);
      }
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current.size === 0) return;
        // Suspenders to the cached-ref belt: return SAME array when no
        // height actually changed so React skips the re-render. Without
        // this, a re-observe of an unchanged section still allocates a
        // new array → re-render → re-observe → loop.
        const snapshot = new Map(pendingRef.current);
        pendingRef.current.clear();
        setHeights((prev) => {
          let changed = false;
          const next = prev.slice();
          for (const [idx, h] of snapshot) {
            if (idx < next.length && next[idx] !== h) {
              next[idx] = h;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      });
    });
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      elementsRef.current.clear();
      pendingRef.current.clear();
      refCacheRef.current.clear();
    };
  }, []);

  // CRITICAL: cache the callback per index. A fresh inner arrow every
  // call would make React detach + reattach every section's ref each
  // render → ResizeObserver re-fires initial-size → setHeights → render
  // → fresh refs → infinite loop. PR #275's first iteration shipped
  // without this and produced an unreliable section-collapse regression.
  // Also clear `refCacheRef.current.clear()` in the observer-effect cleanup.
  const refFor = useCallback((index: number) => {
    const cached = refCacheRef.current.get(index);
    if (cached) return cached;
    const cb = (el: HTMLElement | null) => {
      const observer = observerRef.current;
      if (!observer) return;
      // Unregister any element previously held at this index
      for (const [existingEl, existingIdx] of elementsRef.current) {
        if (existingIdx === index && existingEl !== el) {
          observer.unobserve(existingEl);
          elementsRef.current.delete(existingEl);
        }
      }
      if (el) {
        elementsRef.current.set(el, index);
        observer.observe(el);
      }
    };
    refCacheRef.current.set(index, cb);
    return cb;
  }, []);

  return useMemo(() => ({ heights, refFor }), [heights, refFor]);
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

```bash
npm run test:run --workspace=crew-dashboard -- useSectionHeights
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/useSectionHeights.ts \
        packages/dashboard/src/components/Timeline/useSectionHeights.test.ts
git commit -m "feat(dashboard): useSectionHeights hook for ResizeObserver-driven section tracking (CREW-194)

Single shared ResizeObserver; rAF-batched state updates; callback-ref
pattern keyed by section index. Consumed by MinimapStripe in Task 4."
```

---

## Task 4: `MinimapStripe` component — segments only (no hover, no click yet)

**Files:**
- Create: `packages/dashboard/src/components/Timeline/MinimapStripe.tsx`
- Create: `packages/dashboard/src/components/Timeline/MinimapStripe.test.tsx`

- [ ] **Step 1: Write failing tests for skeleton rendering**

`MinimapStripe.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MinimapStripe, MIN_SEG_PX, STRIPE_WIDTH } from './MinimapStripe.js';
import { STATE_CLASSES } from '../../data/state-meta.js';

const noop = () => {};

const baseProps = {
  sections: [
    { state: 'running' as const, startedAt: Date.parse('2026-05-23T14:30:00Z'), eventCount: 9, height: 270 },
    { state: 'waiting' as const, startedAt: Date.parse('2026-05-23T14:42:00Z'), eventCount: 2, height: 60 },
    { state: 'error'   as const, startedAt: Date.parse('2026-05-23T14:43:00Z'), eventCount: 1, height: 30 },
  ],
  stripeHeight: 360,
  onSectionJump: noop,
};

describe('MinimapStripe', () => {
  it('renders one segment per section', () => {
    render(<MinimapStripe {...baseProps} />);
    expect(screen.getAllByTestId('minimap-segment')).toHaveLength(3);
  });

  it('applies the state color class to each segment', () => {
    render(<MinimapStripe {...baseProps} />);
    const segments = screen.getAllByTestId('minimap-segment');
    expect(segments[0].className).toContain(STATE_CLASSES.running.solidBg);
    expect(segments[1].className).toContain(STATE_CLASSES.waiting.solidBg);
    expect(segments[2].className).toContain(STATE_CLASSES.error.solidBg);
  });

  it('clamps small segments to MIN_SEG_PX and shrinks larger ones proportionally', () => {
    render(<MinimapStripe {...baseProps} />);
    const segments = screen.getAllByTestId('minimap-segment');
    const heights = segments.map((el) => parseFloat((el as HTMLElement).style.height));
    // Error segment (30px of 360 → 8.3% → ~30px) is below MIN_SEG_PX (16); gets clamped to ≥16
    expect(heights[2]).toBeGreaterThanOrEqual(MIN_SEG_PX);
    // Total fills the stripe
    const total = heights.reduce((a, b) => a + b, 0);
    expect(Math.round(total)).toBe(360);
  });

  it('has stripe width === STRIPE_WIDTH px', () => {
    const { container } = render(<MinimapStripe {...baseProps} />);
    const stripe = container.querySelector('[data-testid="minimap-stripe"]') as HTMLElement;
    expect(stripe).not.toBeNull();
    expect(stripe.style.width).toBe(`${STRIPE_WIDTH}px`);
  });

  it('renders nothing when sections is empty', () => {
    const { container } = render(<MinimapStripe {...baseProps} sections={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run --workspace=crew-dashboard -- MinimapStripe
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the segments-only skeleton**

`MinimapStripe.tsx`:

```tsx
import type { AgentState } from '../../data/types.js';
import { STATE_CLASSES } from '../../data/state-meta.js';
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
export function MinimapStripe({ sections, stripeHeight, onSectionJump }: MinimapStripeProps) {
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
 * - Renormalize: scale unclamped segments down so the total equals stripeHeight
 *
 * Trade-off acknowledged in spec: under heavy clamping, the segment boundaries
 * drift from the native scrollbar's thumb position by O(clamped-px). Acceptable.
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

  // Raw proportional shares
  const raw = sections.map((s) => (Math.max(s.height, 0) / total) * stripeHeight);

  // Apply min-clamp: any segment below MIN_SEG_PX is bumped up
  const clampedFlags = raw.map((h) => h < MIN_SEG_PX);
  const clampedSum = clampedFlags.reduce((sum, isClamped, i) => sum + (isClamped ? MIN_SEG_PX : 0), 0);
  const unclampedSum = raw.reduce((sum, h, i) => sum + (clampedFlags[i] ? 0 : h), 0);
  const remainingForUnclamped = Math.max(0, stripeHeight - clampedSum);
  const unclampedScale = unclampedSum > 0 ? remainingForUnclamped / unclampedSum : 0;

  return raw.map((h, i) => (clampedFlags[i] ? MIN_SEG_PX : h * unclampedScale));
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

```bash
npm run test:run --workspace=crew-dashboard -- MinimapStripe
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/MinimapStripe.tsx \
        packages/dashboard/src/components/Timeline/MinimapStripe.test.tsx
git commit -m "feat(dashboard): MinimapStripe segments + clamp+normalize sizing (CREW-194)

8px parallel stripe positioned just left of the native scrollbar.
Segments proportional to section pixel height; small ones clamped to
16px; total normalized to stripe height. No viewport indicator (native
scrollbar thumb handles that). Hover/click come in Tasks 5-6."
```

---

## Task 5: `MinimapStripe` hover tooltip

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/MinimapStripe.tsx`
- Modify: `packages/dashboard/src/components/Timeline/MinimapStripe.test.tsx`

- [ ] **Step 1: Write failing tooltip tests**

Add to `MinimapStripe.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event';

// ... inside describe('MinimapStripe', ...)

it('shows a tooltip on hover with the section label, timestamp, and event count', async () => {
  const user = userEvent.setup();
  render(<MinimapStripe {...baseProps} />);
  const segments = screen.getAllByTestId('minimap-segment');
  await user.hover(segments[1]); // waiting
  const tooltip = await screen.findByTestId('minimap-tooltip');
  expect(tooltip).toHaveTextContent(/Waiting/);
  expect(tooltip).toHaveTextContent(/14:42:00/);
  expect(tooltip).toHaveTextContent(/2 events/);
});

it('hides the tooltip when the pointer leaves the segment', async () => {
  const user = userEvent.setup();
  render(<MinimapStripe {...baseProps} />);
  const segments = screen.getAllByTestId('minimap-segment');
  await user.hover(segments[0]);
  expect(screen.queryByTestId('minimap-tooltip')).toBeInTheDocument();
  await user.unhover(segments[0]);
  expect(screen.queryByTestId('minimap-tooltip')).not.toBeInTheDocument();
});

it('pluralizes "1 event" / "N events" correctly', async () => {
  const user = userEvent.setup();
  render(<MinimapStripe {...baseProps} />);
  const segments = screen.getAllByTestId('minimap-segment');
  await user.hover(segments[2]); // error section, eventCount=1
  const tooltip = await screen.findByTestId('minimap-tooltip');
  expect(tooltip).toHaveTextContent(/1 event(?!s)/);
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- MinimapStripe
```

Expected: FAIL — no tooltip element.

- [ ] **Step 3: Add hover state + tooltip rendering**

In `MinimapStripe.tsx`:

```tsx
import { useState } from 'react';
import { STATE_META } from '../../data/state-meta.js';

// ... inside MinimapStripe component, after `const segments = ...`:
const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

// Compute tooltip top from cumulative segment heights up to hoveredIdx + half of that segment
const tooltipTop = hoveredIdx === null ? 0 :
  segments.slice(0, hoveredIdx).reduce((sum, h) => sum + h, 0) + segments[hoveredIdx] / 2;

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
        onMouseEnter={() => setHoveredIdx(i)}
        onMouseLeave={() => setHoveredIdx(null)}
      />
    ))}
    {hoveredIdx !== null && (
      <MinimapTooltip
        section={sections[hoveredIdx]}
        top={tooltipTop}
      />
    )}
  </div>
);
```

Add the `MinimapTooltip` subcomponent at the bottom of the same file:

```tsx
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
      <span className="tabular-nums">{count} event{count === 1 ? '' : 's'}</span>
    </div>
  );
}
```

- [ ] **Step 4: Re-run the tests**

```bash
npm run test:run --workspace=crew-dashboard -- MinimapStripe
```

Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/MinimapStripe.tsx \
        packages/dashboard/src/components/Timeline/MinimapStripe.test.tsx
git commit -m "feat(dashboard): MinimapStripe hover tooltip (CREW-194)

\"<State label> · HH:MM:SS · N events\" tooltip positioned to the left
of the hovered segment, vertically centered on it. Pluralization handled."
```

---

## Task 6: Click-to-jump + keyboard navigation

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/MinimapStripe.tsx`
- Modify: `packages/dashboard/src/components/Timeline/MinimapStripe.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Add to `MinimapStripe.test.tsx`:

```tsx
it('calls onSectionJump(idx) when a segment is clicked', async () => {
  const user = userEvent.setup();
  const onSectionJump = vi.fn();
  render(<MinimapStripe {...baseProps} onSectionJump={onSectionJump} />);
  const segments = screen.getAllByTestId('minimap-segment');
  await user.click(segments[1]);
  expect(onSectionJump).toHaveBeenCalledExactlyOnceWith(1);
});

it('is keyboard focusable and moves between sections with arrow keys', async () => {
  const user = userEvent.setup();
  const onSectionJump = vi.fn();
  render(<MinimapStripe {...baseProps} onSectionJump={onSectionJump} />);
  const stripe = screen.getByTestId('minimap-stripe');
  expect(stripe).toHaveAttribute('tabindex', '0');
  stripe.focus();
  await user.keyboard('{ArrowDown}');
  expect(onSectionJump).toHaveBeenLastCalledWith(0); // first section
  await user.keyboard('{ArrowDown}');
  expect(onSectionJump).toHaveBeenLastCalledWith(1);
  await user.keyboard('{ArrowDown}');
  expect(onSectionJump).toHaveBeenLastCalledWith(2);
  await user.keyboard('{ArrowDown}');
  // At last section already, no further movement
  expect(onSectionJump).toHaveBeenCalledTimes(3);
  await user.keyboard('{ArrowUp}');
  expect(onSectionJump).toHaveBeenLastCalledWith(1);
});

it('Home/End jump to first/last section', async () => {
  const user = userEvent.setup();
  const onSectionJump = vi.fn();
  render(<MinimapStripe {...baseProps} onSectionJump={onSectionJump} />);
  const stripe = screen.getByTestId('minimap-stripe');
  stripe.focus();
  await user.keyboard('{End}');
  expect(onSectionJump).toHaveBeenLastCalledWith(2);
  await user.keyboard('{Home}');
  expect(onSectionJump).toHaveBeenLastCalledWith(0);
});

it('exposes accessible role + label for assistive tech', () => {
  render(<MinimapStripe {...baseProps} />);
  const stripe = screen.getByTestId('minimap-stripe');
  expect(stripe).toHaveAttribute('role', 'listbox');
  expect(stripe).toHaveAccessibleName(/timeline minimap/i);
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- MinimapStripe
```

Expected: FAIL — no click handler, no keyboard, no role/label.

- [ ] **Step 3: Wire click + keyboard + a11y**

Modify the outer `<div data-testid="minimap-stripe">` in `MinimapStripe.tsx`:

```tsx
const [activeIdx, setActiveIdx] = useState<number>(-1);  // last-jumped index, for keyboard cursor

const onKeyDown = (e: React.KeyboardEvent) => {
  const last = sections.length - 1;
  let nextIdx = activeIdx;
  if (e.key === 'ArrowDown') nextIdx = Math.min(activeIdx + 1, last);
  else if (e.key === 'ArrowUp') nextIdx = Math.max(activeIdx - 1, 0);
  else if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = last;
  else return;
  e.preventDefault();
  if (nextIdx !== activeIdx) {
    setActiveIdx(nextIdx);
    onSectionJump(nextIdx);
  }
};

return (
  <div
    data-testid="minimap-stripe"
    role="listbox"
    aria-label="Timeline minimap — click a section or use arrow keys to navigate"
    tabIndex={0}
    onKeyDown={onKeyDown}
    className="absolute top-0 bottom-0 z-10 flex flex-col outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
    style={{ right: `${SCROLLBAR_GUTTER}px`, width: `${STRIPE_WIDTH}px` }}
  >
    {sections.map((sec, i) => (
      <button
        key={i}
        type="button"
        data-testid="minimap-segment"
        data-state={sec.state}
        aria-label={`${STATE_META[sec.state].label} section, ${sec.eventCount} event${sec.eventCount === 1 ? '' : 's'}`}
        className={cn('w-full cursor-pointer', STATE_CLASSES[sec.state].solidBg)}
        style={{ height: `${segments[i]}px` }}
        onMouseEnter={() => setHoveredIdx(i)}
        onMouseLeave={() => setHoveredIdx(null)}
        onClick={() => {
          setActiveIdx(i);
          onSectionJump(i);
        }}
      />
    ))}
    {hoveredIdx !== null && (
      <MinimapTooltip section={sections[hoveredIdx]} top={tooltipTop} />
    )}
  </div>
);
```

Note: keyboard ArrowDown from `activeIdx = -1` (initial) goes to `0`, which is the expected "first arrow press = first section" behavior.

- [ ] **Step 4: Re-run the tests**

```bash
npm run test:run --workspace=crew-dashboard -- MinimapStripe
```

Expected: PASS (12/12).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/MinimapStripe.tsx \
        packages/dashboard/src/components/Timeline/MinimapStripe.test.tsx
git commit -m "feat(dashboard): MinimapStripe click + keyboard navigation (CREW-194)

Click a segment fires onSectionJump(idx). Stripe is tabbable; ArrowUp/Down
move to neighbor; Home/End jump to first/last. role=listbox + aria-label
for assistive tech. Segments become buttons with per-segment aria-label."
```

---

## Task 7: Wire `MinimapStripe` into `Timeline.tsx` + smooth scroll + live mode break

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.test.tsx`

- [ ] **Step 1: Write failing integration test**

Add to `Timeline.test.tsx`:

```tsx
it('mounts MinimapStripe alongside the scroll viewport when there are sections', () => {
  setupQueryMock({ events: [/* enough to make sections */], transitions: [/* at least one transition */] });
  render(<Timeline agentKey="CREW-102" agentState="running" />);
  expect(screen.queryByTestId('minimap-stripe')).toBeInTheDocument();
});

it('does not mount MinimapStripe when there are no events', () => {
  setupQueryMock({ events: [], transitions: [] });
  render(<Timeline agentKey="CREW-102" agentState="running" />);
  expect(screen.queryByTestId('minimap-stripe')).not.toBeInTheDocument();
});

it('breaks live mode when a minimap segment is clicked', async () => {
  const user = userEvent.setup();
  setupQueryMock({ events: [/* ... */], transitions: [/* ... */] });
  render(<Timeline agentKey="CREW-102" agentState="running" />);
  // Verify live mode starts ON for a running agent
  const liveToggle = screen.getByRole('button', { name: /live/i });
  expect(liveToggle).toHaveAttribute('aria-pressed', 'true');
  // Click a minimap segment
  const segments = screen.getAllByTestId('minimap-segment');
  await user.click(segments[0]);
  // Live mode should now be OFF
  expect(liveToggle).toHaveAttribute('aria-pressed', 'false');
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- Timeline.test
```

Expected: FAIL — no MinimapStripe rendered.

- [ ] **Step 3: Wire MinimapStripe in `Timeline.tsx`**

Add to imports:

```tsx
import { MinimapStripe, JUMP_DURATION_MS } from './MinimapStripe.js';
import { useSectionHeights } from './useSectionHeights.js';
```

Inside the `Timeline` component, after `sections` is computed:

```tsx
const { heights: sectionHeights, refFor: sectionRefFor } = useSectionHeights(sections.length);
const [stripeHeight, setStripeHeight] = useState(0);

// Observe the scroll viewport's clientHeight for the stripe to match.
useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;
  const ro = new ResizeObserver(([entry]) => {
    setStripeHeight(entry.contentRect.height);
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);

const minimapSections = useMemo(
  () => sections.map((s, i) => ({
    state: s.state,
    startedAt: s.startedAt,
    eventCount: s.events.length,
    height: sectionHeights[i] ?? 0,
  })),
  [sections, sectionHeights],
);

const onSectionJump = useCallback((idx: number) => {
  const sectionEls = scrollRef.current?.querySelectorAll('[data-testid="timeline-section"]');
  const target = sectionEls?.[idx] as HTMLElement | undefined;
  if (!target || !scrollRef.current) return;
  const offset = target.offsetTop - (scrollRef.current.querySelector('[data-testid="timeline-toolbar"]')?.clientHeight ?? 0);
  scrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
  if (liveMode) setLiveMode(false);
}, [liveMode]);
```

In the JSX, attach `sectionRefFor(i)` as a ref on each `<TimelineSection>` (via a wrapping `<div ref>` since TimelineSection doesn't forward refs):

```tsx
<div ref={sectionRefFor(i)} key={key}>
  <TimelineSection
    state={s.state}
    {/* ... */}
  >
    {/* ... */}
  </TimelineSection>
</div>
```

Where the map iteration's `(s, i)` is exposed (refactor the existing `sections.map((s) => {...})` to `sections.map((s, i) => {...})`).

Mount the MinimapStripe just before the closing `</div>` of the outer container:

```tsx
{sections.length > 0 && (
  <MinimapStripe
    sections={minimapSections}
    stripeHeight={stripeHeight}
    onSectionJump={onSectionJump}
  />
)}
```

It's `absolute`-positioned inside the outer `relative` container, so it floats over the scroll viewport's right edge.

- [ ] **Step 4: Re-run all Timeline tests**

```bash
npm run test:run --workspace=crew-dashboard -- Timeline.test
```

Expected: PASS (existing + 3 new = all pass).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/Timeline.tsx \
        packages/dashboard/src/components/Timeline/Timeline.test.tsx
git commit -m "feat(dashboard): wire MinimapStripe into Timeline + smooth scroll on jump (CREW-194)

ResizeObserver tracks both per-section heights (via useSectionHeights)
and the scroll viewport's clientHeight (for stripe sizing). Click on a
segment scrolls smoothly to that section, accounting for the sticky
toolbar's height. Live mode auto-breaks on click since the user is
exploring past content."
```

---

## Task 8: Doc registration + visual fidelity report

**Files:**
- Modify: `.agents/design-system.md`
- Create: `docs/visual-fidelity-reports/CREW-194.md`

- [ ] **Step 1: Register `MinimapStripe` in the composites table**

In `.agents/design-system.md`, find the composites table (under "Composites" or similar heading) and add a row:

```markdown
| `MinimapStripe` | (no Figma component — feature-internal) | `packages/dashboard/src/components/Timeline/MinimapStripe.tsx` |
```

Bump `last_updated: 2026-05-23` in the frontmatter if not already today.

- [ ] **Step 2: Run agents-doc-parity-check skill manually to confirm clean**

```bash
# Use the skill via slash command in interactive session,
# or grep covers globs to confirm the doc covers Timeline/
grep -l "Timeline" .agents/*.md
```

Expected: `design-system.md` covers `packages/dashboard/src/components/**`, including the new files. Clean.

- [ ] **Step 3: Run the dashboard locally and visually verify**

```bash
crew dev   # or whatever the local launcher is for this worktree
```

Open the dashboard in browser, navigate to the CREW-102 fixture agent, confirm:
- DrawerHeader stays visible at the top.
- Timeline toolbar sticks at the top of the scroll region.
- Scrolling reveals all events in long sections (no clipping).
- Native scrollbar visible at the right edge.
- 8px colored stripe visible just to the left of the native scrollbar.
- Stripe segments colored by section state.
- Hover on a stripe segment → tooltip appears.
- Click on a stripe segment → smooth scrolls to that section.
- Live mode auto-breaks after a click.

- [ ] **Step 4: Run `visual-fidelity-check` skill and write the report**

Run the skill against the CREW-102 fixture; capture the report at `docs/visual-fidelity-reports/CREW-194.md`. Expected: 0 high, 0-1 medium findings.

- [ ] **Step 5: Commit**

```bash
git add .agents/design-system.md docs/visual-fidelity-reports/CREW-194.md
git commit -m "docs(crew-194): register MinimapStripe composite + visual-fidelity report"
```

---

## Task 9: e2e coverage

**Files:**
- Modify: `packages/dashboard/tests/e2e/agent-drawer.spec.ts`

- [ ] **Step 1: Add e2e cases for the new behavior**

```ts
test('long section is fully scrollable (no overflow-hidden clip)', async ({ page }) => {
  await page.goto('/#/agent/CREW-102');
  await expect(page.getByTestId('drawer-header')).toBeVisible();
  const section = page.getByTestId('timeline-section').first();
  await expect(section).toBeVisible();
  const lastRowBefore = await page.getByTestId('transcript-row').last().textContent();
  await page.evaluate(() => {
    const scrollable = document.querySelector('.overflow-y-auto') as HTMLElement;
    scrollable.scrollTop = scrollable.scrollHeight;
  });
  await expect(page.getByTestId('transcript-row').last()).toBeVisible();
});

test('timeline toolbar sticks at top while scrolling', async ({ page }) => {
  await page.goto('/#/agent/CREW-102');
  const toolbar = page.getByTestId('timeline-toolbar');
  await expect(toolbar).toBeVisible();
  await page.evaluate(() => {
    const scrollable = document.querySelector('.overflow-y-auto') as HTMLElement;
    scrollable.scrollTop = scrollable.scrollHeight;
  });
  await expect(toolbar).toBeInViewport();
});

test('minimap segment click smooth-scrolls to that section', async ({ page }) => {
  await page.goto('/#/agent/CREW-102');
  const segments = page.getByTestId('minimap-segment');
  await expect(segments.first()).toBeVisible();
  // Click last segment — should scroll the viewport to that section
  await segments.last().click();
  // After smooth scroll completes, the last section should be in view
  await page.waitForTimeout(400); // > JUMP_DURATION_MS (250) + buffer
  await expect(page.getByTestId('timeline-section').last()).toBeInViewport();
});
```

- [ ] **Step 2: Run e2e**

```bash
npm run test:e2e --workspace=crew-dashboard -- agent-drawer.spec.ts
```

Expected: all three new tests PASS; pre-existing agent-drawer cases continue to PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/tests/e2e/agent-drawer.spec.ts
git commit -m "test(e2e): scroll + sticky toolbar + minimap click in agent drawer (CREW-194)"
```

---

## Final verification checklist

Before opening the PR:

- [ ] `npm run lint` — green
- [ ] `npm run format:check` — green
- [ ] `npm run typecheck` — green
- [ ] `npm run test:run` — all dashboard tests pass
- [ ] `npm run test:e2e` — agent-drawer.spec.ts green (other pre-existing e2e failures noted but not introduced by this PR)
- [ ] `agents-doc-parity-check` skill — clean
- [ ] `visual-fidelity-check` skill — report at `docs/visual-fidelity-reports/CREW-194.md`, 0 high, ≤1 medium

PR title: `feat(dashboard): drawer Timeline scroll + minimap scrollbar (CREW-194)`
PR body: reference spec + plan + visual-fidelity report.
