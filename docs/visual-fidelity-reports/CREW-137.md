# visual-fidelity-check report — 2026-06-03

**Branch:** CREW-137
**Base:** main
**Touched components:** 4 new composites (Modal, AlertModal, ModalSelectionRow, Stepper) + 1 new primitive (alert-dialog)
**Findings:** 0 high, 0 medium (1 fixed in-scope), 2 low

## Summary

T3 ships four new modal-family composites with **no caller sites** (build-only, per
ticket scope — modal screens get wired in separate slices). Structural check ran
against the committed snapshot's `enrichment.boundVariables` (the strong signal — every
node had bound-variable color data). The caller check is N/A (no callers). The optional
live-DOM visual check (Step 5) has no navigable surface because the components aren't
mounted on any screen yet; see Verification gaps.

Node IDs verified present in `.crew/figma-snapshot/index.json`:
Modal `355:238`, AlertModal `373:413`, ModalSelectionRow `350:236`, Stepper `378:462`.

## Fixed in-scope (was medium)

### Modal + AlertModal corner radius

- **Kind:** structural
- **Files:** `Modal.tsx`, `AlertModal.tsx` (DialogContent / AlertDialogContent className)
- **Figma reference:** node `355:238` + `373:413`, `raw.cornerRadius = 14`
- **Diff:** both inherited the shadcn base `rounded-lg` (8px). Figma specifies 14px.
- **Fix applied:** added `rounded-[14px]` to both content classNames (twMerge overrides
  the base `rounded-lg`).

## Structural matches (no finding)

| Node                        | Property    | Figma (enrichment)                  | Code                              | ✓   |
| --------------------------- | ----------- | ----------------------------------- | --------------------------------- | --- |
| Modal `355:238`             | fill        | `background -> slate/950` `#020617` | `bg-slate-950`                    | ✓   |
| Modal `355:238`             | border      | `border -> slate/800`               | `border-border` (canonical token) | ✓   |
| Modal `355:238`             | width       | 560                                 | `w-[560px]`                       | ✓   |
| AlertModal `373:413`        | fill        | `background -> slate/950`           | `bg-slate-950`                    | ✓   |
| AlertModal `373:413`        | padding     | 22px all                            | `p-5.5` (22px)                    | ✓   |
| AlertModal `373:413`        | itemSpacing | 10                                  | `gap-2.5` (10px)                  | ✓   |
| AlertModal `373:413`        | width       | 440                                 | `w-[440px]`                       | ✓   |
| ModalSelectionRow `350:236` | radius      | 6                                   | `rounded-md` (6px)                | ✓   |
| ModalSelectionRow `350:236` | padding     | 16 L/R, 10 T/B                      | `px-4 py-2.5`                     | ✓   |
| ModalSelectionRow `350:236` | fill        | `card -> slate/900` `#0F172A`       | `bg-card`                         | ✓   |
| ModalSelectionRow `350:236` | border      | `border -> slate/800`               | `border-border`                   | ✓   |

AlertModal footer (Cancel `running/mid` + action `error/loud`) and the destructive
red action button match the screenshot at `373:413`. Stepper active-step styling matches
the snapshot render (bright foreground text + muted inactive, `·` / `›` separators) —
the plan's blue-pill active style does NOT match Figma and was deliberately not used.

## Low-severity / judgment calls

1. **ModalSelectionRow inner itemSpacing** — Figma `itemSpacing: 12` (gap-3) on the
   horizontal axis; code uses `justify-between` with `gap-2` (8px) inner clusters. Visually
   indistinguishable because `justify-between` pushes the two clusters to the edges; the
   12px only governs the meta↔badge gap. Accepted as-is. _Recommendation: accept._
2. **`border-border` resolves via the white-alpha overlay token in code**, while the
   snapshot enriches `border` to slate/800. This is the established systemic convention
   across every existing composite (DrawerHeader, ProjectRow, …) per `.agents/design-system.md`
   ("`border` aliases to white; consumers carry alpha"). Not specific to this PR. _Recommendation: accept — matching the house pattern is correct._

## Verification gaps

- **Live-DOM visual check (Step 5) not run** — the four composites have no caller sites
  in the app (build-only, by ticket design), so no screen renders them and there is no
  navigable surface for chrome-MCP DOM inspection. The required structural check ran fully
  against `enrichment.boundVariables`; visual confirmation was done by comparing the
  isolated component output to the per-node snapshot PNGs. The first slice that wires these
  composites into a screen should run the live-DOM check then.
- Composite nodes are `COMPONENT`/`COMPONENT_SET` (not `INSTANCE`), so
  `enrichment.componentProperties` is null — expected; `boundVariables` carried the
  load-bearing color data instead.
