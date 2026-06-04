# visual-fidelity-check report — 2026-06-03

**Branch:** CREW-212
**Base:** main
**Touched components:** `Timeline/Timeline.tsx`, `Timeline/LiveModeToggle.tsx` (+ their `.test.tsx`, not analyzed)
**Findings:** 0 high, 0 medium, 1 low (0 pre-existing, 1 from this PR — accepted)

## Summary

CREW-212 is Timeline toolbar/layout polish. Per the ticket's acceptance
criteria there is **no Figma component for the Live toggle / TimelineToolbar
sub-parts** — `Timeline.tsx` and `LiveModeToggle.tsx` are feature-internal
(like `MinimapStripe`, documented "no Figma — feature-internal"). So the gate
verifies (a) the consumed DS `Switch` renders per its Figma node, and (b) the
behavioural goals — overlaps gone, content clears the stripe, pill gone,
toggle reads cleanly — rather than pixel-matching a screen reference.

## DS Switch consumption (Task 1)

`LiveModeToggle` now composes the DS `Switch` (`ui/switch.tsx`, Figma node
`335:242`). The Switch's own Code Connect `example`
(`ui/switch.figma.tsx`) is `<label class="inline-flex items-center gap-1.5
text-xs text-muted-foreground"><Switch/>{label}</label>` — and the Figma
component's sample label is literally **"Live"**. My implementation matches
that anatomy (`inline-flex items-center gap-1.5`, Switch + label, "Live").

**Live-DOM cross-check** (chrome MCP rendered-HTML + screenshot, plus
Playwright MCP computed styles, against the running app at `:26535`, CREW-101
= Running so live mode defaults ON):

- `data-slot="switch"` present, `role="switch"`, `aria-checked="true"`,
  accessible name "Live", thumb `data-state="checked"`.
- On-state renders dark-navy track (`bg-blue-1050`) + blue thumb-right
  (`bg-blue-400`) — matches the Figma `335:242` **on** screenshot
  (dark track, blue thumb right, "Live" label).

### Low — label uses `font-mono` (accepted)

- **Kind:** structural (caller-side styling choice)
- **File:** `packages/dashboard/src/components/Timeline/LiveModeToggle.tsx`
- **Code:** label className `font-mono text-xs leading-none text-muted-foreground`
- **Figma reference:** `335:242` Switch composite — label is the default sans.
- **Diff:** label renders in Fira Code mono instead of sans.
- **Decision:** **accept.** The Timeline toolbar is mono — the sibling search
  input computes to `"Fira Code", ui-monospace` too. Mono "Live" is consistent
  with the toolbar context; sans would be the outlier. Not a defect.

## Behavioural goals (Tasks 2-4) — verified via live DOM

- **Task 2 — toolbar lifted out of scroll viewport:** toolbar
  `position: static` (class `shrink-0 bg-card`, no `sticky top-0 z-10`); the
  minimap stripe's top (y≈422) starts exactly at the toolbar's bottom — no
  overlap with the toolbar or native scrollbar. e2e
  "timeline toolbar stays in view while scrolling the body" still passes.
- **Task 3 — content gutter:** the sections container (`pr-6`) clears the
  minimap stripe (`left: 1234px`) by 17px — no content runs under the stripe.
- **Task 4 — pill removed:** zero "new events" buttons in the rendered DOM.

## Verification gaps

- `Timeline.tsx` / `LiveModeToggle.tsx` have no `.figma.tsx` — by design
  (feature-internal), so there is no screen-level pixel reference. Expected
  per ticket AC, not a defect.
- chrome MCP `eval` (CDP `:9222`) was unreachable in this worktree; the chrome
  MCP `navigate` rendered-HTML + screenshot captures plus Playwright MCP
  `evaluate` (computed styles + geometry) covered Step 5's live-DOM check
  between them. Wiring diagnostic (`/tmp/crew-mcp-CREW-212.log`) showed the
  chrome MCP path resolved with no warnings.
