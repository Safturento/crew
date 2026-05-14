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

| Type  | Count | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Scopes                                                                  |
| ----- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| COLOR |    36 | `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`, `chart-1`…`chart-5`, `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring`, `background-color`, `semantic-background`, `semantic-border`, `semantic-foreground` | `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`, `EFFECT_COLOR` |
| FLOAT |    10 | `radius-none`, `radius-xs`, `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`, `radius-2xl`, `radius-3xl`, `radius-4xl`, `radius-full`                                                                                                                                                                                                                                                                                                                                                                                                                                   | `CORNER_RADIUS`                                                         |
| FLOAT |     2 | `stroke-width`, `border-width`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `STROKE_FLOAT`                                                          |

Total: **48 variables across 1 collection**, no `ALL_SCOPES` defaults.

### v1 overrides — direct alias to Tailwind slate (CREW-127, 2026-05-10)

Crew DS aliases all 19 standard shadcn semantic variables and 8 state tokens **directly** to `Core / tw/colors / *` primitives, **bypassing Core's `mode` collection**. The dashboard's `.dark` block in `packages/dashboard/src/index.css` was custom blue-tinted hex values (`#05060a` etc.) that didn't match Core's pure-grayscale neutral defaults — so the original "no override needed" assumption was invalidated. Both code (CSS) and Figma (Crew DS) now reference identical Tailwind shade names, ensuring code-design parity by construction.

Mapping (both light and dark modes alias to the same `tw/colors` target since `tw/colors` is single-mode / mode-invariant):

| Crew semantic            | → Core tw/colors target         |
| ------------------------ | ------------------------------- |
| `background`             | `slate/950`                     |
| `foreground`             | `slate/200`                     |
| `card`                   | `slate/900`                     |
| `card-foreground`        | `slate/200`                     |
| `popover`                | `slate/900`                     |
| `popover-foreground`     | `slate/200`                     |
| `primary`                | `slate/200`                     |
| `primary-foreground`     | `slate/900`                     |
| `secondary`              | `slate/800`                     |
| `secondary-foreground`   | `slate/200`                     |
| `muted`                  | `slate/800`                     |
| `muted-foreground`       | `slate/400`                     |
| `accent`                 | `slate/800`                     |
| `accent-foreground`      | `slate/200`                     |
| `destructive`            | `red/400`                       |
| `destructive-foreground` | `slate/50`                      |
| `border`                 | `white` (consumers carry alpha) |
| `input`                  | `white` (consumers carry alpha) |
| `ring`                   | `slate/500`                     |

State tokens use `*-400` shades to match the dashboard's lightness ~0.7 OKLCH values:

| State token          | → Core tw/colors target |
| -------------------- | ----------------------- |
| `state/initializing` | `blue/400`              |
| `state/running`      | `slate/400`             |
| `state/idle`         | `slate/500`             |
| `state/waiting`      | `amber/400`             |
| `state/pr-open`      | `violet/400`            |
| `state/error`        | `red/400`               |
| `state/finished`     | `emerald/500`           |
| `state/foreground`   | `slate/950`             |

`border` and `input` alias to `white` (RGB only) — consumer fills carry the alpha (e.g. screens-file fills use opacity 0.04 / 0.06 / 0.07 / 0.12 for the white-overlay pattern). This pattern is required because Figma variable aliases don't have alpha overlay built-in.

**Deferred groups (untouched, still aliased through Core's `mode` collection):**

- 5 `chart-*` tokens (`chart-1` through `chart-5`)
- 8 `sidebar-*` tokens (`sidebar`, `sidebar-foreground`, …, `sidebar-ring`)
- 4 kit-extras (`background-color`, `semantic-background`, `semantic-border`, `semantic-foreground`)

Total: 17 deferred variables — unused at runtime; address when first usage appears.

### Mode resolution

Consumer files (Crew Dashboard Screens) bind to Crew's tokens. Mode resolution chains `Crew / Semantic Colors → Core / tw/colors` directly (since 2026-05-10's palette correction). Because `tw/colors` is mode-invariant (single-mode collection), consumer frames only need to set explicit mode on `Crew / Semantic Colors` — the underlying primitive doesn't change with mode. Light/dark differentiation comes from Crew DS's per-mode aliasing (currently both modes alias to the same slate shade since dashboard ships dark-only; future light-mode design pass would change the light-mode aliases).

