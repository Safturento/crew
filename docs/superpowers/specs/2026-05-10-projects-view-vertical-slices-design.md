# Projects View Vertical Slices — Design Spec

**Status:** Draft, awaiting user review
**Date:** 2026-05-10
**Brainstormed by:** safturento + Claude (Opus 4.7)

## Summary

Build the Projects view in the dashboard end-to-end via two parallel vertical-slice tickets. Ticket 1 ships the Projects **list** (frame `1:2334`): new `#/projects` route, ProjectsTable + ProjectRow + CountBadge in code and Crew DS, expanded `GET /api/projects` response. Ticket 2 ships the Project **detail** (frame `1:2443`): new `#/projects/:slug` route, ProjectHeader + ProjectConfigBlock in code and Crew DS, new `GET /api/projects/:slug` endpoint. Both tickets follow the established CREW-117/CREW-119 vertical-slice shape (build composites + dashboard refactor + Figma frame migration + visual fidelity sweep). Edit/Remove/Register modal flows stay stubbed (Epic 4 territory).

## Context & motivation

Epic 1 (CREW-127, palette correction) closed 2026-05-10. The Crew DS baseline is now solid — palette aligned to Tailwind slate, StateBadge has 21 variants (intensity axis), the propagation + migration skills are bulletproofed against the gotchas we hit during the StateBadge polish work. The 3 already-migrated frames (`1:2`, `1:378`, `1:1900`) are clean.

8 frames remain unmigrated. Per the brainstorming on 2026-05-10 evening, they cluster into three natural epics:

- **Epic 2 (this spec): Projects view** — frames `1:2334` + `1:2443`
- **Epic 3: New Run modal flow** — frames `1:2980`, `1:3418`, `9:2`
- **Epic 4: Project ops modals** — frames `1:2649`, `18:2`, `23:2`

Epic 2 is the natural starting point: same html.to.design import pattern as the Agents view we already migrated, lowest-risk for exercising the now-mature migration skills at scale. Critical discovery during brainstorming: **the Projects route doesn't exist in the dashboard yet** — daemon has the `GET /api/projects` API and the Project type is defined, but no `routes/`, no list/detail components, no UI. Epic 2 is build-from-scratch on the dashboard side, not a code-side fidelity sweep like CREW-117/119 was.

The Project detail page also references Edit/Remove modal targets (frames `23:2` + `18:2`) which are explicitly Epic 4 — Epic 2 stubs those buttons.

## Architecture

Architecture follows the patterns established by CREW-117/CREW-119 + the Crew DS palette correction (CREW-127):

- **Hash routing.** `useHashRoute` already handles `#/agent/:key` + `#/agent/:key/full`. Adding `#/projects` and `#/projects/:slug` slots into the same switch.
- **Data flow.** Dashboard → daemon HTTP API (Fastify + Zod). New endpoints follow the existing `registerProjectsRoutes` pattern with Zod-validated response schemas.
- **Composite layering.** Crew DS composites compose shadcn primitives (`Table`, `Button`, `Card`) where applicable, and bind colors to `Crew / Semantic Colors` semantic tokens (which now alias directly to `tw/colors/slate-*` per CREW-127).
- **Migration mechanics.** Per the `figma-screen-migration` + `figma-design-system-propagation` skills. Crew DS uses single-collection mode resolution as of CREW-127 — only Crew Semantic Colors mode needs to be set explicitly on consumer frames.

### Why no new Epic-level architecture

This is the third vertical-slice ticket pair (after CREW-117 + CREW-119) and the first targeting build-from-scratch dashboard work. The vertical-slice pattern itself doesn't change — the additional work is on the backend (expanded endpoint + new endpoint) and the frontend (new routes + components from scratch instead of refactoring existing ones).

### Why parallel-safe

Ticket 1 and Ticket 2 touch:

- Different routes (`#/projects` vs `#/projects/:slug`)
- Different page-component files
- Different Figma frames
- Different Crew DS composites (different file paths in code)

The only shared surface is `src/data/HttpDaemonClient.ts` + `src/data/types.ts` (both tickets touch the Project type). Coordinated by ticket sequencing or merge-conflict resolution at PR time.

## Section 1 — Backend (daemon)

### Expand `GET /api/projects` response

Current response is `{ projects: [{ name, repoPath }] }`. Expand to:

