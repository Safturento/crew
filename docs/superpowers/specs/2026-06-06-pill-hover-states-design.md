# Pill/Button hover states — design

**Date:** 2026-06-06
**Type:** In-session design-system work (Figma DS + dashboard code). No Jira ticket — per the
"design work skips Jira" convention, the back half is in-session phased execution with the user
as visual judge, not an autonomous `crew run` dispatch.
**Origin:** Item #1 of the 2026-06-05 dashboard worklist; reminder `button-pill-hover-states`.

## Goal

Give the unified Pill/Button set hover states. Buttons always get hover; Pills get it only when
they are interactable. The lift must read cleanly against the dark theme.

## Mechanism — no new public API

Hover is *derived*, not configured. `PillBase` already renders an interactive element for
interactable pills (`as="button"`) and the asChild slot for links/custom triggers, vs a plain
`span` for static pills. That distinction **is** "interactable":

```ts
const interactive = as === 'button' || asChild;
```

`PillBase` passes that flag into the surface-class builder. Static `span` pills never receive
hover utilities. No new prop on `Pill`, `Button`, or `PillBase`.

`pillSurfaceClasses` gains a trailing boolean:

```ts
pillSurfaceClasses(color, intensity, toolColor?, hover = false)
```

The only call site is `PillBase`; `pill-variants.test.ts` is the only other reference.

## Per-intensity lift

The intensity surfaces are solid custom dark hex shades (`--color-slate-1050: #1c2538`, etc.),
not opacity overlays. The lift is a CSS brightness filter, which is color-agnostic — it works on
all 8 colors (7 states + `white`) and the tool-color palette without any new tokens. `hover:` is
prefixed onto the existing token strings where a surface needs to *appear*.

| intensity | resting               | hover                                   |
| --------- | --------------------- | --------------------------------------- |
| ghost     | `text` + transparent  | acquires the muted surface (`hover:` + `t.bg`) |
| muted     | `text` + `t.bg`       | `hover:brightness-125`                  |
| mid       | `text` + `t.bg` + border | `hover:brightness-125`               |
| loud      | `textOnSolid` + solid `-400` | `hover:brightness-110` (tune/invert live) |

Why ghost differs: a brightness filter no-ops on a transparent surface (nothing to brighten), so
ghost instead *gains* the muted surface on hover.

Interactive elements also get `transition-[filter,background-color] duration-100` and
`cursor-pointer`. These apply only when `interactive` is true.

### Live-tuning notes (phase 2)

The `brightness-125` / `brightness-110` values and the `loud` direction are judged against the
live render, not guessed. `loud` is dark text on a light solid, so a >100% filter lightens the
text (toward lower contrast) — it may want a gentler value or an inverse (`brightness-95`,
darkening the surface). Decided visually with the user.

## Figma

A "Hover states" reference frame on the Composites page of the Crew file
(`9FeJPriqdsdA4n9R5Xsrr8`): per-intensity resting→hover swatch pairs, with the brightness-lifted
target baked as a **static fill** (Figma fills can't carry a live CSS filter), plus a caption
that the live mechanism is `hover:brightness-*`. This documents intent without doubling the
192-variant Pill set or misrepresenting a filter as a baked color. Built via the `figma-use`
skill; `figma-snapshot-refresh` afterward so `visual-fidelity-check` validates against current
data.

## Out of scope

- **focus-visible rings.** This change is hover-only per the reminder. A focus ring on
  interactive pills is natural to pair but is deferred — capture as a followup if it isn't picked
  up here.

## Execution phases (in-session)

1. **Code** — extend `pill-variants.ts` (hover param) + `pill-base.tsx` (derive `interactive`,
   pass flag, add transition/cursor); update `pill-variants.test.ts` to assert hover utilities
   present for interactive, absent for static.
2. **Live tuning** — run the dashboard; user judges the brightness values (esp. `loud`); adjust.
3. **Figma** — build the documentation frame; refresh the committed snapshot.
4. **Verify** — `visual-fidelity-check` + lint/typecheck/test; commit on `feat/pill-hover-states`.

## Verification

- `pill-variants.test.ts` asserts the hover branch for each intensity and that static pills emit
  no hover classes.
- Dashboard run with manual hover over a Button and an interactable Pill; screenshot against the
  dark theme.
- `visual-fidelity-check` and `superpowers:verification-before-completion` before claiming done.