This simpler single-collection chain means the figma-design-system-propagation skill's Trap 2 (two-collection mode chain) **does not apply** to Crew DS consumers as of 2026-05-10.

### Extending the palette

Three patterns cover any future palette additions. Each preserves the convention that **the Tailwind class name in code matches the variable name in Figma** — designer says "I used `bg-warning`" → developer ships `bg-warning` → no translation step.

**Pattern 1 — Color already in Tailwind palette.**

- _Code:_ use `bg-blue-500` directly, or hook through a semantic via `var(--color-blue-500)`
- _Figma:_ alias from Crew Semantic Colors to `Core / tw/colors / blue/500`. Or use the primitive directly without a semantic name.
- No new infrastructure. Current palette correction (CREW-127) is entirely Pattern 1.

**Pattern 2 — Brand-new custom color not in Tailwind.**

- _Code:_ extend `@theme` block in `packages/dashboard/src/index.css`:
  ```css
  @theme {
    --color-brand-purple: #5b21b6;
  }
  ```
  Tailwind v4 auto-generates `bg-brand-purple`, `text-brand-purple`, etc.
- _Figma:_ create a `Crew / Primitives` collection (JIT — only when first needed), add `brand-purple` variable. Optional: add a Crew Semantic Colors variable aliasing to it for semantic naming.

**Pattern 3 — Custom semantic on existing Tailwind value.**

- _Code:_ extend `@theme` block: `--color-warning: var(--color-blue-500)`
- _Figma:_ add `warning` variable to Crew Semantic Colors aliasing to `tw/colors / blue/500`. Same shape as how state tokens (`state/waiting` → `tw/colors / amber/400`) work today (added in CREW-119).

## Component inventory

Each Crew DS composite is listed with its Figma node ID (in `DsA7QuEa2WthDATkksd1Bq`) and dashboard counterpart path. New entries land per fidelity ticket as Phase 4 unfolds.

### CREW-119 (agents list vertical slice, 2026-05-10)

All six composites live on the `Composites` page in Crew DS. The Figma builds are skeleton-fidelity — names, semantic-token bindings (where applicable), and slot structure are correct; pixel polish is opportunistic and lands during follow-on visual sweeps.

| Composite        | Figma node | Dashboard counterpart                                  | Code Connect mapping                                         |
| ---------------- | ---------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| `BrandMark`      | `19:3`     | `packages/dashboard/src/components/BrandMark.tsx`      | `packages/dashboard/src/components/BrandMark.figma.tsx`      |
| `StateBadge` set | `20:23`    | `packages/dashboard/src/components/StateBadge.tsx`     | `packages/dashboard/src/components/StateBadge.figma.tsx`     |
| `TopNav`         | `21:2`     | `packages/dashboard/src/components/TopNav.tsx`         | `packages/dashboard/src/components/TopNav.figma.tsx`         |
| `AgentRow`       | `21:9`     | `packages/dashboard/src/components/AgentRow.tsx`       | `packages/dashboard/src/components/AgentRow.figma.tsx`       |
| `ProjectSection` | `21:21`    | `packages/dashboard/src/components/ProjectSection.tsx` | `packages/dashboard/src/components/ProjectSection.figma.tsx` |
| `AgentsList`     | `21:25`    | `packages/dashboard/src/components/AgentsList.tsx`     | `packages/dashboard/src/components/AgentsList.figma.tsx`     |

`StateBadge` is published as a **component set** with one variant per agent state (`state=initializing | running | idle | waiting | pr-open | error | finished`); the `.figma.tsx` mapping bridges Figma's kebab `pr-open` to the dashboard's snake `pr_open` via `figma.enum`. The other five are single components — Figma variant axes will grow as future fidelity tickets surface a need (e.g. AgentRow's `state` axis, TopNav's `route` axis).

### CREW-117 (agent drawer vertical slice, 2026-05-10)

Four additional composites added to the `Composites` page. Same skeleton-fidelity bar as CREW-119: structural slots, semantic-token bindings on fills/strokes, and representative content; pixel polish lands later.