```ts
const ProjectSchema = z.object({
  name: z.string(),
  repoPath: z.string(),
  branch: z.string(), // from project config default_branch
  jiraKey: z.string(), // from project config jira.project_key
  activeCount: z.number(), // server-derived: agents.filter(a => a.projectName === project.name).length
});
```

`activeCount` is derived server-side by joining the project list with the agents service (or whatever returns the active-agents count). Centralizing on the daemon avoids a client-side join pattern.

### Add `GET /api/projects/:slug` endpoint

New endpoint returning full ProjectConfig as JSON for the detail page:

```ts
const ProjectDetailResponseSchema = z.object({
  project: ProjectConfigSchema,  // full config from packages/shared/src/config/schema.ts
  configPath: z.string(),        // the resolved file path on disk (e.g. ~/.config/crew/projects/kanban-api.toml)
});

app.get('/api/projects/:slug', { schema: { ... } }, async (req) => {
  const svc = req.diScope.resolve('projectsService');
  const project = svc.getBySlug(req.params.slug);  // throws 404 if not found
  return { project, configPath: svc.getConfigPath(project.name) };
});
```

`projectsService` likely needs `getBySlug` and `getConfigPath` methods added if not present.

### Bruno collection updates

- Update `bruno/endpoints/projects/get-list.bru` for the expanded shape (assert presence of `branch` / `jiraKey` / `activeCount`)
- Add `bruno/endpoints/projects/get-show.bru` exercising `GET /api/projects/kanban-api`
- Update `bruno/flows/main-smoke.bru` to chain a list → show call

### Test plan

- Daemon-side Vitest unit tests for both endpoints (project found / not found, activeCount derivation logic)
- Bruno smoke updated and passing
- Dashboard-side fixtures (`packages/dashboard/src/data/fixtures.ts` + `MockDaemonClient.ts`) updated to match the new schemas

## Section 2 — Frontend (dashboard)

### Ticket 1 — Projects list slice

| File                                                                                    | Status | Purpose                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                                                                           | modify | Add `#/projects` route case; render `<ProjectsListPage>`                                                                                 |
| `src/routes/ProjectsListPage.tsx`                                                       | NEW    | Route container — TanStack Query for `listProjects()`; renders ProjectsTable; mounts "+ Register project" button (stubbed)               |
| `src/components/ProjectsTable.tsx`                                                      | NEW    | Wraps shadcn `Table` primitive with column headers (NAME / REPO PATH / BRANCH / JIRA / ACTIVE / chevron) + maps projects to `ProjectRow` |
| `src/components/ProjectRow.tsx`                                                         | NEW    | Single table row — name / repoPath / branch / jiraKey / `<CountBadge count={activeCount} />` / chevron link to `#/projects/:slug`        |
| `src/components/CountBadge.tsx`                                                         | NEW    | Small tinted circle with number — `state/initializing` color by default. Reusable for "Clear attention" count, etc.                      |
| `src/data/types.ts`                                                                     | modify | Expand `Project` interface with `branch`, `jiraKey`, `activeCount`                                                                       |
| `src/data/HttpDaemonClient.ts` + `MockDaemonClient.ts` + `fixtures.ts`                  | modify | Mirror Project type expansion                                                                                                            |
| `src/components/ProjectsTable.test.tsx` + `ProjectRow.test.tsx` + `CountBadge.test.tsx` | NEW    | Unit tests for rendering + chevron-link wiring                                                                                           |
| `tests/e2e/projects-list.spec.ts`                                                       | NEW    | Playwright e2e: navigate to `#/projects`, assert rows render, click chevron, assert URL changes                                          |

**"+ Register project" button:** stub `onClick={() => { /* TODO: wire to Register modal in Epic 4 */ }}`. Visible, focusable, no-op. Same pattern as the QuickAction buttons followup from CREW-119.

### Ticket 2 — Project detail slice

| File                                                                    | Status | Purpose                                                                                                                            |
| ----------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                                                           | modify | Add `#/projects/:slug` route case; render `<ProjectDetailPage slug={...}>`                                                         |
| `src/routes/ProjectDetailPage.tsx`                                      | NEW    | Route container — TanStack Query for `getProject(slug)`; renders ProjectHeader + ProjectConfigBlock + filtered ProjectSection      |
| `src/components/ProjectHeader.tsx`                                      | NEW    | Back link (← Projects) + heading + config-file path subtitle + Edit / Remove buttons (stubbed)                                     |
| `src/components/ProjectConfigBlock.tsx`                                 | NEW    | JSON → TOML formatter for display in a Fira-Code styled card                                                                       |
| `src/components/ProjectSection.tsx`                                     | reuse  | Existing component; add a prop to filter to a single project's agents                                                              |
| `src/data/HttpDaemonClient.ts` + `MockDaemonClient.ts` + `fixtures.ts`  | modify | Add `getProject(slug)` method returning ProjectDetailResponse                                                                      |
| `src/components/ProjectHeader.test.tsx` + `ProjectConfigBlock.test.tsx` | NEW    | Unit tests                                                                                                                         |
| `tests/e2e/project-detail.spec.ts`                                      | NEW    | Playwright e2e: navigate to `#/projects/kanban-api`, assert config + agents render, click "← Projects", assert URL returns to list |

