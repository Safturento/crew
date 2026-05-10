# CREW-125 — Phase 2: Code Connect mappings between Crew DS and shadcn primitives

Jira: https://safturento.atlassian.net/browse/CREW-125

Plan: `docs/superpowers/plans/2026-05-09-design-system-bootstrap-phases-1-3.md` — Phase 2, Task 2.16.

## Goal

Wire `@figma/code-connect` mappings so that selecting a Figma instance of one of the 7 shadcn primitives in a Crew DS-consuming file and asking for code returns real shadcn JSX with the correct CVA variant prop bindings — not generic Tailwind class soup.

## Relevant files

- `packages/dashboard/src/components/ui/{button,badge,input,dialog,label,separator,form}.tsx` — the 7 shadcn primitives to map.
- `packages/dashboard/components.json` — shadcn aliases (`@/components/ui`, `@/lib/utils`).
- `packages/dashboard/figma.config.json` — Code Connect CLI config (created in this ticket).
- `packages/dashboard/src/components/ui/*.figma.tsx` — Code Connect mapping per primitive (created in this ticket).
- `docs/plans/design-system.md` — design system project config; updated with the Code Connect inventory + the publish-CLI manual step.

## Decisions

- **Mappings target Core, not Crew DS.** The plan's example assumed Crew DS would contain re-themed shadcn primitives. CREW-124 deferred that to Phase 4 — Crew DS currently only ships the `Crew / Semantic Colors` override layer (zero components). Designers in consumer files instance shadcn primitives directly from Core via the library link. Code Connect URLs therefore point at Core's component nodes (`UkPJj6vd7HMKcey7M0XF4N`).
- **Use parser-based `.figma.tsx` files (not template `.figma.ts`).** Per the plan's Task 2.16. These import the real code component, declare prop mappings via `figma.enum` / `figma.boolean` / `figma.string`, and render an example snippet. They are picked up by the dashboard's `tsc -p tsconfig.json` (so they typecheck against the shadcn primitives) but Vite never bundles them since nothing in app code imports them.
- **Map the Figma kit's `Type` property to BOTH variant AND size for Button.** The community kit's `Buttons` set conflates shadcn's `variant` and `size` axes into a single `Type` enum (13 options including `primary`/`secondary`/`destructive`/`outline`/`hhost`(sic ghost)/`link`/`icon`/`with icon`/`loading` plus four size flags). Exhaustive-mapping rule from the figma-code-connect skill: every Figma value must appear in the mapping or it silently returns `undefined`. So the same `Type` Figma property is read by two `figma.enum()` calls — one resolving the shadcn `variant`, one resolving `size` — with cross-coverage of all 13 values.
- **Map Figma "Field" to `FormItem`.** `form.tsx` exports several behavioural wrappers (`Form`, `FormField`, `FormControl`, `FormDescription`, `FormMessage`) and one visible atom (`FormItem`). The Figma `Field` component on the kit's `Field` page is the visible atom, so it maps to `FormItem`. The example renders an idiomatic `FormItem` composition with `FormLabel`, `Input`, and `FormDescription` to give designers the canonical pattern.
- **Skip text-content extraction for now.** Layer names inside the kit's variants are the literal text characters (the "Button" text in the primary variant is named `Button`, but in the `with icon` variant it's named differently). Pulling text via `figma.textContent("Button")` would only work for one variant. Use placeholder strings in the example snippets and revisit when Crew DS rebuilds these as proper Crew composites in Phase 4.
- **The `figma connect publish` CLI step is user-only.** The CLI requires a Figma personal access token with file-content write scope, which the agent doesn't have. Document the publish step as a manual finalization in `docs/plans/design-system.md` (same pattern as CREW-121's "publish library" step and CREW-124's "add Core as library dependency" step).

## Mapping inventory

| Code component | File path                                                  | Figma component                         | Figma node id | Figma key                                  |
| -------------- | ---------------------------------------------------------- | --------------------------------------- | ------------- | ------------------------------------------ |
| `Button`       | `packages/dashboard/src/components/ui/button.figma.tsx`    | `Buttons` set on Button page            | `73:3681`     | `b76a29cc05b855114d7882ed2c165926a52c5df5` |
| `Badge`        | `packages/dashboard/src/components/ui/badge.figma.tsx`     | `Badge` set on Badge page               | `665:2024`    | `3392c02ca4938c88e637baac6369e01a95757c76` |
| `Input`        | `packages/dashboard/src/components/ui/input.figma.tsx`     | `Default` set on Input page             | `520:3062`    | `15fb52a7c9f970d441b1b5b4529496d94456cf8b` |
| `Dialog`       | `packages/dashboard/src/components/ui/dialog.figma.tsx`    | `Dialog` set on Dialog page             | `594:105`     | `f0b1a82013d1311b2ca471af6c372dc2968eb655` |
| `Label`        | `packages/dashboard/src/components/ui/label.figma.tsx`     | `Label` set on Label page               | `76:8617`     | `294dcd597462be142fc33092201bf646455bc246` |
| `Separator`    | `packages/dashboard/src/components/ui/separator.figma.tsx` | `Separator` component on Seperator page | `76:10202`    | `35cbda6a09ad42acb29c080797455269d1304919` |
| `FormItem`     | `packages/dashboard/src/components/ui/form.figma.tsx`      | `Field` component on Field page         | `1188:5362`   | `4093fb46fbda693c56b1fc0cf327c0fa375386a8` |

## Open questions

- [ ] Should the Code Connect publish be wired into a CI step or stay user-only? Phase 5 reconciliation tooling is the natural home for that automation.

## Notes

The kit's `Type=hhost` is a documented upstream typo (should be `ghost`). It maps to shadcn's `ghost` variant in the Code Connect snippet — kept as-is rather than renaming the Figma variant since renaming would break consumer instances already placed in Crew Dashboard Screens.
