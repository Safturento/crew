# Visual fidelity report — CREW-221 (T9: runner health chip + log viewer)

**Date:** 2026-06-04
**Snapshot:** `.crew/figma-snapshot/` (page `Composites`)
**Touched components:** `RunnerStatusChip.tsx` (new), `RunnerLogViewer.tsx` (new), `TopNav.tsx` (mounts the chip).

## Summary

No high-severity findings. The chip and log viewer are **net-new UI with no Figma
source frame** — the design system was never extended with a runner chip, and the
Figma `TopNav` node (`245:133`) shows only BrandMark / Agents·Projects tabs /
Clear-attention / New Run. Both new components are assembled entirely from
existing, Figma-mapped DS primitives, so there is no Figma token to mismatch
against:

- **`RunnerStatusChip`** → renders the DS `Badge` (Pill, `type=badge`) with
  `color="pr_merged"` (emerald, healthy) when online and `color="idle"` (slate,
  muted) when offline, `intensity="mid"`, and the canonical `<StateIcon />`
  filled-disc in the `icon` slot. Both colors are valid `PillColor` /
  `PillIntensity` values resolved through `pillSurfaceClasses`, so the surface
  tokens come straight from the DS, and the badge's color (not a custom glyph)
  carries the online/offline state per the Pill icon-slot contract
  (`design-system.md` §"Pill visual pattern"). Verified live: emerald disc +
  "Runner" when online, muted slate when offline (worktree default).
- **`RunnerLogViewer`** → wraps the DS `Modal` composite (node-mapped) directly,
  passing `title="Runner logs"` and the log body as children. Title bar, border,
  radius, shadow, and close button are all inherited from `Modal` — matches the
  `Modal` Figma node by construction.

## Caller check

`TopNav` mounts `<RunnerStatusChip />` in the right-hand action cluster, before
"Clear attention". This is an **additive deviation** from the Figma `TopNav`
frame (which has no chip) — intentional product scope per the CREW-221 ticket /
plan Task T9, not a fidelity regression.

## Resolved during this pass

- **Status indicator** initially used a hand-rolled CSS `<span>` dot, which
  violates the documented Pill icon-slot contract ("the pill icon is a
  `ReactNode` `icon` prop … never a CSS-drawn dot" — `design-system.md` §179).
  Fixed before commit: the chip now passes `icon={<StateIcon />}` (the canonical
  filled-disc primitive the state badges use), with the badge color carrying the
  online/offline distinction. No remaining low-severity findings.

## Verification gap

No computed-style diff was run against a Figma node for the two new components
because **no corresponding Figma node exists** (the runner chip was never added
to the DS). Live render was confirmed via Playwright MCP screenshots (top-nav
chip in offline state + log viewer empty state). If a runner chip is added to the
Figma DS later, re-run this gate with `.figma.tsx` mappings for both components.