**Edit / Remove buttons:** stub `onClick={() => { /* TODO: wire to Edit/Remove modal in Epic 4 */ }}`. Visible, focusable, no-op.

**TOML formatting:** inline JSON→TOML formatter (~30 lines). The `ProjectConfig` schema is flat (one nested object: `jira: { project_key, ... }`) so a small recursive formatter handles it without a dependency. If round-trip stability becomes a need later, swap to `@iarna/toml`.

## Section 3 — Crew DS composites + Figma frame migration

### New Crew DS composites

All four follow the StateBadge canonical opacity pattern (mid intensity = 10% bg + 30% border + 100% text) per `docs/plans/design-system.md`. Each composite gets a matching `.figma.tsx` Code Connect mapping (publish skipped per Pro plan).

| Composite            | Ticket | Crew DS structure                                                                                                                                                                                                                                   | Code counterpart                                           |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `CountBadge`         | 1      | Small ellipse (h-5 w-5 ish, 50% radius) + centered number. Bound to `state/initializing` for default tint. Variant axis on `state` (initializing/running/idle/waiting/pr-open/error/finished) so the badge can carry different semantic meanings.   | `packages/dashboard/src/components/CountBadge.tsx`         |
| `ProjectRow`         | 1      | Horizontal frame composing 5 text cells (name / repoPath / branch / jiraKey) + 1 `CountBadge` instance + 1 chevron icon. Auto-layout with consistent column widths matching the parent ProjectsTable's column distribution.                         | `packages/dashboard/src/components/ProjectRow.tsx`         |
| `ProjectHeader`      | 2      | Vertical auto-layout: back link (← Projects) → heading → config-path subtitle (Fira Code, muted). Horizontal slot on the right for action buttons (Edit / Remove). Wrapped in a horizontal frame so heading-block + actions-block sit side-by-side. | `packages/dashboard/src/components/ProjectHeader.tsx`      |
| `ProjectConfigBlock` | 2      | Wraps shadcn `Card` instance with a TOML-formatted body in Fira Code. Padding + border per the Card primitive. Light internal padding for the code text.                                                                                            | `packages/dashboard/src/components/ProjectConfigBlock.tsx` |

**Skipping `ProjectsTable` as a Crew DS composite** — it's just a shadcn `Table` instance with header row + N `ProjectRow` instances. No design-system value in wrapping it; the Crew DS would just be a copy of the shadcn primitive.

### Figma frame migrations

Apply the `figma-screen-migration` skill workflow to both frames. The skill's audit/ruleset/swap pipeline is well-tested at this point — same recipe as the 3 frames already migrated. The screens file's library cache for Crew DS is current (Crew DS published 2026-05-10).

| Ticket | Frame                     | Estimated work                                                                                                                                                                                                   |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `1:2334` (Projects list)  | Audit, set Crew Semantic dark mode (single-collection per CREW-127), build color ruleset (~200 fills expected), bind, swap detached pills for `ProjectRow` + `CountBadge` instances. ~30-45 min mechanical work. |
| 2      | `1:2443` (Project detail) | Same pipeline. Compose new `ProjectHeader` + `ProjectConfigBlock` + existing `ProjectSection` instances. The agent rows inside reuse the StateBadge work already done. ~30-45 min.                               |

**Mode-set caveat:** Crew DS now uses single-collection mode resolution (Trap 2 exception). Phase 2 of the migration skill only needs `setExplicitVariableModeForCollection(crewSemantic, darkModeId)` — no Core mode collection chain-walking.

**Opacity-stickiness caveat:** per `figma-design-system-propagation` Trap 1, always force opacity in a separate explicit pass after `createInstance()` / `swapComponent()` / `setBoundVariableForPaint()`. The migration skill's swap snippet has this pattern baked in.

### Code Connect mapping pattern

