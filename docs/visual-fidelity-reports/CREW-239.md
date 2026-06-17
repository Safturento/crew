# visual-fidelity-check report — 2026-06-10

**Branch:** CREW-239
**Base:** main
**Touched components:** 3 (CondensedHeader new, AgentBody, Timeline)
**Findings:** 0 high, 0 medium, 0 low

## Scope

- `CondensedHeader.tsx` (new) — mapped to Figma node `706:1059` via `CondensedHeader.figma.tsx`; pinned-state mockup `707:1044`.
- `AgentBody.tsx` — structural change only (scroll container + sentinel + overlay mount); no token changes.
- `Timeline/Timeline.tsx` — toolbar gains `sticky z-10 h-12 bg-card` + top offset; minimap gains a sticky anchor. No new color/typography surfaces.

## Structural check — CondensedHeader vs node 706:1059

| Property      | Figma (enrichment)                             | Code (live computed style)                       | Match |
| ------------- | ---------------------------------------------- | ------------------------------------------------ | ----- |
| Height        | 44                                             | `h-11` → 44px                                    | ✓     |
| Fill          | `card -> slate/900` #0F172A                    | `bg-card` → oklch(0.208 0.042 265.755) = #0F172A | ✓     |
| Bottom stroke | `border -> slate/800` #1E293B, 1px bottom-only | `border-b border-slate-800` → 1px #1E293B        | ✓     |
| Padding       | L24 / R16                                      | `pl-6 pr-4` → 24px / 16px                        | ✓     |
| Item gap      | 8                                              | `gap-2` → 8px                                    | ✓     |
| Key text      | mono, muted                                    | Fira Code 12px slate-400                         | ✓     |
| Title text    | sans medium, truncating                        | 14px / 500 slate-200, `text-overflow: ellipsis`  | ✓     |

## Caller / instance check

- State badge — Figma instance `706:1042`: `type=pill, color=waiting, intensity=mid, font=mono, Icon=lucide/circle`. Code: `<Badge color={detail.state} intensity="mid" icon={<StateIcon />}>` — Badge is the pill type with `font-mono`; `StateIcon` wraps `lucide/circle`. ✓ (color is state-driven; the Figma sample shows `waiting`.)
- Close button — Figma instance `706:1052`: `type=button-icon-sm, color=running, intensity=ghost, Icon=lucide/x`. Code: `<Button color="running" intensity="ghost" size="sm" icon={<X aria-hidden />} aria-label="Close drawer">`. ✓ Drawer-mode only, per the design.

## Visual check (live, chrome MCP)

Rendered `#/agent/CREW-101` at scrollTop > header height: condensed header overlays the top (`position: absolute, z-20`, `condensed-in` 150ms), toolbar pinned at exactly 44px below it, minimap stripe pinned at 92px (= 44 + 48 chrome) sized to viewport − chrome. Matches mockup `707:1044`. Verified disappearance at scrollTop 0 and the no-close-button variant on `#/agent/CREW-101/full`.

## Verification gaps

- The snapshot's `raw` tier for `706:1059` is slim (no children), so the key/title TEXT-node tokens couldn't be read from the snapshot directly; verified against the rendered output + the component PNG instead.
