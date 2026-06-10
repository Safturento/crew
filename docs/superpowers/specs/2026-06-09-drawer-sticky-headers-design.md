# Drawer sticky headers — design spec

**Date:** 2026-06-09
**Status:** Approved (brainstorm complete)
**Origin:** Reminder `drawer-sticky-headers` (2026-06-08), captured while manually testing a drawer-scroll fix.

## Problem

The agent drawer's timeline can run hundreds of lines deep. With the drawer becoming a single scroll container (see "Scroll-container baseline" below), two pieces of chrome scroll out of reach:

1. **Orientation** — once the full `DrawerHeader` scrolls away, nothing tells you which agent/ticket you're looking at.
2. **Timeline controls** — the filter/search toolbar scrolls away with the content it filters. Having to scroll all the way back up to search or filter a deep timeline is the motivating friction.

## Scroll-container baseline (folded-in working-tree changes)

Two uncommitted one-line changes from the 2026-06-08 session are part of this scope and land as the first implementation task:

- `packages/dashboard/src/components/AgentBody.tsx` — root gains `overflow-y-auto`, making it the single scroll container for the whole drawer body.
- `packages/dashboard/src/components/Timeline/Timeline.tsx` — root loses `h-full`, so the timeline grows naturally instead of being its own fixed-height scroll region.

These changes create the unified-scroll UX this design assumes — and they break the timeline's scroll machinery (see "Scroll machinery repointing"), which this design repairs.

## Decisions (settled during brainstorm)

- **Condensed header content:** one ~40px row — ticket key (mono, muted-foreground), truncated ticket title (sans, foreground), state badge, close button (drawer mode only).
- **Coexistence:** both sticky elements **stack** — condensed header pinned at top, timeline toolbar pinned directly beneath it. Both always reachable when deep in the timeline.
- **Scope:** both `AgentBody` modes — drawer and full page (`#/agent/:key/full`). The close button is gated per mode exactly as `DrawerHeader` gates it today.
- **Approach:** sticky-in-flow toolbar + sentinel-triggered condensed-header overlay (Approach A). Alternatives rejected: a pure-CSS "parking" header (negative-top sticky) distorts the resting header layout; reverting to dual scroll containers undoes the unified-scroll UX.

## Design

### 1. `CondensedHeader` component (new)

`packages/dashboard/src/components/CondensedHeader.tsx`.

- Props: `detail: AgentDetail`, `showCloseButton: boolean`, `onClose?: () => void` — mirroring `DrawerHeader`'s interface.
- Content: ticket key (Fira Code 12, `muted-foreground`), ticket title (`ticket_title ?? ticket_key`, Hanken Grotesk Medium 14, `foreground`, single line, `truncate`), state `Badge` with `StateIcon` (intensity `mid`), ghost icon `Button` with `X` for close.
- Visuals: `bg-card`, bottom border (`border`), horizontal padding matching the drawer (`px-6`), ~40–44px tall.
- Rendered by `AgentBody` as an overlay: `absolute top-0 inset-x-0 z-20` inside a new `relative` wrapper around the scroll container. It is **not** in scroll flow.

> Figma source of truth: `CondensedHeader` composite (node `706:1059`) and the pinned-state mockup (node `707:1044`), Composites page of the Crew file `9FeJPriqdsdA4n9R5Xsrr8`.

### 2. Appearance trigger (IntersectionObserver sentinel)

- A zero-height sentinel `div` sits at the bottom edge of `DrawerHeader` in the scroll flow.
- An IntersectionObserver with `root` = the scroll container watches it. Sentinel out of view → `showCondensed = true`; back in view → `false`.
- The condensed header conditionally renders with a quick fade/slide-in. No scroll-event listeners anywhere.

### 3. Sticky timeline toolbar

- `TimelineToolbar` becomes `position: sticky` in flow, `top` = condensed-header height, `z-10`, with opaque `bg-card` so content scrolls beneath it.
- The offset is a **constant**: the toolbar sits below the header in flow, so by the time the toolbar pins, the full header has long scrolled out and the condensed header is guaranteed visible. No coordination logic between the two sticky elements.

### 4. Scroll machinery repointing

`AgentBody` owns a ref to the scroll container and passes it into `Timeline` as a `scrollContainerRef` prop. Three consumers move from the timeline's now-defunct inner viewport (`scrollRef`) to the outer container:

1. **Live-mode autoscroll** — on new visible events, scrolls the outer container to its bottom.
2. **Minimap section-jump** — scrolls the outer container so the target section lands just below the pinned rows. `scroll-margin-top` on section wrappers (= condensed header + toolbar heights) handles the offset.
3. **Viewport `ResizeObserver`** — the observer sizing the minimap stripe observes the outer container's client height.

The timeline's inner `overflow-y-auto` viewport is removed; timeline content sits directly in the outer scroll flow.

### 5. Minimap stripe

The stripe must track the *visible* viewport, not the grown content height:

- Height = scroll-container client height minus pinned chrome (condensed header + toolbar).
- Pinned alongside the visible area via sticky positioning within the timeline region, hugging the right edge as today.
- Section proportions continue to come from the existing `useSectionHeights` measurements — unchanged.

### 6. Both modes

All behavior lives in `AgentBody`/`Timeline`, so drawer and full-page modes get identical treatment for free.

## Testing

- **Vitest + RTL** (existing setup), with a mocked IntersectionObserver:
  - Condensed header absent at rest; appears when the sentinel callback fires "not intersecting"; disappears on re-intersect.
  - Close button present in `drawer` mode, absent in `full` mode.
  - Live-mode autoscroll targets the outer scroll container.
  - Section-jump scrolls the outer container.
- **Visual:** `visual-fidelity-check` against the `CondensedHeader` Figma composite on completion (snapshot refreshed via `figma-snapshot-refresh` — new composite added this session).

## Out of scope

- Changes to the full `DrawerHeader` layout or content.
- Sticky behavior for `TokensByTool` / `FinishSteps`.
- Persisting scroll position across drawer open/close.
- Any daemon/API changes — this is dashboard-only.
