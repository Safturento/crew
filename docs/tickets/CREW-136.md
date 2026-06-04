# CREW-136 — T2: Form composites (Switch + FormField)

Jira: https://safturento.atlassian.net/browse/CREW-136

## Goal

Add the remaining form-family composites from the consolidated Crew DS (Figma file
`9FeJPriqdsdA4n9R5Xsrr8`): a `Switch` primitive and a `FormField` composite
(`Label` + `Input` vertical stack). Components only — no live caller sites yet
(those follow when modal screens get wired, separate slices).

Re-scope 2026-06-03: original Task 2.2 (`Input` `leadingIcon` prop) already shipped
independently, so it is dropped. Remaining scope is plan Task 2.1 (Switch) +
Task 2.3 (FormField) from `docs/superpowers/plans/2026-05-12-ds-to-code-reconciliation.md`.

## Relevant files

- `packages/dashboard/src/components/ui/switch.tsx` — new Radix Switch primitive, Crew-styled (26×14 track, 12px thumb).
- `packages/dashboard/src/components/ui/switch.test.tsx` — on/off toggle behaviour.
- `packages/dashboard/src/components/ui/switch.figma.tsx` — Code Connect → Figma node `335:242`.
- `packages/dashboard/src/components/FormField.tsx` — new composite (uppercase Label + Input, auto `htmlFor`).
- `packages/dashboard/src/components/FormField.test.tsx` — label↔input association + prop passthrough.
- `packages/dashboard/src/components/FormField.figma.tsx` — Code Connect → Figma node `337:234`.

## Decisions

- **Switch hand-authored against the `radix-ui` barrel, not `npx shadcn add switch`.** The repo
  imports Radix via the `radix-ui` umbrella package (see `checkbox.tsx`, `label.tsx`), whereas
  shadcn's generator emits `@radix-ui/react-switch` imports. Following the existing convention keeps
  the dependency graph and import style consistent; the plan's "shadcn install" is an implementation
  detail, the deliverable is a working Switch primitive + Code Connect.
- **Switch colors pulled from the Figma node, not the shadcn default.** Track stays dark in both
  states (on `bg-blue-1050`, off `bg-secondary`); only the thumb changes (on `bg-blue-400`, off
  `bg-muted-foreground`). This differs from stock shadcn (which recolors the whole track).
- **FormField label at `text-[11px]` to match the Figma node** (the plan said `text-xs`/12px;
  the design source of truth is 11px). Caller passes natural-case text; the component applies
  `uppercase`.

## Tests

- Switch: renders unchecked by default, reflects `checked`, fires `onCheckedChange`, disabled blocks
  interaction (mirrors `checkbox.test.tsx`).
- FormField: label `htmlFor` matches the input `id` (auto-generated via `useId`, overridable), and
  `value`/`onChange` pass through to the inner `Input`.

## Notes

Dashboard-only change: no HTTP route (no `.bru` updates) and no daemon change. Bruno smoke is run as a
daemon-liveness sanity check per the run harness. Two new `.figma.tsx` files point at the consolidated
Crew file. Visual fidelity verified against `.crew/figma-snapshot` nodes `335:242` + `337:234`.
