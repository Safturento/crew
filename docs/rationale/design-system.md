# Design system — rationale & history

Background and design rationale for the Crew design system in Figma. Current rules live in [`.agents/design-system.md`](../../.agents/design-system.md); this file captures the _why_ and the per-phase evolution.

## Phase status snapshot (point-in-time)

Captured 2026-05-13 (pre-migration). Subsequent updates land in the rules doc; this table is a frozen record of where each phase was when the doc was migrated.

| Phase                                           | Status                                                                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 — Core library                          | Agent work complete (CREW-121); user must publish in Figma desktop                                                                                                                                                                  |
| Phase 2 code — shadcn install + token migration | Done (CREW-122)                                                                                                                                                                                                                     |
| Phase 2 code — add primitives                   | Done (CREW-123)                                                                                                                                                                                                                     |
| Phase 2 Figma — Crew DS override layer          | Agent work complete (CREW-124); user must publish in Figma desktop                                                                                                                                                                  |
| Phase 2 — Code Connect                          | `.figma.tsx` mapping files landed in CREW-125; `figma connect publish` intentionally skipped (see Code Connect publish section)                                                                                                     |
| Phase 3 — Migrate screens                       | Partial: font fix landed in CREW-126; color binding + composite swap deferred (see followups)                                                                                                                                       |
| Phase 4 — Full Crew DS coverage                 | Partial: 10 of 11 composites built (6 in CREW-119 + 4 in CREW-117); only `ErrorFallback` remains. Agents-related frames (`1:2`, `1:378`, `1:1900`) migrated 2026-05-10 (dark mode + Crew DS color bindings + StateBadge instances). |
| Phase 5 — Skill v1 + reconciliation tooling     | Not started (separate Epic)                                                                                                                                                                                                         |

## Core kit fork point

Forked from the Figma community file `UkPJj6vd7HMKcey7M0XF4N` ("shadcn ui components with variables — Tailwind classes — Updated January 2026") on 2026-05-09. The community file is the source of upstream changes; we don't auto-track. The every-~6-months upstream-review cadence lives in the rules doc; the date and source URL are the historical anchor.

## Core library inventory (snapshot 2026-05-09)

Captured during CREW-121. All 17 collections have explicit per-variable scopes (no `ALL_SCOPES` defaults). This is a point-in-time inventory — current counts may drift; consult Figma directly for live numbers.

