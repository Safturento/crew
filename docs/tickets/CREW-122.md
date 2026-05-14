# CREW-122 — shadcn install + @theme token migration

Jira: https://safturento.atlassian.net/browse/CREW-122

## Goal

Bootstrap shadcn/ui's CLI infrastructure in `packages/dashboard` (Tailwind v4 mode) and rename the bespoke `--color-canvas` / `--color-bg` / `--color-surface*` / `--color-text*` tokens to shadcn-aligned semantic names so CREW-123 can drop in `shadcn add <primitive>` without further reconciliation. State color tokens (`--color-state-*`) are preserved.

## Relevant files

- `packages/dashboard/components.json` — shadcn CLI config (style: new-york, baseColor: slate, cssVariables: true, lucide icons, `@/*` aliases)
- `packages/dashboard/src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `packages/dashboard/src/index.css` — tokens migrated to shadcn semantic names; new `:root` (light) and `.dark` (preserves crew dark palette) primitive blocks
- `packages/dashboard/src/main.tsx` — sets `.dark` class on `<html>` at app boot
- `packages/dashboard/tsconfig.json` + `vite.config.ts` — `@/*` path alias
- 16 component files under `packages/dashboard/src/{components,routes}/**` — className migration

## Decisions

- **shadcn CLI pinned at `4.7.0`.** Latest stable on 2026-05-09. The 4.x line has native Tailwind v4 support; recorded in `docs/plans/design-system.md`.
- **`shadcn init` skipped — config authored by hand.** The CLI fetches templates from `ui.shadcn.com`, which the `crew run` sandbox blocks. `components.json` and `src/lib/utils.ts` were written to match the canonical v4 output. The pinned version + config shape are what `shadcn add <primitive>` (CREW-123) will reconcile against. Surfacing this so CREW-123 doesn't get blindsided by the same restriction.
- **Dark-mode primitives preserve the existing crew palette verbatim;** light-mode adopts shadcn slate v4 OKLCH defaults. Keeps the rename visually invisible in the dashboard's default dark mode while letting the light-mode primitives exist for Phase 4+ parity.
- **`text-text-1` → `text-foreground`.** Three sites (`Timeline/FilterChips`, `Timeline/LiveModeToggle`, `Timeline/SearchBar`) used `text-text-1`, which never had a matching `--color-text-1` token in the old `@theme`. Treated as a typo for `text-text` and migrated accordingly.
- **`border-border-strong` left unmapped.** The migration map allocated `border-border/[0.12]`, but a grep showed zero usages, so nothing to rewrite.

## Migration map

| Old utility class            | New utility class       |
| ---------------------------- | ----------------------- |
| `bg-canvas`, `bg-bg`         | `bg-background`         |
| `bg-surface`                 | `bg-card`               |
| `bg-surface-2`               | `bg-popover`            |
| `bg-text`                    | `bg-foreground`         |
| `bg-text-3`                  | `bg-muted-foreground`   |
| `text-text`, `text-text-1`   | `text-foreground`       |
| `text-text-2`, `text-text-3` | `text-muted-foreground` |
| `text-canvas`                | `text-background`       |

State color utilities (`bg-state-*`, `text-state-*`, `border-state-*`) are unchanged.

## Verification

- `npm run -w crew-dashboard typecheck` ✅
- `npm run -w crew-dashboard test:run` ✅ (241 tests)
- `npm run -w crew-dashboard build` ✅
- `npm run bruno:smoke` ✅ (8 requests, 21/21 assertions)
- `npm run test:e2e` ✅ (16 tests)
- Visual smoke (Playwright MCP): Agents list, Projects placeholder, and Agent drawer all render without regression
- `npm run lint` ✅; `prettier --write` applied to touched files

## Notes

CREW-123 (the 7 primitive installs) will need to run `shadcn add <primitive>` from outside the sandbox, since `ui.shadcn.com` isn't on the allowed-host list. Documented in `docs/plans/design-system.md` so the dispatcher can plan around it.
