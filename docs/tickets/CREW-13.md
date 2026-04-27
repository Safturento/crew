# CREW-13 — Dashboard package bootstrap (Vite + React + Tailwind v4 + Vitest)

Jira: https://safturento.atlassian.net/browse/CREW-13

Parent epic: [CREW-11](https://safturento.atlassian.net/browse/CREW-11) — Dashboard
foundation + agents list (mock daemon).

## Goal

Replace the placeholder `packages/dashboard/` with a real Vite + React + TS
workspace package: Tailwind v4, the locked design tokens (OKLCH state palette,
warm slate surfaces, Hanken Grotesk + Fira Code), keyframes for `att-pulse` /
`pulse-dot`, and a Vitest + RTL smoke test. Foundation only — no real
components yet.

## Inputs

- Spec (lives on `feat/dashboard-ui` branch, not yet merged):
  `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md`.
- Visual hand-off (also on `feat/dashboard-ui`):
  `docs/designs/design_handoff_crew_dashboard/README.md` — token reference.

## Relevant files

- `packages/dashboard/package.json` — real deps + scripts (`dev`, `build`,
  `preview`, `typecheck`, `test`, `test:run`).
- `packages/dashboard/tsconfig.json` — extends root base, switches to
  `module: ESNext` / `moduleResolution: Bundler`, adds DOM lib + `jsx:
react-jsx`, includes `vitest/globals` types.
- `packages/dashboard/vite.config.ts` — `@vitejs/plugin-react` +
  `@tailwindcss/vite`.
- `packages/dashboard/vitest.config.ts` — jsdom env + setup file.
- `packages/dashboard/index.html` — Vite entry.
- `packages/dashboard/src/main.tsx` — React mount, font + index CSS imports.
- `packages/dashboard/src/App.tsx` — placeholder rendering enough markup to
  prove the tokens load.
- `packages/dashboard/src/App.test.tsx` — RTL smoke test.
- `packages/dashboard/src/index.css` — `@import "tailwindcss"` +
  `@theme { … }` with the seven state colors, surfaces, fonts, and the two
  keyframe-based animations.
- `packages/dashboard/src/test/setup.ts` —
  `import '@testing-library/jest-dom/vitest'`.

## Decisions

- **Single bootstrap PR.** Vite/Tailwind/Vitest are mutually load-bearing; a
  partial commit (e.g. Vite without Tailwind) doesn't build cleanly anyway.
  Keep the commits inside the PR focused but don't try to ship them
  independently.
- **State palette = single OKLCH color per state, not a shade scale.** The
  design hand-off uses one hue+chroma per state and tints via
  `color-mix(... in oklch, …%, transparent)`. Tailwind v4's `@theme` exposes
  each as `--color-state-{name}` so utilities like `bg-state-yellow/10` work
  the same way the prototype does.
- **`--chr` master-chroma stays at `0.16`** (the chosen production value from
  the design hand-off, not the `0.14` default the prototype CSS shipped with).
- **Self-host fonts via `@fontsource/*`.** No Google Fonts request at runtime
  — matches the spec's preference.
- **Per-package Vitest config (jsdom).** Root `vitest.config.ts` is `node` env
  for `cli`/`shared`/`daemon`. Dashboard needs jsdom + RTL setup, so we ship
  a local config rather than coupling root to a browser env.
- **Animations as `--animate-*` theme tokens.** Tailwind v4 picks these up so
  the `att-pulse` and `pulse-dot` animations are usable as
  `animate-att-pulse` / `animate-pulse-dot` utilities later.

## Open questions

None — scope is closed by the ticket description.

## Notes

- Acceptance is build/test/typecheck/lint clean + `npm run dev` shows a styled
  placeholder. No screenshots.
- Subsequent tickets in CREW-11 (domain layer, AgentRow, routing, app wiring)
  build directly on what lands here.