| Composite         | Figma node | Dashboard counterpart                                   | Code Connect mapping                                          |
| ----------------- | ---------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `AgentBody`       | `24:2`     | `packages/dashboard/src/components/AgentBody.tsx`       | `packages/dashboard/src/components/AgentBody.figma.tsx`       |
| `StateHistoryBar` | `25:4`     | `packages/dashboard/src/components/StateHistoryBar.tsx` | `packages/dashboard/src/components/StateHistoryBar.figma.tsx` |
| `TokenTable`      | `26:4`     | `packages/dashboard/src/components/TokenTable.tsx`      | `packages/dashboard/src/components/TokenTable.figma.tsx`      |
| `ViewportFrame`   | `27:4`     | `packages/dashboard/src/components/ViewportFrame.tsx`   | `packages/dashboard/src/components/ViewportFrame.figma.tsx`   |

All four are single components (no Figma variant axes). `AgentBody` composes a `StateBadge` instance in its header; the body slot is a placeholder — runtime composition (Timeline / StateHistoryBar / TokenTable mounting) is tracked separately (see followup `2026-05-08 — Wire StateHistoryBar and TokenTable into AgentBody`). The dashboard's `AgentBody.tsx` was refactored in CREW-117 to consume shadcn `Button` (variant `outline` + `ghost`, size `xs`) for the View PR / Open as page / Copy worktree-path actions, replacing inline `<a>` and `<button>` markup.

After CREW-117, **Phase 4 has 10 of 11 composites built** — only `ErrorFallback` remains. It will land alongside the next fidelity ticket that surfaces a need for it (likely a settings or error-state route).

### CREW-131 (Projects view vertical slices, 2026-05-10)

Four additional composites added to the `Composites` page. Built end-to-end during the CREW-131 closeout interactive session — the dashboard code (CREW-132 + CREW-133) shipped via autonomous `crew run`, then we built the matching Crew DS composites + migrated the screens-file frames in a follow-on session.

| Composite            | Figma node | Dashboard counterpart                                      | Code Connect mapping                                             |
| -------------------- | ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `CountBadge`         | `77:28`    | `packages/dashboard/src/components/CountBadge.tsx`         | `packages/dashboard/src/components/CountBadge.figma.tsx`         |
| `ProjectRow`         | `79:14`    | `packages/dashboard/src/components/ProjectRow.tsx`         | `packages/dashboard/src/components/ProjectRow.figma.tsx`         |
| `ProjectHeader`      | `82:15`    | `packages/dashboard/src/components/ProjectHeader.tsx`      | `packages/dashboard/src/components/ProjectHeader.figma.tsx`      |
| `ProjectConfigBlock` | `83:15`    | `packages/dashboard/src/components/ProjectConfigBlock.tsx` | `packages/dashboard/src/components/ProjectConfigBlock.figma.tsx` |

`CountBadge` is published as a **component set** with one variant per agent state (`state=initializing | running | idle | waiting | pr-open | error | finished`) — same enum mapping pattern as `StateBadge`. The other three are single components. All use the canonical mid intensity (bg 10% / border 30% / text 100%) bound to Crew Semantic tokens.

Notes:

- `ProjectRow` composes a `CountBadge` instance (waiting variant) for the activeCount column. Designers can swap variant per-row to indicate a different state coloring.
- `ProjectHeader`'s Edit/Remove action buttons are inline-styled (Edit = transparent + border; Remove = canonical mid destructive). They should eventually be replaced with real shadcn `Button` instances for full design-system consistency — tracked as a polish followup.
- `ProjectConfigBlock` wraps a TOML-formatted text node in a `card`-styled frame with `border` overlay. Padding p-6 (24px), corner radius 14px to match the dashboard's `rounded-[14px]`.

After CREW-131, **Phase 4 has 14 composites total** — 10 from CREW-117/119 + 4 from CREW-131. `ErrorFallback` is still the only un-built composite from the original Phase 4 inventory.

Frames `1:2334` (Projects list) and `1:2443` (Project detail) in the screens file (`9FeJPriqdsdA4n9R5Xsrr8`) migrated 2026-05-10 — fills bound to Crew DS tokens (47/47 + 73/74 = 120/121 = 99%), explicit dark mode set on Crew Semantic Colors, detached state pills swapped to StateBadge instances, count-badge bg fills forced to opacity 0.18 per propagation skill Trap 1.

