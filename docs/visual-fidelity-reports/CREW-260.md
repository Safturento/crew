# visual-fidelity-check report — 2026-06-19

**Branch:** CREW-260
**Base:** main (effective base: the post-CREW-259 tip this worktree was cut from)
**Touched components (under `componentDir`):** 2 — `DrawerHeader.tsx` (modified), `StateOverrideControl.tsx` (new)
**Findings:** 0 high, 0 medium, 1 low/judgment-call · 2 verification gaps (both expected — net-new affordance)

## Summary

CREW-260 adds an operator state-override control beside the drawer-header state badge. The
control is **net-new UI** — it is not present in the Crew Figma design (node `594:803`
`DrawerHeader` shows the badge followed directly by the meta list, no override affordance). The
change is purely additive and composes existing design-system primitives (`Button`, `ui/popover`,
`AlertModal`) per their established conventions, so the structural and caller checks pass against
those primitives even though the composite itself has no Figma node to diff against.

## Structural check

`StateOverrideControl` renders its trigger as `<Button color="idle" intensity="ghost" size="sm"
icon={<SlidersHorizontal/>} aria-label="Override state" />`. Verified the rendered computed styles
at `http://localhost:26642` (chrome MCP):

| Property        | Rendered                                              | Expected (DS `idle`/`ghost`/`sm`)    | Match |
| --------------- | ----------------------------------------------------- | ------------------------------------ | ----- |
| background      | `rgba(0,0,0,0)` (transparent)                         | ghost = transparent                  | ✓     |
| text/icon color | `oklch(0.554 0.046 257.417)` = slate-500              | `idle` family slate-500              | ✓     |
| height          | `32px`                                                | `sm` = `h-8`                         | ✓     |
| icon primitive  | real `<svg class="lucide lucide-sliders-horizontal">` | SVG, not Unicode/CSS stand-in        | ✓     |
| placement       | between `[role=status]` badge and the meta `<ul>`     | secondary affordance beside the pill | ✓     |

This is the same icon-button shape the header already uses for its Close (`X`, ghost) and Refresh-PR
controls, so it reads as a consistent secondary affordance rather than a new visual language.

## Caller check

`DrawerHeader.tsx:123` mounts `<StateOverrideControl agentKey={detail.key} state={detail.state} />`
between the state `Badge` and `MetaList` — matching the ticket's "next to the state Badge, styled as
a secondary affordance." The existing Badge + MetaList are untouched and still match Figma `594:803`.

## Low-severity findings / judgment calls

### Finding 1: `AlertModal` action color is `waiting` (amber), not the DS default `error` (red)

- **Kind:** caller
- **File:** `packages/dashboard/src/components/StateOverrideControl.tsx` (`actionColor="waiting"`)
- **Figma reference:** none — this confirm modal instance is net-new (no Figma node).
- **Rationale:** `AlertModal`'s default `actionColor` is `error` (red), tuned for destructive
  confirmations (e.g. "Remove project?"). A state override is a deliberate-but-recoverable operator
  action, not a destructive delete, so amber/caution reads more accurately than red/danger. The amber
  matches the `waiting` Pill color already in the system.
- **Recommendation:** accept as-is (deliberate semantic choice). Surfaced here for PR-review visibility.

## Verification gaps

- **`StateOverrideControl` has no `.figma.tsx` / snapshot node.** It is a net-new control the Figma
  design never included; there is nothing to diff its composite structure against. Verified instead
  via (a) reuse of DS primitives per convention and (b) rendered computed-style inspection above.
- **`DrawerHeader` node `594:803` predates this affordance.** The header's existing elements still
  match; the added control is additive and not represented in the snapshot. No regression to the
  parts the snapshot does cover.

## Decision

No high- or medium-severity findings. Proceed to PR. The single low finding (amber confirm action)
is a deliberate semantic choice surfaced for review; the two gaps are expected for net-new UI with no
Figma counterpart.