| Collection                             | Modes                 | Variables | Types               | Scopes applied                                                                                                                                                                                              |
| -------------------------------------- | --------------------- | --------: | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tw/colors`                            | Mode 1                |       244 | COLOR               | `EFFECT_COLOR`, `FRAME_FILL`, `SHAPE_FILL`, `STROKE_COLOR`, `TEXT_FILL`                                                                                                                                     |
| `tw/padding`                           | Mode 1                |       245 | FLOAT               | `GAP`, `WIDTH_HEIGHT`                                                                                                                                                                                       |
| `tw/space`                             | Mode 1                |        68 | FLOAT               | `GAP`, `WIDTH_HEIGHT`                                                                                                                                                                                       |
| `tw/border-radius`                     | Mode 1                |       149 | FLOAT               | `CORNER_RADIUS`                                                                                                                                                                                             |
| `tw/margin`                            | Mode 1                |       245 | FLOAT               | `GAP`, `WIDTH_HEIGHT`                                                                                                                                                                                       |
| `tokens`                               | Mode 1                |        89 | FLOAT               | (left empty — kit internals; see Core kit notes in rules doc)                                                                                                                                               |
| `mode`                                 | light mode, dark mode |        48 | 36 COLOR + 12 FLOAT | color vars: full color scopes; `radius-*` → `CORNER_RADIUS`; `border-width` / `stroke-width` → `STROKE_FLOAT`                                                                                               |
| `tw/border-width`                      | Mode 1                |        45 | FLOAT               | `STROKE_FLOAT`                                                                                                                                                                                              |
| `tw/gap`                               | Mode 1                |       102 | FLOAT               | `GAP`, `WIDTH_HEIGHT`                                                                                                                                                                                       |
| `tw/stroke-width`                      | Mode 1                |        11 | FLOAT               | `STROKE_FLOAT`                                                                                                                                                                                              |
| `tw/font`                              | Mode 1                |        47 | 6 STRING + 41 FLOAT | per-variable: `family/*` → `FONT_FAMILY`; `style/*` → `FONT_STYLE`; `size/*` → `FONT_SIZE`; `weight/*` → `FONT_WEIGHT`; `leading/line-height` → `LINE_HEIGHT`; `tracking/letter-spacing` → `LETTER_SPACING` |
| `tw/height`                            | Mode 1                |        24 | FLOAT               | `WIDTH_HEIGHT`                                                                                                                                                                                              |
| `tw/max-height`                        | Mode 1                |        35 | FLOAT               | `WIDTH_HEIGHT`                                                                                                                                                                                              |
| `tw/max-width`                         | Mode 1                |        51 | FLOAT               | `WIDTH_HEIGHT`                                                                                                                                                                                              |
| `rdx/colors`                           | light mode, dark mode |       396 | COLOR               | full color scopes                                                                                                                                                                                           |
| `tw/opacity`                           | Mode 1                |        21 | FLOAT               | `OPACITY`                                                                                                                                                                                                   |
| `Core / Breakpoints` (new in CREW-121) | Mode 1                |         5 | FLOAT               | `WIDTH_HEIGHT`                                                                                                                                                                                              |

Total: **1,825 variables across 17 collections.**

### Phase 1 deltas vs upstream kit

- **Variable scopes retrofitted.** Upstream kit defaulted color collections (`tw/colors`, `mode`, `rdx/colors`) to `["ALL_SCOPES"]`, which floods every Figma property picker. CREW-121 walks every variable and sets explicit scopes per type. Other `tw/*` collections already had reasonable scopes from upstream and were left consistent.
- **`mode / destructive-foreground` added.** Upstream `mode` collection had `destructive` but was missing the matching `destructive-foreground` semantic token (shadcn convention requires both). Added as a COLOR variable in `mode`, aliased to `tw/colors / slate/50` in both light and dark modes (light text on red works in both). Scopes: full color set.
- **`Core / Breakpoints` collection added.** New collection holding 5 FLOAT variables aliasing the kit's raw breakpoint numerics in `tokens` to semantic names: `breakpoint/sm` → `tokens / 640`, `breakpoint/md` → `tokens / 768`, `breakpoint/lg` → `tokens / 1024`, `breakpoint/xl` → `tokens / 1280`, `breakpoint/2xl` → `tokens / 1536`. Scopes: `["WIDTH_HEIGHT"]`. Use these instead of digging into `tokens` for responsive breakpoint values.
- **Layout primitives added.** Three components on a new `Layout Primitives` page — captured in the rules doc.
- **Removed malformed `Type=Button group` variant from the `Buttons` set on the `Button` page (id `1463:5795`).** Upstream kit shipped this single variant declaring only `Type` while every sibling variant in the set declared `Type=X, State=Y`. Figma's variant-completeness check flagged the Buttons set as invalid at publish time, blocking the entire library publish. The variant was vestigial — the kit ships a separate `Button Group` page with its own dedicated component, so the orphaned variant inside Buttons was a leftover from an upstream refactor. After deletion, the set has 26 valid variants across `Type` (13 options incl. `primary`, `secondary`, `destructive`, `outline`, `hhost` (sic — upstream typo for `ghost`), `link`, `icon`, `with icon`, `loading`, four size variants, `Rounded`) and `State` (3 options: `default`, `hover`, `loading`), and the publish step succeeds.

## `Crew / Semantic Colors` collection (detailed inventory)

Mirrors every variable in Core's `mode` collection 1:1. Each Crew variable shares its name with the Core token, declares the same type and explicit scopes Core uses, and (originally) aliased the Core token in both `light mode` and `dark mode`. Mode toggles in consuming files cascade through Crew → Core's `mode` → the underlying `tw/colors` primitive. (As of 2026-05-10 the mode chain shortened — see "v1 overrides" in the rules doc.)

Naming caveat: the collection is named `Crew / Semantic Colors` per the Phase 2 plan, but it actually mirrors all 48 Core `mode` tokens — 36 COLOR plus 12 FLOAT (10 radii + `border-width` + `stroke-width`). The FLOATs are included so the entire Core `mode` surface is overridable from a single Crew location, satisfying the "every Core mode token has an alias" definition of done. Future cleanup may rename the collection to drop the `Colors` qualifier.

| Type  | Count | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Scopes                                                                  |
| ----- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| COLOR |    36 | `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`, `chart-1`…`chart-5`, `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring`, `background-color`, `semantic-background`, `semantic-border`, `semantic-foreground` | `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`, `EFFECT_COLOR` |
| FLOAT |    10 | `radius-none`, `radius-xs`, `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`, `radius-2xl`, `radius-3xl`, `radius-4xl`, `radius-full`                                                                                                                                                                                                                                                                                                                                                                                                                                   | `CORNER_RADIUS`                                                         |
| FLOAT |     2 | `stroke-width`, `border-width`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `STROKE_FLOAT`                                                          |

Total: **48 variables across 1 collection**, no `ALL_SCOPES` defaults. (State tokens added later in CREW-119 / 2026-05-10 push the total to 56 — see rules doc for current shape.)

## User-only finalization step (Task 1.7 — CREW-121 publish)

The Figma desktop client is required to publish a library — the Plugin API exposes no equivalent. To complete CREW-121 acceptance:

1. Open `Core Design System` in the Figma desktop app.
2. Click the Assets panel (left sidebar) → Publish library button (top-right of the panel).
3. Confirm the publish review (reviews all collections + components added/changed by this ticket).
4. Once the modal reports success, mark CREW-121 Done.

After publish, downstream tickets unblock: `CREW-124` (Crew DS Figma file) imports Core, and Crew screens (`CREW-126`) eventually consume Crew DS.

## Per-ticket composite additions

### CREW-119 (agents list vertical slice, 2026-05-10)

Six composites added to the Crew DS `Composites` page — `BrandMark`, `StateBadge` set, `TopNav`, `AgentRow`, `ProjectSection`, `AgentsList`. The Figma builds are skeleton-fidelity — names, semantic-token bindings (where applicable), and slot structure are correct; pixel polish is opportunistic and lands during follow-on visual sweeps. `StateBadge` published as a component set with one variant per agent state; the `.figma.tsx` mapping bridges Figma's kebab `pr-open` to the dashboard's snake `pr_open` via `figma.enum`. The other five are single components — Figma variant axes will grow as future fidelity tickets surface a need.

### CREW-117 (agent drawer vertical slice, 2026-05-10)

Four additional composites — `AgentBody`, `StateHistoryBar`, `TokenTable`, `ViewportFrame`. Same skeleton-fidelity bar as CREW-119. All four are single components (no Figma variant axes). `AgentBody` composes a `StateBadge` instance in its header; the body slot is a placeholder — runtime composition (Timeline / StateHistoryBar / TokenTable mounting) is tracked separately in `docs/followups.md`. The dashboard's `AgentBody.tsx` was refactored in CREW-117 to consume shadcn `Button` (variant `outline` + `ghost`, size `xs`) for the View PR / Open as page / Copy worktree-path actions, replacing inline `<a>` and `<button>` markup.

### CREW-131 (Projects view vertical slices, 2026-05-10)

Four additional composites — `CountBadge`, `ProjectRow`, `ProjectHeader`, `ProjectConfigBlock`. Built end-to-end during the CREW-131 closeout interactive session — the dashboard code (CREW-132 + CREW-133) shipped via autonomous `crew run`, then the Crew DS composites + matching screens-file frame migration landed in a follow-on session. `CountBadge` published as a component set with one variant per agent state (same enum mapping pattern as `StateBadge`). The other three are single components. All use the canonical mid intensity (bg 10% / border 30% / text 100%) bound to Crew Semantic tokens.

Notes on the CREW-131 batch:

- `ProjectRow` composes a `CountBadge` instance (waiting variant) for the activeCount column. Designers can swap variant per-row to indicate a different state coloring.
- `ProjectHeader`'s Edit/Remove action buttons are inline-styled (Edit = transparent + border; Remove = canonical mid destructive). They should eventually be replaced with real shadcn `Button` instances for full design-system consistency — tracked as a polish followup.
- `ProjectConfigBlock` wraps a TOML-formatted text node in a `card`-styled frame with `border` overlay. Padding p-6 (24px), corner radius 14px to match the dashboard's `rounded-[14px]`.

Frames `1:2334` (Projects list) and `1:2443` (Project detail) in the screens file (`9FeJPriqdsdA4n9R5Xsrr8`) migrated 2026-05-10 — fills bound to Crew DS tokens (47/47 + 73/74 = 120/121 = 99%), explicit dark mode set on Crew Semantic Colors, detached state pills swapped to StateBadge instances, count-badge bg fills forced to opacity 0.18 per propagation skill Trap 1.

### 2026-05-12 Figma-side Pill consolidation

A follow-on session merged `Button` / `StateBadge` / `CountBadge` / `TimelineTag` (Figma surfaces) into a single unified `Pill` component set: **6 types × 8 colors × 4 intensities = 192 variants**. The Crew DS also moved from a standalone Figma file into the dashboard file (`9FeJPriqdsdA4n9R5Xsrr8`) as a local `Composites` page; the old standalone DS file (`DsA7QuEa2WthDATkksd1Bq`) was archived.

This consolidation is **Figma-side only**. The dashboard code still ships separate `StateBadge`, `CountBadge`, and shadcn `Button` components — they have not been refactored into a unified `Pill` primitive. The `.figma.tsx` files in `packages/dashboard/src/components/` still reference the archived standalone Crew DS file URL and pre-consolidation node IDs (see `docs/followups.md` under "Stale `.figma.tsx` mappings" for the rebuild task).

The rules doc reflects the **code's** current shape; the Pill consolidation is captured here as the Figma-side evolution.

## Phase 3 partial scope (CREW-126, 2026-05-09)

Phase 3's plan asked for variable bindings + component instance swaps across all 11 frames in the screens file (`9FeJPriqdsdA4n9R5Xsrr8`). Inspection during the autonomous run found three blockers that scoped Phase 3 down to the font fix only:

1. **Zero existing variable bindings** anywhere in the file. ~3,810 nodes total, ~2,400 fill-bearing nodes (FRAME + RECTANGLE), all hardcoded hex. Mapping hex → semantic Crew token requires designer judgment per element — close shades of slate (slate-900 vs slate-950) map to _different_ tokens (`background` vs `card`), and a heuristic can't tell them apart from the hex alone. Doing this autonomously risked visually-broken screens.
2. **Crew DS has zero composite components** at this stage. Phase 4 builds those incrementally; Crew DS today is the `Crew / Semantic Colors` override collection only. The plan's "rebuild as Crew DS Modal/Dialog/Form instances" can't run because those components don't exist yet. Core's shadcn-kit primitives are searchable from the screens file but Core is not formally added as a library — only Crew DS is — so Core instantiation may fail and would deliver raw shadcn aesthetic rather than the intended Crew brand.
3. **File rename is API-blocked.** `figma.root.name` setter throws "Setting the document name is currently not supported" in the Plugin API. Renaming "Document" → "Crew Dashboard Screens" requires manual desktop UI action.

What CREW-126 _did_ land:

- **Font fix on all 11 frames** — every text node using `Sora` (the html.to.design import substitute) was swapped to `Hanken Grotesk`, preserving each node's style (Regular, SemiBold). 429 single-font nodes mutated; 3 mixed-font nodes had their Sora segments replaced via `setRangeFontName`. Existing `Fira Code` segments (the dashboard's mono font, already correct) were left untouched. After the swap, font usage across the 920 text nodes is exclusively `Hanken Grotesk` + `Fira Code`. Verified visually on the Agents List frame.
- **Documentation of deferred work** — three followup entries in `docs/followups.md` (color binding, composite rebuild, manual rename) capture the deferred scope with enough context to ticket later.

Frame inventory at the time (11 frames, all on Page 1):

| #   | Frame                                      | Node ID  | Type     |
| --- | ------------------------------------------ | -------- | -------- |
| 1   | Agents List (/)                            | `1:2`    | imported |
| 2   | Agents List (/) - Agent Drawer Open        | `1:378`  | imported |
| 3   | Agent Page (/agent/XXX-123/full)           | `1:1900` | imported |
| 4   | Projects list (/projects)                  | `1:2334` | imported |
| 5   | Project Page (/projects/project-name)      | `1:2443` | imported |
| 6   | Projects page (/projects) - Register modal | `1:2649` | imported |
| 7   | New Run modal - 1. Select Project          | `1:2980` | imported |
| 8   | New Run modal - 2. Select Ticket           | `1:3418` | imported |
| 9   | New Run modal - 3. Confirm                 | `9:2`    | ad-hoc   |
| 10  | Project Page - Delete confirmation modal   | `18:2`   | ad-hoc   |
| 11  | Project Page - Edit project modal          | `23:2`   | ad-hoc   |

Library state on the screens file at end of CREW-126: only `Crew Design System` was formally added (verified via `get_libraries`). Crew DS variables resolved through Crew → Core's `mode` → `tw/colors` because Crew DS had Core formally linked (CREW-124). To bind fills directly to Core variables in this file, a future ticket would need to add Core as a library via the Figma desktop Libraries UI first (same `importVariableByKeyAsync`-without-formal-link gap documented in CREW-124).

### User-only finalization step (CREW-126)

1. Open the file at `screens_file_url` (currently shown as "Document" in the file browser).
2. Click the title at the top-left of the file and rename it to **Crew Dashboard Screens**. The slug in the URL is cosmetic and won't change.
3. (Optional, blocks the color-binding followup) Open the Libraries panel (Assets panel → small library/grid icon, OR file menu → Libraries) and add `Core Design System` to the file. This formalizes access to Core's primitives so future tickets can swap detached structures to Core's `Button`, `Dialog`, etc. before Crew DS composites land in Phase 4.

## User-only finalization step (Task 2.15 — CREW-124 publish + cross-library link)

The Figma desktop client is required to publish a library and to formalize cross-library dependencies — the Plugin API exposes no equivalent for either. To complete CREW-124 acceptance:

1. Open the new `Crew Design System` file in Figma desktop (URL in `project_library_url`).
2. The file was created in the team's Drafts via `create_new_file`. Move it into the team's `Design Systems` project (right-click in file browser → Move to project) so it sits alongside Core.
3. **Add Core as a library dependency.** Open the Libraries panel (Assets panel → small library/grid icon at the top, OR file menu → Libraries). Search "Core" — `Core Design System` will appear in the discoverable list but **will not** be auto-added by the agent's work. Click **Add to file** next to it. This step is NON-OPTIONAL: the agent uses `importVariableByKeyAsync` to alias Crew variables to Core's, but that API doesn't establish the formal library link — only the Libraries UI does. Without the library link, Crew DS publishes successfully but downstream consumers cannot resolve the alias chain (their imported Crew variables dead-end at Crew's reference to a "missing" remote variable).
4. Click the Assets panel → Publish library button (top-right of the panel). Confirm the publish review (`Crew / Semantic Colors`, 48 variables, plus the new Core Design System dependency, no components yet).
5. Once the modal reports success, mark CREW-124 Done.

The **generalization** about `importVariableByKeyAsync` not establishing formal library links is captured in the rules doc — it applies to any future cross-library aliasing ticket.

After publish, downstream work unblocked: `CREW-125` (Code Connect mappings) needed Crew DS components later, and `CREW-126` (screen migration) consumes Crew DS variables.

## Code Connect publish: decision rationale

Decided 2026-05-09 evening that upgrading the team plan to Org / Enterprise (~$45/seat/month vs Pro's ~$15) isn't justified for a single-dev project. Trade-off explored:

- **Pro:** Code Connect publish would let designers see real shadcn JSX (with the right CVA variant prop bindings) when they Inspect a primitive in Figma's Dev Mode panel.
- **Con:** Org plan is a 3× price jump and Crew has one developer; the integration is nice-to-have, not load-bearing.
- **Alternative chosen:** `.figma.tsx` mapping files stay in code as inert documentation. The `design-with-figma` skill (Phase 5, separate Epic) reads them from disk directly when translating a Figma primitive instance into shadcn JSX — the skill's resolution path doesn't need Code Connect's Dev Mode integration; it talks to the codebase, not Figma's API.

The decision is reversible — the file structure stays compatible with a future publish if the team plan ever changes. Re-evaluate if (a) Crew upgrades to Org for unrelated reasons, or (b) Code Connect publish becomes available on Professional plans, or (c) Dev Mode Inspect resolution becomes valuable for human devs who don't go through the design-with-figma skill.

### Verification (post-publish, optional)

Once Crew DS is published AND added to the screens file (`9FeJPriqdsdA4n9R5Xsrr8`) as a library, this MCP check confirms the alias chain resolves:

```js
// In a use_figma call against the screens file
const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
return libs.reduce((acc, c) => {
  acc[c.libraryName] = (acc[c.libraryName] || 0) + 1;
  return acc;
}, {});
// Expected: { "Crew Design System": 1 } at minimum (Core comes via alias chain, not directly)
```

A non-empty result confirms the library link is formal. To prove the alias chain resolves end-to-end through both layers, bind a frame's fill to Crew's `background` variable and toggle modes — the resolved color should swap from Core's `white` (Light) to Core's `neutral/950` (Dark).

## Project-specific note

This document originally lived at `docs/plans/design-system.md` and prefixed itself with "Project-specific: This document is for the crew project. Recipes (queued next) will have its own `recipes/docs/plans/design-system.md`." That cross-project note is preserved here as a historical pointer; the Recipes project owns its own equivalent doc independently.