### State-color semantic tokens (added in CREW-119, extended 2026-05-10)

`Crew / Semantic Colors` now includes **7 state tokens** (`state/initializing`, `state/running`, `state/idle`, `state/waiting`, `state/pr-open`, `state/error`, `state/finished`) — each a single-value alias to a `tw/colors` primitive in Core (`blue/500`, `slate/400`, `slate/500`, `amber/400`, `violet/500`, `red/500`, `emerald/500` respectively). No light/dark variant for state colors at this stage — both modes alias the same primitive. Used by `StateBadge` (token-bound fills + stroke + dot) and by the dashboard's `--color-state-*` Tailwind classes via the `@theme` block. First example of the Crew DS override layer growing past shadcn's vocabulary.

A `state/foreground` token was added on 2026-05-10 — aliases `tw/colors / slate/950` (mode-invariant). Reserved for fixed-dark text on bright state-color backgrounds; not currently consumed by `StateBadge` (which uses the tinted-bg pattern below) but available for future overlays/tag treatments where a dark-on-bright contrast is wanted.

Total Crew DS variable count: **56 across 1 collection** (48 from Phase 2 + 7 state tokens from CREW-119 + 1 state-foreground from 2026-05-10).

### StateBadge visual pattern (canonical, 2026-05-10 / extended CREW-130)

The `StateBadge` set on the Crew DS Composites page is the canonical pill treatment, mirroring the dashboard's CVA `intensity` variant in `packages/dashboard/src/components/StateBadge.tsx`. The set has **21 variants**: 7 states × 3 intensities. Both surfaces (Figma + code) reference identical Tailwind opacity values via Tailwind v4 slash syntax (`bg-state-X/10`, `border-state-X/30`).

**Canonical opacities by intensity:**

| Intensity       | Bg fill              | Stroke               | Text                           | Dot         |
| --------------- | -------------------- | -------------------- | ------------------------------ | ----------- |
| `muted`         | transparent (0%)     | `state/X` at 40%     | `state/X` ✓                    | `state/X` ✓ |
| `mid` (default) | `state/X` at **10%** | `state/X` at **30%** | `state/X` ✓                    | `state/X` ✓ |
| `loud`          | `state/X` at 100%    | `state/X` at 100%    | `state/foreground` (slate/950) | `state/X` ✓ |

`mid` is the default and what every state pill in migrated frames + composites uses today. `muted` and `loud` exist for future use (e.g. inline status indicators, full-color destructive call-out buttons).

**Code-Figma parity contract:** the dashboard's `STATE_CLASSES` in `packages/dashboard/src/data/state-meta.ts` defines `bg10` → `bg-state-X/10` (10% bg) and `border30` → `border-state-X/30` (30% border) classes. When changing canonical opacities, update both the Figma variants AND `STATE_CLASSES` in code — same value in both places.

**Embedding caveat for composites:** when a composite (`AgentBody`, `StateHistoryBar`, etc.) needs a state pill, it must compose a real `StateBadge` instance — not a hand-built ellipse + text. Hand-built pills don't inherit future StateBadge updates (opacity tweaks, new state variants) and drift from the canonical pattern. The `AgentBody` and `StateHistoryBar` composites both had hand-rolled pills until 2026-05-10 — both now compose real `StateBadge` instances.

**Figma Plugin API gotcha:** `inst.fills = [...]` and `inst.strokes = [...]` overrides on a fresh instance (created via `variant.createInstance()`) **do not inherit** the variant's opacity property — instances default to opacity 1.0 even when the variant has 0.10. Always force opacity explicitly after `createInstance()` or `swapComponent()`. Same gotcha applies to `setBoundVariableForPaint` which silently drops the input paint's opacity. See `figma-design-system-propagation` skill Trap 1 for the workaround pattern.

## Phase 3 partial scope (CREW-126, 2026-05-09)

Phase 3's plan asked for variable bindings + component instance swaps across all 11 frames in the screens file (`9FeJPriqdsdA4n9R5Xsrr8`). Inspection during the autonomous run found three blockers that scoped Phase 3 down to the font fix only:

