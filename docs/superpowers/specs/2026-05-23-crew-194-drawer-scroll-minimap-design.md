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
**Decision: 8px stripe + hover tooltip. NO viewport indicator on the stripe itself.**

- Stripe width: **8px** (slightly wider than v1's 4px so the tooltip target feels comfortable and the colors aren't anemic).
- Segments: rendered at 100% opacity. No brightness/active variation per segment.
- Hover: **tooltip** showing `"<State label> · <HH:MM:SS> · <N> events"` (e.g. `"Waiting · 14:42:11 · 2 events"`). Tooltip positions to the LEFT of the segment (since the stripe is at the right edge of the drawer).
- **No viewport-range indicator on the stripe.** The native scrollbar thumb (just to the right of the stripe) already says "you are here"; layering a second indicator on the minimap would duplicate it. The user reads thumb position alongside segment colors to know which state they're currently viewing — that thumb-vs-segment alignment IS the indicator.

- *Rejected: 1px white outline around the "active" segment.* The viewport almost always spans multiple segments, so "the active one" is ill-defined; and a viewport-range overlay (the natural fix) duplicates the native scrollbar thumb.
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
  onSectionJump: (sectionIdx: number) => void;  // caller smooth-scrolls + breaks live mode
}
```

Internal state:
- `sectionHeights: number[]` — observed via `ResizeObserver` per section element.
- `hoveredIdx: number | null` — for tooltip rendering.

(No scroll-position state. The minimap doesn't render any viewport indicator; the native scrollbar thumb handles that. Big simplification — no `scroll` event listener, no `requestAnimationFrame` throttling.)

Rendering — the minimap is a **compressed representation of the entire timeline** that always fills the stripe height regardless of how much scroll content exists:

- Outer absolute-positioned div: `right: 14px; top: 0; bottom: 0; width: 8px;` (left of native scrollbar gutter).
- For each section: compute `clamped = max(section.scrollHeight, MIN_SEG_PX)`. Normalize so all clamped heights together fill the stripe height — i.e. scale by `stripeHeight / sum(clamped)`. Net effect: total segment heights = stripe height; small sections are bumped up to MIN_SEG_PX; large sections shrink proportionally to compensate.
- Render each segment as an absolute-positioned div at the running sum of normalized heights.
- On hover, render the tooltip to the left of the hovered segment.

Constants:
- `MIN_SEG_PX = 16` — minimum clamped segment height.
- `STRIPE_WIDTH = 8` — px.
- `SCROLLBAR_GUTTER = 14` — distance from right edge of viewport to leave the native scrollbar visible.
- `JUMP_DURATION_MS = 250` — smooth-scroll duration.

Smooth scroll: use the standard `element.scrollTo({ top, behavior: 'smooth' })`. No custom animation library.

Keyboard: `onKeyDown` on the stripe — ArrowUp/Down → onSectionJump(currentIdx ± 1); Home/End → first/last; PgUp/PgDn passed through to native scroll.

### Data flow

Section heights live in `Timeline.tsx` state as `sectionHeights: number[]`, populated by a `useResizeObserver`-style hook that observes each section's outer DOM element. The hook collects refs via a `useRef-per-section` pattern.

The minimap consumes `sectionHeights` only — it doesn't need scroll position at all. Segment heights are computed locally from the clamped + normalized formula above.

For `onSectionJump(idx)`: `Timeline.tsx` smooth-scrolls `scrollRef.current` to the matching section's `offsetTop` via `element.scrollTo({ top, behavior: 'smooth' })` and calls `setLiveMode(false)` if live mode was on.

No scroll event listener required — Q3's omission of the viewport indicator removed that data path entirely. (Live mode's existing auto-scroll behavior in `Timeline.tsx:111-121` already observes `filteredEvents.length` changes; that stays untouched.)

## Testing

### Unit
- `MinimapStripe.test.tsx`:
  - Renders N segments matching N sections.
  - Segment colors map to state via `STATE_CLASSES[state].solidBg`.
  - Min-clamp: a section that would render below `MIN_SEG_PX` is clamped to exactly `MIN_SEG_PX`; larger siblings shrink proportionally to keep the sum equal to stripe height.
  - Total segment height equals stripe height (sanity check on the normalization).
  - Hover renders tooltip with correct format `"<State> · HH:MM:SS · N events"`.
  - Click on segment calls `onSectionJump(idx)`.
  - Keyboard ArrowUp/Down call `onSectionJump` with the correct neighbor index.
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
- **Scrollbar gutter width varies by OS.** macOS auto-hides; Windows is typically ~17px; Linux varies by GTK theme. The `SCROLLBAR_GUTTER = 14` constant is a guess; better is to set `scrollbar-gutter: stable` on the scroll viewport and/or use `element.offsetWidth - element.clientWidth` to detect actual gutter and position the stripe accordingly.
- **Sticky toolbar + scroll container interaction.** `position: sticky` requires a non-`overflow:hidden` ancestor that's tall enough. The new `relative flex flex-col overflow-y-auto` should work but worth testing in Firefox.
- **Native scrollbar thumb vs minimap segment drift under min-clamp.** When small sections are bumped to `MIN_SEG_PX`, larger segments shrink to compensate. This means the thumb position (which the browser computes from pure proportional scroll math) won't align 1:1 with the same segment color on the minimap — there's a small drift. In the worst case (one ~1% segment in an otherwise-uniform timeline), drift can be ~15px out of 500. Acceptable per Q2; users still read "thumb is near the red region" with usable accuracy.

## Open questions

None as of spec write. All design questions settled in brainstorm.

## Followup work

- TranscriptRow virtualization for very long timelines (existing followup, separate ticket).
- Section sticky-pinning (worth surfacing as a followup if useful after this lands).
- Drag-to-scrub (post-launch if users ask).
