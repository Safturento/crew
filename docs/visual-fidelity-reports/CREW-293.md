# Visual fidelity report — CREW-293 (supervisor Stop/Restart controls)

**Date:** 2026-06-25
**Snapshot:** `.crew/figma-snapshot` (SupervisorCard = COMPONENT_SET `789:1190`, `composites/789-1190.png`)
**Touched UI:** `SupervisorCard.tsx` (JSDoc only), `RunnerPage.tsx` (wiring), `runnerControls.ts` (hooks)

## Scope of the change

CREW-293 is a **wiring** ticket. It does not change any rendered markup, Tailwind
class, cva variant, icon, or layout:

- `SupervisorCard.tsx` — the only edit is the props JSDoc comment. The button
  elements, their `color`/`intensity`/`size` props, and the `Row` layout are
  byte-for-byte unchanged from `origin/main`.
- `RunnerPage.tsx` — passes `onStop`/`onRestart` (enqueue hooks) and `onStart`
  (CLI-hint toast) into the existing `SupervisorCard` props. Passing handlers
  enables the already-rendered buttons; it does not change their variant props.
- `runnerControls.ts` — new data hooks (no markup).

## Structural check

PASS — no class/cva/token changes. `SupervisorCard` emits the same classes per
variant as the snapshot design: Restart `color="idle" intensity="muted"`, Stop
`color="error" intensity="muted"`, Start `color="running" intensity="mid"`.

## Caller check

PASS — `RunnerPage` does not override any button variant. The supervisor card's
button colors are defined inside `SupervisorCard` (unchanged), so the design
intent for each button's appearance is untouched by this ticket.

## Visual check

Rendered the live Runner page (dashboard @ :24564) in both supervisor states via
the SSE status injector and compared to `composites/789-1190.png`:

- **Online (`running`)** — `running` pill + gray **Restart** + red **Stop**.
  Matches the Figma top variant. The buttons are now enabled (previously
  disabled-dimmed); enabled is the design's natural state.
- **Offline (`down`)** — red `down` pill + **Start**. Matches the Figma bottom
  variant. Start is now enabled (cold-Start CLI hint on click).

No high-severity findings.

## Pre-existing note (not introduced by CREW-293)

The Start button is declared `color="running" intensity="mid"` in
`SupervisorCard.tsx` (pre-existing). Before this ticket the button was always
disabled (`opacity-40`), so its full color never showed; wiring `onStart` now
renders it at full intensity. This is the SupervisorCard component's own
pre-existing styling decision, not a CREW-293 change — restyling the Start
button is out of scope for a wiring ticket. The rendered Start reads as a
neutral/subtle pill consistent with the Figma `down`-state Start; flagged here
only for transparency.