1. **Zero existing variable bindings** anywhere in the file. ~3,810 nodes total, ~2,400 fill-bearing nodes (FRAME + RECTANGLE), all hardcoded hex. Mapping hex → semantic Crew token requires designer judgment per element — close shades of slate (slate-900 vs slate-950) map to _different_ tokens (`background` vs `card`), and a heuristic can't tell them apart from the hex alone. Doing this autonomously risked visually-broken screens.
2. **Crew DS has zero composite components** at this stage. Phase 4 builds those incrementally; Crew DS today is the `Crew / Semantic Colors` override collection only. The plan's "rebuild as Crew DS Modal/Dialog/Form instances" can't run because those components don't exist yet. Core's shadcn-kit primitives are searchable from the screens file but Core is not formally added as a library — only Crew DS is — so Core instantiation may fail and would deliver raw shadcn aesthetic rather than the intended Crew brand.
3. **File rename is API-blocked.** `figma.root.name` setter throws "Setting the document name is currently not supported" in the Plugin API. Renaming "Document" → "Crew Dashboard Screens" requires manual desktop UI action.

What CREW-126 _did_ land:

- **Font fix on all 11 frames** — every text node using `Sora` (the html.to.design import substitute) was swapped to `Hanken Grotesk`, preserving each node's style (Regular, SemiBold). 429 single-font nodes mutated; 3 mixed-font nodes had their Sora segments replaced via `setRangeFontName`. Existing `Fira Code` segments (the dashboard's mono font, already correct) were left untouched. After the swap, font usage across the 920 text nodes is exclusively `Hanken Grotesk` + `Fira Code`. Verified visually on the Agents List frame.
- **Documentation of deferred work** — three followup entries in `docs/followups.md` (color binding, composite rebuild, manual rename) capture the deferred scope with enough context to ticket later.

Frame inventory (11 frames, all on Page 1):

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

Library state on the screens file at end of CREW-126: only `Crew Design System` is formally added (verified via `get_libraries`). Crew DS variables resolve through Crew → Core's `mode` → `tw/colors` because Crew DS has Core formally linked (CREW-124). To bind fills directly to Core variables in this file, a future ticket would need to add Core as a library via the Figma desktop Libraries UI first (same `importVariableByKeyAsync`-without-formal-link gap documented in CREW-124).

### User-only finalization step (CREW-126)

Same pattern as Phases 1 and 2: a few finalization actions can only be done in Figma desktop.

1. Open the file at `screens_file_url` (currently shown as "Document" in the file browser).
2. Click the title at the top-left of the file and rename it to **Crew Dashboard Screens**. The slug in the URL is cosmetic and won't change.
3. (Optional, blocks the color-binding followup) Open the Libraries panel (Assets panel → small library/grid icon, OR file menu → Libraries) and add `Core Design System` to the file. This formalizes access to Core's primitives so future tickets can swap detached structures to Core's `Button`, `Dialog`, etc. before Crew DS composites land in Phase 4.

## User-only finalization step (Task 2.15)

The Figma desktop client is required to publish a library and to formalize cross-library dependencies — the Plugin API exposes no equivalent for either. To complete CREW-124 acceptance:

1. Open the new `Crew Design System` file in Figma desktop (URL in `project_library_url`).
2. The file was created in the team's Drafts via `create_new_file`. Move it into the team's `Design Systems` project (right-click in file browser → Move to project) so it sits alongside Core.
3. **Add Core as a library dependency.** Open the Libraries panel (Assets panel → small library/grid icon at the top, OR file menu → Libraries). Search "Core" — `Core Design System` will appear in the discoverable list but **will not** be auto-added by the agent's work. Click **Add to file** next to it. This step is NON-OPTIONAL: the agent uses `importVariableByKeyAsync` to alias Crew variables to Core's, but that API doesn't establish the formal library link — only the Libraries UI does. Without the library link, Crew DS publishes successfully but downstream consumers cannot resolve the alias chain (their imported Crew variables dead-end at Crew's reference to a "missing" remote variable).
4. Click the Assets panel → Publish library button (top-right of the panel). Confirm the publish review (`Crew / Semantic Colors`, 48 variables, plus the new Core Design System dependency, no components yet).
5. Once the modal reports success, mark CREW-124 Done.

