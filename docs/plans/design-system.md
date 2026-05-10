---
core_library_url: 'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System'
project_library_url: 'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System'
screens_file_url: 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Untitled'
handoff_doc_root: 'docs/designs'
sync_command: '<TBD: filled in by Phase 5 reconciliation tooling>'
sample_data:
  project: 'kanban-api'
  ticket: 'KAN-23'
  user: 'kanban-api operator'
core_kit_origin: 'https://www.figma.com/community/file/1342715840824755935 (forked 2026-05-09)'
---

# Crew Design System

Project-specific config for the `design-with-figma` skill (lives at `~/.claude/skills/design-with-figma/`, generic across projects). The skill reads this doc's frontmatter for Figma file URLs, sample data, and conventions; the prose below is for human readers.

> **Project-specific:** This document is for the crew project. Recipes (queued next) will have its own `recipes/docs/plans/design-system.md` with its own frontmatter values and project-specific notes.

## Status

| Phase                                           | Status                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| Phase 1 — Core library                          | Agent work complete (CREW-121); user must publish in Figma desktop |
| Phase 2 code — shadcn install + token migration | In progress (CREW-122)                                             |
| Phase 2 code — add primitives                   | Not started (CREW-123)                                             |
| Phase 2 Figma — Crew DS override layer          | Agent work complete (CREW-124); user must publish in Figma desktop |
| Phase 2 — Code Connect                          | Not started (CREW-125)                                             |
| Phase 3 — Migrate screens                       | Not started (CREW-126)                                             |
| Phase 4 — Full Crew DS coverage                 | Not started (separate Epic)                                        |
| Phase 5 — Skill v1 + reconciliation tooling     | Not started (separate Epic)                                        |

## shadcn CLI version

Pinned to **`shadcn@4.7.0`** (latest stable on 2026-05-09). The 4.x line ships with native Tailwind v4 support; CSS variables (`--css-variables`) is the default. Re-pin by running `npx -y shadcn@<new-version> init --help` from a scratch directory and checking the changelog at <https://ui.shadcn.com/docs/changelog> before bumping.

### components.json schema (v4)

`packages/dashboard/components.json` was authored manually to match the v4 init output:

- `style: "new-york"`, `baseColor: "slate"`, `cssVariables: true`, `iconLibrary: "lucide"`
- `tailwind.css: "src/index.css"` (Tailwind v4 has no separate config file; tokens live in the CSS `@theme` block)
- Aliases mirror the `@/*` tsconfig path

> **Sandbox note:** `crew run` agents can't reach `ui.shadcn.com` (the registry the CLI fetches from), so `shadcn init` and `shadcn add <primitive>` need to be run by a human (or in an unsandboxed environment) for CREW-123. The pinned version + this `components.json` shape are what the CLI will reconcile against.

## Core kit fork point

Forked from the Figma community file `UkPJj6vd7HMKcey7M0XF4N` ("shadcn ui components with variables — Tailwind classes — Updated January 2026") on 2026-05-09. The community file is the source of upstream changes; we don't auto-track. Periodically (every ~6 months) check the upstream community file for meaningful additions (new shadcn primitives, lucide updates) worth manually porting.

## Core kit notes

The kit ships a `tokens` variable collection with 89 raw-numeric variables (`-0,8`, `0,4`, `640`, `1,25`, etc.). These are the kit's component-internal helpers — they are not semantically meaningful design tokens, and their `[]` empty scopes already keep them out of most Figma property pickers. Designers should ignore the `tokens` collection; pick from `tw/*` (primitives), `mode` (semantic light/dark aliases), or the new `Core / Breakpoints` collection instead.

The kit was forked at the upstream community version `Updated January 2026`. We don't auto-track upstream — see `core_kit_origin` in the frontmatter for the source URL and re-evaluate every ~6 months.

## Core library inventory

Captured 2026-05-09 from CREW-121 agent run. All 17 collections have explicit per-variable scopes (no `ALL_SCOPES` defaults).

