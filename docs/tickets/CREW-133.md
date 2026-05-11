# CREW-133 — Project detail slice (Phase B)

Jira: https://safturento.atlassian.net/browse/CREW-133

## Goal

Build the Project detail view end-to-end: new `GET /api/projects/:slug` daemon endpoint returning the full `ProjectConfig` plus its on-disk config path, new `#/projects/:slug` dashboard route rendering `ProjectHeader` + `ProjectConfigBlock` + a filtered `ProjectSection`, two new Crew DS composites with Code Connect mappings, and a migrated Figma frame `1:2443`.

## Relevant files

- `packages/daemon/src/services/ProjectsService.ts` — add `getBySlug` + `getConfigPath`
- `packages/daemon/src/routes/projects.ts` — add `GET /api/projects/:slug`
- `packages/daemon/src/services/ProjectsService.test.ts` / `routes/projects.test.ts` — Vitest tests for the two new surfaces
- `bruno/endpoints/projects/get-show.bru` — new endpoint smoke
- `package.json` (root scripts) — chain `get-list` + `get-show` into the Bruno smoke run
- `packages/dashboard/src/data/types.ts` — add `ProjectDetailResponse`
- `packages/dashboard/src/data/DaemonClient.ts`/`HttpDaemonClient.ts`/`MockDaemonClient.ts`/`fixtures.ts` — add `getProject(slug)`
- `packages/dashboard/src/lib/jsonToToml.ts` — small TOML formatter
- `packages/dashboard/src/components/ProjectHeader.tsx` + test
- `packages/dashboard/src/components/ProjectConfigBlock.tsx` + test
- `packages/dashboard/src/routes/ProjectDetailPage.tsx` + test
- `packages/dashboard/src/routing/parseRoute.ts` + test — add `project-detail` route kind
- `packages/dashboard/src/App.tsx` — switch on the new route
- `packages/dashboard/tests/e2e/project-detail.spec.ts` — Playwright e2e
- `docs/plans/design-system.md` — add Phase B composites to inventory

## Decisions

- **No modification to `ProjectSection` for filtering** — the existing component already takes `agents: Agent[]` (passed by the parent), so the detail page filters externally before passing them in. Modifying its prop API would create a needless coupling and would conflict with what's already a stable shape used by `AgentsList`.
- **No `ProjectsService.list()` expansion** — Phase A (CREW-132) owns the list-shape change; CREW-133 stays parallel-safe and only adds the new methods.
- **No `Card` shadcn primitive added** — the dashboard doesn't currently expose `ui/card.tsx`. `ProjectConfigBlock` uses the same `rounded-[14px] border border-white/10 bg-card` pattern the existing placeholder card uses, keeping the diff small.
- **Inline `jsonToToml` formatter, not `@iarna/toml`** — the `ProjectConfig` schema is flat enough (one nested object: `jira: { ... }`) that ~30 lines covers it. Falling back to a dependency stays an option if the schema grows nested arrays.
- **Edit / Remove buttons render but `onClick` is a no-op TODO** — Epic 4 territory; same pattern as the QuickAction stubs from CREW-119.

## Notes

Plan reference: `docs/superpowers/plans/2026-05-10-projects-view-vertical-slices.md` (Phase B, Tasks B1–B19) — currently on the `docs/projects-view-vertical-slices-spec` branch (PR #166), not yet on `main`.

Crew DS composite work (B13–B16) and frame migration (B17) require Figma desktop access plus a manual `Crew DS` library republish — performed by the user in the loop. The agent prompts for that step rather than running it.