> **Generalization:** the same `importVariableByKeyAsync`-without-formal-link gap applies to any future ticket where one published Figma library aliases variables from another. CREW-126 (screens consuming Crew DS) and any Phase 4 tickets that build composites referencing Core primitives will hit the same trap unless the agent or the user explicitly adds the source library via the Libraries UI in the consumer file.

After publish, downstream work unblocks: `CREW-125` (Code Connect mappings) needs Crew DS components later, and `CREW-126` (screen migration) consumes Crew DS variables. **Note for CREW-126:** the screens file will need Crew DS added via the Libraries UI as a separate manual step — same pattern as step 3 above.

## Code Connect publish: intentionally skipped

The `figma connect publish` step from CREW-125's plan is **intentionally not run** for this project. Code Connect publishing requires a Figma **Organization or Enterprise** team plan (per <https://github.com/figma/code-connect/blob/main/README.md>); crew is on Figma Pro Full (Professional tier), so the publish call would fail with a permissions error.

Decided 2026-05-09 evening that upgrading the team plan (~$45/seat/month vs Pro's ~$15) isn't justified for a single-dev project. Instead:

- **`.figma.tsx` files in `packages/dashboard/src/components/ui/` stay in code** as canonical documentation of the Figma → shadcn mapping. They're inert without publish — they don't surface in Figma's Dev Mode Inspect panel — but they're still authoritative as a written contract.
- **The `design-with-figma` skill (Phase 5, separate Epic) reads them from disk directly** when translating a Figma primitive instance into shadcn JSX. The skill's resolution path doesn't need Code Connect's Dev Mode integration; it talks to the codebase, not Figma's API.
- **Future Crew DS components** (added in Phase 4) should still author the matching `.figma.tsx` file alongside each component. Same convention, just no publish at the end.
- **No `FIGMA_ACCESS_TOKEN` setup needed.** No GitHub Actions secret for Figma publish needed.
- **CREW-125's Definition of Done is reduced** to "all 7 primitives have a `.figma.tsx` file authored." The "publish + Inspect panel returns shadcn JSX" criterion is dropped.

This is a reversible decision — the file structure stays compatible with future publish if the team plan ever changes. Re-evaluate if (a) we upgrade to Org for unrelated reasons, or (b) Code Connect publish becomes available on Professional plans, or (c) we want Dev Mode Inspect resolution for human devs who don't go through the design-with-figma skill.

### Verification (optional but recommended)

Once Crew DS is published AND added to the screens file (`9FeJPriqdsdA4n9R5Xsrr8`) as a library, run a quick MCP check from the screens file:

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

## Code Connect mappings (CREW-125)

Code Connect ties each shadcn primitive in `packages/dashboard/src/components/ui/*.tsx` to its Figma counterpart so designers see real shadcn JSX (with the right CVA variant prop bindings) when they Inspect a primitive in Figma.

CLI: `@figma/code-connect` v1.4.4, dev-dep on `crew-dashboard`. Config at `packages/dashboard/figma.config.json` (`codeConnect.include = ["src/components/ui/**/*.figma.tsx"]`, `parser = "react"`, `importPaths` mapping `src/*` → `@/*`).

> **Targets Core, not Crew DS.** Crew DS currently ships only the `Crew / Semantic Colors` override layer — zero components (composites land in Phase 4). Designers in Crew Dashboard Screens instance shadcn primitives directly from Core via the library link. Code Connect URLs therefore point at Core's component nodes (file `UkPJj6vd7HMKcey7M0XF4N`).

| Code component       | Mapping file                                               | Figma component (Core)                  | Figma node id |
| -------------------- | ---------------------------------------------------------- | --------------------------------------- | ------------- |
| `Button`             | `packages/dashboard/src/components/ui/button.figma.tsx`    | `Buttons` set on Button page            | `73:3681`     |
| `Badge`              | `packages/dashboard/src/components/ui/badge.figma.tsx`     | `Badge` set on Badge page               | `665:2024`    |
| `Input`              | `packages/dashboard/src/components/ui/input.figma.tsx`     | `Default` set on Input page             | `520:3062`    |
| `Dialog`             | `packages/dashboard/src/components/ui/dialog.figma.tsx`    | `Dialog` set on Dialog page             | `594:105`     |
| `Label`              | `packages/dashboard/src/components/ui/label.figma.tsx`     | `Label` set on Label page               | `76:8617`     |
| `Separator`          | `packages/dashboard/src/components/ui/separator.figma.tsx` | `Separator` component on Seperator page | `76:10202`    |
| `FormItem` (form.\*) | `packages/dashboard/src/components/ui/form.figma.tsx`      | `Field` component on Field page         | `1188:5362`   |

### Button variant mapping caveat

The community kit conflates shadcn's `variant` and `size` axes into a single Figma `Type` enum (13 values: `primary`, `secondary`, `destructive`, `outline`, `hhost` (sic — upstream typo for `ghost`), `link`, `icon`, `with icon`, `loading`, `Size-small`, `Size-default`, `Size-large`, `Rounded`). The mapping reads `Type` twice — once into shadcn's `variant`, once into `size` — with every value covered in both, since unmapped Figma values silently render as `undefined`. The `hhost` typo is preserved so existing Figma instances don't break; we map it to shadcn `ghost` in code. When Crew DS rebuilds these as Crew composites in Phase 4, the kit's variant model can be redesigned cleanly.

### Skipped: text-content extraction

Layer names inside the kit's variants are the literal text characters (e.g. the primary Button's text layer is named `Button`, the icon variant has no text layer at all), so `figma.textContent("Button")` would only land on a subset of variants. The example snippets use placeholder strings (`Button`, `Badge`, `Email`, ...) instead. Phase 4 Crew composites are the right place to introduce a stable `Label` text-property name.

