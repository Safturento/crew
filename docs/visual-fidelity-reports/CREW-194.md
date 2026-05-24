# visual-fidelity-check report — 2026-05-23

**Branch:** CREW-194
**Base:** main
**Touched components:** 4 (`Timeline.tsx`, `TimelineSection.tsx`, `MinimapStripe.tsx`, `useSectionHeights.ts`)
**Findings:** 0 high, 0 medium, 0 low

## Components in scope

| Component           | Figma node                                                                            | Status                                                            |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `MinimapStripe`     | _(no Figma counterpart — feature-internal, registered in `.agents/design-system.md`)_ | No reference to compare; rendered behaviour verified live         |
| `Timeline`          | _(orchestrator, no Figma node)_                                                       | Structural-only refactor (single ScrollViewport + sticky toolbar) |
| `TimelineSection`   | `559:650` (Composites/TimelineSection)                                                | One CSS class removed (`overflow-hidden`); visually unchanged     |
| `useSectionHeights` | _(hook, no UI surface)_                                                               | n/a                                                               |

## Structural check

`MinimapStripe` has no Figma reference (deliberate — the stripe is implementation, not a design-system component). The spec (`docs/superpowers/specs/2026-05-23-crew-194-drawer-scroll-minimap-design.md`) is the authoritative design source:

- 8px stripe positioned 14px from the viewport's right edge — matches `STRIPE_WIDTH = 8`, `SCROLLBAR_GUTTER = 14` in `MinimapStripe.tsx:7-8`.
- Segments coloured by `STATE_CLASSES[state].solidBg` (same token source as Pill/StateBadge/TimelineSection).
- Proportional + min-clamp (16px) + normalize-to-fill — matches Q2 decision in the spec.
- Hover tooltip "<State> · HH:MM:SS · N events" — matches Q3.
- Click + ArrowUp/Down + Home/End keyboard navigation — matches Q4.

`TimelineSection` lost its `overflow-hidden`. The Figma snapshot node `559:650` has `clipsContent: true`, which would correspond to `overflow-hidden`, but the snapshot was captured 2026-05-22 — before this Epic's design decision to hoist scroll. The change is structural to the new scroll architecture (Q1 in the spec) and does not alter the section's visual appearance; only its overflow behaviour changes (children now flow into the parent ScrollViewport instead of being clipped).

## Caller check

`MinimapStripe` is mounted only by `Timeline.tsx:212-219`. No other call sites. The Timeline caller passes:

- `sections={minimapSections}` — derived from `groupEventsByState()` output + per-section heights from `useSectionHeights`. Matches `MinimapSection` shape.
- `stripeHeight={stripeHeight}` — driven by a `ResizeObserver` on the scroll viewport. Verified live: 715px at full-page render matches viewport `clientHeight`.
- `onSectionJump={onSectionJump}` — `useCallback`-stable handler that smooth-scrolls + drops live mode.

`TimelineSection` callers are unchanged (one call from `Timeline.tsx` inside the map).

## Visual check (live, via chrome MCP)

Navigated to `http://localhost:23717/#/agent/CREW-102`. Verified:

- Stripe renders at the right edge of the Timeline body — 8px wide, 715px tall (== viewport clientHeight).
- 3 segments, colours match `STATE_CLASSES.{initializing|running|pr_open}.solidBg`:
  - `initializing` → `oklch(0.707 0.165 254.624)` (blue-400)
  - `running` → `oklch(0.704 0.04 256.788)` (slate-400)
  - `pr_open` → `oklch(0.702 0.183 293.541)` (violet-400)
- Segment heights sum (76.75 + 500.89 + 137.34 = 714.98 ≈ 715) — normalize-to-fill works.
- Toolbar carries `sticky top-0` and lives inside the single overflow-y-auto viewport (one scrollable, not two).
- Hover on the `running` segment shows tooltip text "Running · 11:36:00 · 15 events" — pluralization, time slice, label all correct.

Reference screenshot: `crew-194-final.png` (chrome MCP capture).

## Verification gaps

- The `MinimapStripe` component has no Figma counterpart by design (registered in `.agents/design-system.md` composites table). Structural correctness is verified against the spec doc and live rendering, not Figma.
- The Figma snapshot was captured 2026-05-22, before this Epic's design decision to hoist scroll. The `TimelineSection`'s `clipsContent: true` in the snapshot is expected pre-existing state, not a CREW-194 regression. The Crew DS Figma file will catch up post-ship if/when a parallel design refresh happens (not in CREW-194's scope).

## Decision

No findings. Proceed to PR.