For each new composite, author `<ComponentName>.figma.tsx` alongside the dashboard component, mirroring the existing `BrandMark.figma.tsx` / `StateBadge.figma.tsx` / etc. shape. These files document the Figma → code mapping but are not published (Pro plan tier — per `project_code_connect_skipped` memory).

## Acceptance criteria

### Backend

- [ ] `GET /api/projects` returns expanded shape with `branch`, `jiraKey`, `activeCount`
- [ ] `GET /api/projects/:slug` returns `{ project: ProjectConfig, configPath: string }` with proper 404 on missing
- [ ] `bruno/endpoints/projects/get-list.bru` updated for new shape; `get-show.bru` added; `main-smoke.bru` updated
- [ ] Daemon Vitest unit tests pass; Bruno smoke passes

### Dashboard

- [ ] `#/projects` route renders ProjectsListPage with table of projects from API
- [ ] `#/projects/:slug` route renders ProjectDetailPage with header + TOML config + agents section
- [ ] Chevron in list rows navigates to detail
- [ ] "← Projects" link in detail returns to list
- [ ] "+ Register project" / "Edit" / "Remove" buttons render but onClick is a TODO stub
- [ ] All new components have Vitest unit tests
- [ ] Playwright e2e smokes both routes (list + detail) and the back-and-forth navigation
- [ ] `npm run lint` / `npm run typecheck` / `npm run test:e2e` / `npm run bruno:smoke` all pass

### Crew DS + Figma

- [ ] 4 new composites built in Crew DS (`CountBadge`, `ProjectRow`, `ProjectHeader`, `ProjectConfigBlock`) with `.figma.tsx` mappings
- [ ] Crew DS published in Figma desktop after additions
- [ ] Frame `1:2334` migrated: ~95%+ fill bound, no detached pill structures, dark mode set, MCP `get_screenshot` shows correct slate palette + composites in place
- [ ] Frame `1:2443` migrated: same criteria
- [ ] Visual smoke in dashboard browser: `#/projects` and `#/projects/:slug` both render with the expected slate palette + tinted CountBadges + Fira Code config block

### Docs

- [ ] `docs/plans/design-system.md` Component inventory updated with the 4 new composites + their Figma node IDs

## Out of scope

- **Edit / Remove modal flows** — Epic 4 (Project ops modals)
- **Register project modal** — Epic 4
- **"+ New Run" button wiring** — existing followup or Epic 3
- **QuickAction button wiring** — existing followup (deferred from CREW-119)
- **Editing project config from the UI** — display only; mutations are CLI-only for now
- **Real Tail-following / live updates of project config** — fetch-and-display pattern; refresh on visit
- **Sorting / filtering / search on the projects list** — out of scope for v1; the list is small enough (single-digit projects in practice) that a static table suffices

## Risks + mitigations

| Risk                                                                                                                | Mitigation                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| activeCount derivation is N+1 (one count query per project) on a hot path                                           | Compute in a single pass: `agents.groupBy('projectName').count()` server-side. Cache via the agents service if it's already cached.                                              |
| TOML formatter doesn't handle every config edge case (e.g. nested arrays)                                           | Inline formatter targets the current ProjectConfig schema only; if schema grows nested arrays, fall back to `@iarna/toml`. Cover with unit tests for the current schema's shape. |
| Stub buttons land but Epic 4 slips, leaving non-functional UI in production                                         | Each stub button gets a TODO comment referencing Epic 4. If Epic 4 hasn't shipped by next release, hide the buttons via a feature flag rather than landing dead UI.              |
| 4 new composites + 2 frame migrations + new code is more Figma+code work than CREW-117/119 — bigger ticket          | Each ticket is still one focused vertical slice. Per-ticket work is bounded; if a ticket grows during execution, we split rather than mega-ticket.                               |
| Crew DS still uses single-collection mode chain — agent forgets and tries to set Core mode (wasted effort, no harm) | Migration skill has the exception note for the simplified pattern. Project memory entry reinforces it.                                                                           |

## Open questions

- [ ] Should the projects list be sortable client-side? (Out of scope for v1 per spec; revisit if user feedback asks for it.)
- [ ] Does `projectsService` already expose `getBySlug` + `getConfigPath` or do they need to be added? (Implementation detail; agent can determine in plan-execution.)
- [ ] Should the chevron column in the list be a real link or use the entire row as the link target (better UX)? (Recommend whole-row link for better UX; chevron stays as visual affordance.)