### Heads-up for primitive maintainers

The `*.figma.tsx` files live under `packages/dashboard/src/components/ui/` and are picked up by the dashboard's `tsc -p tsconfig.json`. Renaming a shadcn primitive's prop union (e.g. dropping `'lg'` from Button's `size` type) will break the typecheck in the matching `*.figma.tsx`. That's a feature, not a bug — it forces you to update the Code Connect mapping in the same change.

## User-only finalization step (Task 2.16)

The `figma connect publish` CLI requires a Figma personal access token with file-content write scope. The agent doesn't have the token, so publishing is a manual step. To complete CREW-125 acceptance:

1. Generate a Figma PAT at `https://www.figma.com/settings` → Personal access tokens → Create new token, with the **File content (write)** scope. (Org tokens work too if you have one.)
2. From `packages/dashboard/`, run:

   ```bash
   FIGMA_ACCESS_TOKEN=<your-pat> npx -w crew-dashboard figma connect publish
   ```

   Or `npx -w crew-dashboard figma connect publish --token <your-pat>`.

3. Confirm the CLI reports each of the 7 mappings published successfully.
4. In Figma desktop, open `Crew Dashboard Screens` (or any file with Core added as a library). Drop a Button instance, open the Inspect panel — code section should now show `<Button variant="..." size="...">Button</Button>` instead of generic Tailwind class soup.
5. Once verified, mark CREW-125 Done.

> **Re-publishing:** any time a `*.figma.tsx` file changes (new variant mapping, prop tweak, code component renamed), re-run the publish command. The CLI is idempotent — subsequent runs replace the prior mapping for each connected URL.

## Conventions

(Populated incrementally. Project-specific design decisions captured here so future tickets can cite them.)

### Sample data

When mocking up screens, use the canonical sample data from the frontmatter (`kanban-api` project, `KAN-23` ticket) rather than inventing new examples. Keeps screens consistent across the file and makes navigation easier.

### Fonts

Crew dashboard uses **Hanken Grotesk** (sans) + **Fira Code** (mono) per `packages/dashboard/src/index.css`. Earlier Figma frames imported via html.to.design substituted **Sora** because Hanken Grotesk wasn't available at capture time — Phase 3 migration corrects this.

### Theme

Dashboard ships dark-only as default (the `<html class="dark">` is set at app boot in `main.tsx`). Crew DS supports both Light and Dark modes via the inherited `Crew / Semantic Colors` collection; Crew screens default to Dark canvas mode.
