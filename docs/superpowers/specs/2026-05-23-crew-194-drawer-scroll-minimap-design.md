# CREW-194 — Drawer Timeline scroll architecture + minimap scrollbar design

**Ticket:** [CREW-194](https://safturento.atlassian.net/browse/CREW-194)
**Epic:** [CREW-189 — Agent drawer Timeline polish (post-CREW-188)](https://safturento.atlassian.net/browse/CREW-189)
**Brainstorm canvas:** [Figma — Brainstorm page](https://figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/?node-id=634-860)
**Date:** 2026-05-23

## Goal

Fix two coupled drawer Timeline problems with a single architectural change:

1. **Per-section `overflow-hidden` clips content.** Long state sections (e.g. a `running` section with 40 events) render only the first few rows; the rest are invisible. Added in CREW-185 to enable the section's left-border treatment, but the trade-off broke content visibility.
2. **Scroll bar carries zero positional context.** When a long run has multiple state sections, the native scrollbar is a generic thumb. A user reviewing a finished run can't see "this run had two error sections in the middle" at a glance, so they have to scroll the entire timeline to find them.

Solve both by **hoisting scroll out of `TimelineSection` up to the Timeline body** (toolbar stays sticky, `DrawerHeader` stays above the scroll), and **adding a colored parallel-stripe minimap scrollbar** whose segments are tinted by each section's state.

## Non-goals

- Drag-to-scrub on the minimap stripe.
- Animated transitions when sections collapse or filters apply.
- Virtualization of very long timelines (separate perf ticket).
- Mobile / narrow-viewport scrollbar treatment (dashboard is desktop-only today).
- Hiding or restyling the native browser scrollbar — keep it. The stripe sits alongside.

## Architecture overview

```
DrawerHeader                    (above scroll, always visible)
├─ project / ticket / status
└─ url / jira / worktree pills

Timeline                        (h-full, flex column)
├─ TimelineToolbar              (sticky top-0 inside scroll region)
│  └─ Filters / Search / Collapse all / LiveMode
└─ ScrollViewport               (flex-1 overflow-y-auto, native scrollbar enabled)
   ├─ Sections column           (left content area, NO overflow-hidden)
   │  └─ TimelineSection[]      (border-l-2 state color; content flows)
   │     ├─ Section header
   │     └─ TranscriptRow[]
   └─ MinimapStripe             (absolute, right edge, just left of native scrollbar gutter)
      └─ Segment[]              (one per section, color from state, height from clamped proportional sizing)
```

**Scroll boundary:** the `ScrollViewport` div. Browser-owned scroll mechanics — wheel, keyboard, drag on native scrollbar, touchpad momentum all work unchanged. The MinimapStripe is purely an overlay; it observes scroll state, it doesn't replace it.

## Design decisions (from 2026-05-23 brainstorm)

The brainstorm walked through five questions in order; each settled a downstream constraint. Decisions:

### Q1 — Custom scrollbar architecture
**Decision: Native scrollbar + parallel stripe.** Browser-owned scroll mechanics; the stripe is a separate DOM element positioned to the LEFT of the native scrollbar gutter (so the stripe doesn't overlap the thumb).

- *Rejected: hide native + render fully custom.* Owning drag / wheel / keyboard / touch-momentum / accessibility across browsers is non-trivial; library options (`overlayscrollbars-react`) mitigate but add a dependency. Visual gain isn't worth the implementation risk for v1.
- *Rejected: native + overlay on the same gutter.* Translucent colored bars on top of the scrollbar gutter create a thumb-vs-colors visual fight; either the thumb gets ugly bumping or the colors get muted to invisibility.

### Q2 — Minimap segment sizing
**Decision: Proportional with min-segment-height clamp (~16px).** Each segment's height is proportional to its section's pixel scroll height, but clamped to a minimum so tiny sections (e.g. a 1-event error) stay clickable + visible. Other segments shrink proportionally to compensate.

- *Rejected: strict proportional.* A 1-event error in a 100-event timeline becomes a ~3px segment — invisible and unclickable.
- *Rejected: equal share per section.* Decouples thumb position from segment colors, breaking the "minimap = scroll position" mental model.

### Q3 — Minimap visual treatment
**Decision: Informative (8px stripe + hover tooltip + active-section outline).**

- Stripe width: **8px** (slightly wider than v1's 4px to support the active outline and feel less anemic).
- Active section indicator: **1px white outline** around the segment currently in viewport. (No brightness diff between active and inactive — outline is enough; brightness changes feel less stable as the user scrolls.)
- Hover: **tooltip** showing `"<State label> · <HH:MM:SS> · <N> events"` (e.g. `"Waiting · 14:42:11 · 2 events"`). Tooltip positions to the LEFT of the segment (since the stripe is at the right edge of the drawer).
- Inactive segments: rendered at 100% opacity (no muted-vs-active brightness — saves us from re-thinking color contrast logic).

- *Rejected: minimal (4px, no hover).* Doesn't tell users what each color means; relies on tribal knowledge of state colors.
- *Rejected: rich (12px+ with always-visible labels).* Eats horizontal space; labels need a legend; brackets fighting with segment color.

### Q4 — Interactions
**Decision: Click-to-jump + keyboard, no drag.**

- Click on segment → smooth scroll (~250ms) to that section's first row.
- Stripe is focusable (`tabindex="0"`); arrow keys move between segments (Up/Down jumps to prev/next section's first row).
- Hover → tooltip per Q3.
- **Live mode breaks on click.** Reasoning: clicking the minimap means the user is exploring past content; auto-scroll to latest would yank them back. Calling `setLiveMode(false)` on click matches the user's intent.
- *No drag-to-scrub.* Avoids drag-vs-click disambiguation, momentum management, and edge cases. Can be added in a follow-up if users ask for it.

### Q5 — Edge case transitions
**Decision: Snap, no animation.**

- When a TimelineSection collapses, its scroll height shrinks → its minimap segment shrinks correspondingly (other segments grow to fill). **Instant**, no transition.
- When filters hide events in a section, the section's content shrinks → segment shrinks. **Instant.**
- When a filter removes all events from a section, the section header still renders (event count goes to 0), so the segment shrinks to the header's height (clamped to min-height per Q2). The minimap never has "gap" — every section that exists in the DOM has a segment.
- New events in live mode → active section's content grows → its segment grows in real time (driven by ResizeObserver per Q below).

Skipped because no real choice:
- *One section dominates (~90% of timeline).* Acceptable — that's the truth about that run. Min-clamp ensures the other sections remain visible/clickable.
- *Empty timeline.* MinimapStripe renders nothing; `sections.length === 0` early-returns.

## Component design

### `Timeline.tsx` — refactor

Current shape (`Timeline.tsx:139-205`):

```tsx
<div className="relative flex h-full min-h-0 flex-col">
  <TimelineToolbar ... />                               // not sticky
  {events.length === 0 ? <EmptyState /> :
   filteredEvents.length === 0 ? <FilterEmptyState /> :
   <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 py-1">
     {sections.map(s => <TimelineSection ...>{rows}</TimelineSection>)}
   </div>}
  {newEventsPill}
</div>
```

Target shape:

```tsx
<div className="relative flex h-full min-h-0 flex-col">
  {/* ScrollViewport contains both toolbar (sticky) and sections (scrolling) */}
  <div ref={scrollRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
    <TimelineToolbar className="sticky top-0 z-10 bg-card" ... />
    <div className="flex flex-col gap-2 px-1 py-1">
      {sections.map(s => (
        <TimelineSection ref={...} ...>{rows}</TimelineSection>  // refs collected for measurement
      ))}
    </div>
    {/* Empty states render inside the scroll region but outside the section column */}
  </div>
  <MinimapStripe sections={sectionMetas} scrollRef={scrollRef} liveMode={liveMode} onJumpClick={...} />
  {newEventsPill}
</div>
```

Key changes:
- Single `scrollRef` div wraps toolbar + sections. Toolbar uses `sticky top-0` to remain visible while the section column scrolls beneath it.
- Section column gets a flat `flex flex-col` container (was the scroll container before).
- MinimapStripe is positioned `absolute` against the outer `relative` parent, sitting just to the left of where the native scrollbar appears (browser-dependent; ~14-16px from right edge).

### `TimelineSection.tsx` — minor

Drop `overflow-hidden`. The state-color left border (`border-l-2 ${STATE_CLASSES[state].solidBorder}`) doesn't need overflow clipping; it renders fine on a non-overflow-hidden element.

```tsx
// Before
<section className={`overflow-hidden border-l-2 ${STATE_CLASSES[state].solidBorder}`}>
// After
<section className={`border-l-2 ${STATE_CLASSES[state].solidBorder}`}>
```

Section keeps its expand/collapse toggle logic untouched.

### `MinimapStripe.tsx` — new

New file at `packages/dashboard/src/components/Timeline/MinimapStripe.tsx`. Props:

```ts
interface MinimapStripeProps {
  sections: ReadonlyArray<{
    state: AgentState;       // for color via STATE_CLASSES[state].solidBg
    startedAt: number;       // for tooltip timestamp
    eventCount: number;      // for tooltip
    elementRef: RefObject<HTMLElement>;  // section's outer DOM ref for height measurement
  }>;
  scrollRef: RefObject<HTMLDivElement>;
  liveMode: boolean;
  onSectionJump: (sectionIdx: number) => void;  // breaks live mode if true; smooth-scrolls
}
```

Internal state:
- `sectionHeights: number[]` — observed via `ResizeObserver` per section element.
- `viewportRange: { top: number; bottom: number }` — observed via `scroll` event on `scrollRef.current`.
- `hoveredIdx: number | null` — for tooltip rendering.

Rendering:
- Outer absolute-positioned div: `right: 14px; top: 0; bottom: 0; width: 8px;` (left of native scrollbar gutter).
- Per section: compute `clamped = max(rawProportional, MIN_SEG_PX)`. Normalize so total = scroll content height (rebalance to preserve scroll-position fidelity).
- Render each segment as an absolute-positioned div using the running sum of clamped heights.
- Active segment (where `viewportRange.top` falls within its range): `outline: 1px solid white; outline-offset: -1px;` (inside-outline so it doesn't bump width).
- Hovered segment renders the tooltip positioned to its left.

Constants:
- `MIN_SEG_PX = 16` — minimum clamped segment height.
- `STRIPE_WIDTH = 8` — px.
- `SCROLLBAR_GUTTER = 14` — distance from right edge of viewport to leave the native scrollbar visible.
- `JUMP_DURATION_MS = 250` — smooth-scroll duration.

Smooth scroll: use the standard `element.scrollTo({ top, behavior: 'smooth' })`. No custom animation library.

Keyboard: `onKeyDown` on the stripe — ArrowUp/Down → onSectionJump(currentIdx ± 1); Home/End → first/last; PgUp/PgDn passed through to native scroll.

### Data flow

Section heights live in `Timeline.tsx` state as `sectionHeights: number[]`, populated by a `useResizeObserver`-style hook that observes each section's outer element. The hook collects refs via a `useRef-per-section` pattern OR by walking the scrollRef's children.

The minimap consumes `sectionHeights` + `scrollRef.current.scrollTop` + `scrollRef.current.clientHeight` to compute segment positions and the active-segment index.

Scroll position observation: standard `addEventListener('scroll', handler, { passive: true })` on the scroll container; throttled via `requestAnimationFrame`.

## Testing

### Unit
- `MinimapStripe.test.tsx`:
  - Renders N segments matching N sections.
  - Segment colors map to state via `STATE_CLASSES[state].solidBg`.
  - Min-clamp: a 1-event section in a 100-event timeline still renders ≥16px.
  - Active segment outline applies based on mocked scroll position.
  - Hover renders tooltip with correct format.
  - Click on segment calls `onSectionJump(idx)` and breaks live mode.
  - Keyboard ArrowUp/Down call `onSectionJump` with correct neighbors.
- `Timeline.test.tsx` updates:
  - Toolbar stays sticky in the scroll region (test via container CSS class assertion).
  - Section content not clipped (assert a section's `.scrollHeight > .clientHeight` is now `false` for the section itself).

### Integration / e2e
- `agent-drawer.spec.ts`:
  - Long timeline scrolls correctly; bottom-most event becomes visible after scrolling.
  - Click on minimap segment scrolls to that section.
  - Live mode auto-scroll still works.

### Visual fidelity
- `visual-fidelity-check` Step 5 against the CREW-102 populated fixture:
  - Minimap stripe present at right edge of Timeline scroll region.
  - Segment colors correspond to state-history sections.
  - Native scrollbar still visible alongside.
  - Active-segment outline updates as user scrolls.

## Out of scope (explicit deferrals)

- **Drag-to-scrub.** Single-click jump is enough for v1. Can be added later if users ask.
- **Animated transitions.** Snap-on-collapse/filter per Q5.
- **`overflowscrollbars-react` or similar library.** Native scrollbar is fine for v1.
- **Mobile / touch refinements.** Dashboard is desktop-only today.
- **Section sticky-pinning inside scroll** (sticky section headers as user scrolls past). Nice-to-have, separate ticket.
- **Virtualization.** Tracked as a separate perf ticket; not coupled to this work.
- **Cross-section keyboard shortcuts beyond Arrow.** No `g`/`G` jump-to-top/bottom or letter shortcuts.

## Risks

- **ResizeObserver thrash.** If the section content changes frequently (live mode adding events), the observer fires per-resize. Mitigate by throttling height updates via `requestAnimationFrame` in the resize callback.
- **Scrollbar gutter width varies by OS.** macOS auto-hides; Windows is typically ~17px; Linux varies by GTK theme. The `SCROLLBAR_GUTTER = 14` constant is a guess; may need to use `element.offsetWidth - element.clientWidth` to detect actual gutter and position the stripe accordingly.
- **Sticky toolbar + scroll container interaction.** `position: sticky` requires a non-`overflow:hidden` ancestor that's tall enough. The new `relative flex flex-col overflow-y-auto` should work but worth testing in Firefox.
- **Min-clamp breaks scroll-position fidelity.** With clamp, the thumb position no longer matches the segment colors 1:1 (other segments shrink to compensate). Tradeoff accepted per Q2 brainstorm — clickability wins over strict fidelity.

## Open questions

None as of spec write. All design questions settled in brainstorm.

## Followup work

- TranscriptRow virtualization for very long timelines (existing followup, separate ticket).
- Section sticky-pinning (worth surfacing as a followup if useful after this lands).
- Drag-to-scrub (post-launch if users ask).