| Collection                             | Modes                 | Variables | Types               | Scopes applied                                                                                                                                                                                              |
| -------------------------------------- | --------------------- | --------: | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tw/colors`                            | Mode 1                |       244 | COLOR               | `EFFECT_COLOR`, `FRAME_FILL`, `SHAPE_FILL`, `STROKE_COLOR`, `TEXT_FILL`                                                                                                                                     |
| `tw/padding`                           | Mode 1                |       245 | FLOAT               | `GAP`, `WIDTH_HEIGHT`                                                                                                                                                                                       |
| `tw/space`                             | Mode 1                |        68 | FLOAT               | `GAP`, `WIDTH_HEIGHT`                                                                                                                                                                                       |
| `tw/border-radius`                     | Mode 1                |       149 | FLOAT               | `CORNER_RADIUS`                                                                                                                                                                                             |
| `tw/margin`                            | Mode 1                |       245 | FLOAT               | `GAP`, `WIDTH_HEIGHT`                                                                                                                                                                                       |
| `tokens`                               | Mode 1                |        89 | FLOAT               | (left empty — kit internals; see Core kit notes)                                                                                                                                                            |
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
- **Layout primitives added.** Three components on a new `Layout Primitives` page; details below.
- **Removed malformed `Type=Button group` variant from the `Buttons` set on the `Button` page (id `1463:5795`).** Upstream kit shipped this single variant declaring only `Type` while every sibling variant in the set declared `Type=X, State=Y`. Figma's variant-completeness check flagged the Buttons set as invalid at publish time, blocking the entire library publish. The variant was vestigial — the kit ships a separate `Button Group` page with its own dedicated component, so the orphaned variant inside Buttons was a leftover from an upstream refactor. After deletion, the set has 26 valid variants across `Type` (13 options incl. `primary`, `secondary`, `destructive`, `outline`, `hhost` (sic — upstream typo for `ghost`), `link`, `icon`, `with icon`, `loading`, four size variants, `Rounded`) and `State` (3 options: `default`, `hover`, `loading`), and the publish step succeeds.

### Layout primitives (new in CREW-121)

The kit doesn't ship with layout primitives. Three project-agnostic components were added to a new `Layout Primitives` page:

| Component   | Page node id | Auto-layout                               | Default spacing binding                                 |
| ----------- | ------------ | ----------------------------------------- | ------------------------------------------------------- |
| `Stack`     | `3016:3`     | Vertical, hug width + height              | `itemSpacing` → `tw/gap / gap-4` (16px)                 |
| `Cluster`   | `3016:10`    | Horizontal, wrap on overflow              | `itemSpacing` + `counterAxisSpacing` → `tw/gap / gap-4` |
| `Container` | `3016:21`    | Vertical, max-width-constrained, centered | `maxWidth` → `tw/max-width / max-w-7xl` (1280px)        |

Override the bound variable on an instance to switch to a different `tw/gap` or `tw/max-width` value.

## User-only finalization step (Task 1.7)

The Figma desktop client is required to publish a library — the Plugin API exposes no equivalent. To complete CREW-121 acceptance:

1. Open `Core Design System` in the Figma desktop app.
2. Click the Assets panel (left sidebar) → Publish library button (top-right of the panel).
3. Confirm the publish review (reviews all collections + components added/changed by this ticket).
4. Once the modal reports success, mark CREW-121 Done.

After publish, downstream tickets unblock: `CREW-124` (Crew DS Figma file) imports Core, and Crew screens (`CREW-126`) eventually consume Crew DS.

## Crew DS structure

Crew Design System lives at `project_library_url` and is a thin override layer over Core. It currently consists of one variable collection and zero components — composites (AgentRow, ProjectSection, etc.) are added incrementally during Phase 4 fidelity tickets.

### `Crew / Semantic Colors` collection

Mirrors every variable in Core's `mode` collection 1:1. Each Crew variable shares its name with the Core token, declares the same type and explicit scopes Core uses, and aliases the Core token in both `light mode` and `dark mode`. Mode toggles in consuming files cascade through Crew → Core's `mode` → the underlying `tw/colors` (or `tw/border-radius`, `tw/border-width`, `tw/stroke-width`) primitive.

Naming caveat: the collection is named `Crew / Semantic Colors` per the Phase 2 plan, but it actually mirrors all 48 Core `mode` tokens — 36 COLOR plus 12 FLOAT (10 radii + `border-width` + `stroke-width`). The FLOATs are included so the entire Core `mode` surface is overridable from a single Crew location, satisfying the "every Core mode token has an alias" definition of done. Future cleanup may rename the collection to drop the `Colors` qualifier.

| Type  | Count | Names                                                                                                                                                                                                                                                                                                  | Scopes                                                                |
| ----- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| COLOR |    36 | `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`, `chart-1`…`chart-5`, `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring`, `background-color`, `semantic-background`, `semantic-border`, `semantic-foreground` | `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`, `EFFECT_COLOR` |
| FLOAT |    10 | `radius-none`, `radius-xs`, `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`, `radius-2xl`, `radius-3xl`, `radius-4xl`, `radius-full`                                                                                                                                                                | `CORNER_RADIUS`                                                       |
| FLOAT |     2 | `stroke-width`, `border-width`                                                                                                                                                                                                                                                                         | `STROKE_FLOAT`                                                        |

Total: **48 variables across 1 collection**, no `ALL_SCOPES` defaults.

### v1 overrides

None for v1. The dashboard's existing dark slate aesthetic matches Core's shadcn-default `mode/dark mode` values closely enough that a delta layer isn't needed yet. All Crew aliases pass straight through to Core. Future Crew brand work re-points specific aliases (e.g. swap `Crew/primary` from Core's `mode/primary` to a `tw/colors / blue/500`) without touching consumer files.

### Mode resolution

Consumer files (Crew Dashboard Screens) bind to Crew's tokens. Mode resolution chains `Crew / Semantic Colors → Core / mode → Core / tw/colors`. Because the chain crosses two collections, consumer frames must set the mode on **both** Crew and Core for theming to track end-to-end — Phase 3 (CREW-126) will document and standardize this.

## Component inventory

(Populated as Phase 2-3 lands. Each Crew DS component will be listed with its Figma node ID for ticket cross-references.)

## User-only finalization step (Task 2.15)

The Figma desktop client is required to publish a library — the Plugin API exposes no equivalent. To complete CREW-124 acceptance:

1. Open the new `Crew Design System` file in Figma desktop (URL in `project_library_url`).
2. The file was created in the team's Drafts via `create_new_file`. Move it into the team's `Design Systems` project (right-click in file browser → Move to project) so it sits alongside Core.
3. With Core published already (CREW-121), Crew DS already has Core's variables imported by key — Assets → Libraries should show Core listed as a dependency. If it isn't shown, enable it manually.
4. Click the Assets panel → Publish library button (top-right of the panel). Confirm the publish review (`Crew / Semantic Colors`, 48 variables, no components yet).
5. Once the modal reports success, mark CREW-124 Done.

After publish, downstream work unblocks: `CREW-125` (Code Connect mappings) needs Crew DS components later, and `CREW-126` (screen migration) consumes Crew DS variables.

## Conventions

(Populated incrementally. Project-specific design decisions captured here so future tickets can cite them.)

### Sample data

When mocking up screens, use the canonical sample data from the frontmatter (`kanban-api` project, `KAN-23` ticket) rather than inventing new examples. Keeps screens consistent across the file and makes navigation easier.

### Fonts

Crew dashboard uses **Hanken Grotesk** (sans) + **Fira Code** (mono) per `packages/dashboard/src/index.css`. Earlier Figma frames imported via html.to.design substituted **Sora** because Hanken Grotesk wasn't available at capture time — Phase 3 migration corrects this.

### Theme

Dashboard ships dark-only as default (the `<html class="dark">` is set at app boot in `main.tsx`). Crew DS supports both Light and Dark modes via the inherited `Crew / Semantic Colors` collection; Crew screens default to Dark canvas mode.
