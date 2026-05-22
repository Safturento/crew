---
name: design-system
description: Crew Figma DS + token bindings + Pill primitive contract
last_updated: 2026-05-22
covers:
  - 'packages/dashboard/src/components/**'
  - '*.figma.tsx'
  - 'packages/dashboard/components.json'
core_library_url: 'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System'
project_library_url: 'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System'
screens_file_url: 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Untitled'
handoff_doc_root: 'docs/designs'
sample_data:
  project: 'kanban-api'
  ticket: 'KAN-23'
  user: 'kanban-api operator'
core_kit_origin: 'https://www.figma.com/community/file/1342715840824755935 (forked 2026-05-09)'
---

# Design system

Crew's design system is a thin override layer over a shadcn community kit ("Core"). Code lives in `packages/dashboard/`; Figma lives across three files (Core, Crew DS, Crew Dashboard Screens — URLs in frontmatter). The `design-with-figma` user-level skill reads this file's frontmatter for URLs + sample data.

For per-ticket evolution, finalization steps, and the inventory snapshots, see [`docs/rationale/design-system.md`](../docs/rationale/design-system.md).

## shadcn install

- **Pinned CLI:** `shadcn@4.7.0`. To re-pin, run `npx -y shadcn@<new-version> init --help` from a scratch dir and check <https://ui.shadcn.com/docs/changelog> first.
- **`packages/dashboard/components.json`** (manually authored to match v4 init output): `style: "new-york"`, `baseColor: "slate"`, `cssVariables: true`, `iconLibrary: "lucide"`, `tailwind.css: "src/index.css"`. Tailwind v4 has no separate config file — tokens live in the CSS `@theme` block. Aliases mirror the `@/*` tsconfig path.
- **Sandbox gotcha:** `crew run` agents can't reach `ui.shadcn.com`. `shadcn init` and `shadcn add <primitive>` must run unsandboxed (locally or via a manual session).

## Tokens — Crew Semantic Colors → tw/colors/slate

Crew DS aliases all standard shadcn semantic variables and 8 state tokens **directly** to `Core / tw/colors / *` primitives, **bypassing Core's `mode` collection** (CREW-127, 2026-05-10). This makes the Figma color set identical to the dashboard CSS's `.dark` block. Both modes alias the same target because `tw/colors` is mode-invariant; light/dark differentiation comes from Crew DS's per-mode aliasing, and the dashboard ships dark-only.

| Crew semantic            | → `Core / tw/colors`            |
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

State tokens (8 total — 7 states + foreground):

| State token          | → `Core / tw/colors` |
| -------------------- | -------------------- |
| `state/initializing` | `blue/400`           |
| `state/running`      | `slate/400`          |
| `state/idle`         | `slate/500`          |
| `state/waiting`      | `amber/400`          |
| `state/pr-open`      | `violet/400`         |
| `state/error`        | `red/400`            |
| `state/finished`     | `emerald/500`        |
| `state/foreground`   | `slate/950`          |

`border` and `input` alias to `white` (RGB only) — consumer fills carry the alpha (screens-file fills use opacity 0.04 / 0.06 / 0.07 / 0.12 for the white-overlay pattern). Required because Figma variable aliases don't have alpha overlay built-in.

Deferred (still aliased through Core's `mode` collection, unused at runtime): 5 `chart-*`, 8 `sidebar-*`, 4 kit-extras (`background-color`, `semantic-background`, `semantic-border`, `semantic-foreground`).

### Mode resolution

Consumer files bind to Crew tokens. Resolution chain is `Crew / Semantic Colors → Core / tw/colors` directly. Because `tw/colors` is single-mode, consumer frames only need explicit mode on `Crew / Semantic Colors` — `figma-design-system-propagation` skill's Trap 2 (two-collection mode chain) **does not apply** to Crew DS consumers.

### Extending the palette

Three patterns. Each preserves the convention that **the Tailwind class name in code matches the variable name in Figma** — no translation step between designer and dev.

1. **Color already in Tailwind palette** — _Code:_ use `bg-blue-500` directly, or hook through a semantic via `var(--color-blue-500)`. _Figma:_ alias from Crew Semantic Colors to `Core / tw/colors / blue/500`. No new infrastructure.
2. **Brand-new custom color not in Tailwind** — _Code:_ extend `@theme` block in `packages/dashboard/src/index.css` (e.g. `--color-brand-purple: #5b21b6`); Tailwind v4 auto-generates `bg-brand-purple`, etc. _Figma:_ create a `Crew / Primitives` collection JIT, add the variable; optionally alias from a Crew Semantic Colors entry for semantic naming.
3. **Custom semantic on existing Tailwind value** — _Code:_ extend `@theme` block: `--color-warning: var(--color-blue-500)`. _Figma:_ add `warning` variable to Crew Semantic Colors aliasing to `tw/colors / blue/500`. Same shape as state tokens.

### Cross-library aliasing gotcha

`importVariableByKeyAsync` aliases a variable but **does not** establish the formal library link between the two files. Only the Figma desktop Libraries UI does. Without the link, the alias chain dead-ends at the consumer end. Any future ticket that aliases across published Figma libraries hits this trap unless a user explicitly adds the source library via the consumer file's Libraries UI.

## Core kit

Forked from the Figma community file in `core_kit_origin`. We don't auto-track upstream — re-evaluate every ~6 months for meaningful additions (new shadcn primitives, lucide updates) worth manually porting.

- **Designers ignore the `tokens` collection.** Core ships a `tokens` collection with 89 raw-numeric variables (`-0,8`, `640`, `1,25`, etc.) — these are component-internal helpers, not semantic tokens. Their empty `[]` scopes already hide them from most pickers. Pick from `tw/*` (primitives), `mode` (semantic light/dark aliases), or `Core / Breakpoints` instead.
- **Layout primitives** live on a `Layout Primitives` page (Core file):

  | Component   | Node id   | Auto-layout                               | Default spacing binding                                 |
  | ----------- | --------- | ----------------------------------------- | ------------------------------------------------------- |
  | `Stack`     | `3016:3`  | Vertical, hug width + height              | `itemSpacing` → `tw/gap / gap-4` (16px)                 |
  | `Cluster`   | `3016:10` | Horizontal, wrap on overflow              | `itemSpacing` + `counterAxisSpacing` → `tw/gap / gap-4` |
  | `Container` | `3016:21` | Vertical, max-width-constrained, centered | `maxWidth` → `tw/max-width / max-w-7xl` (1280px)        |

  Override the bound variable on an instance to switch to a different `tw/gap` or `tw/max-width` value.

## Crew DS structure

`Crew / Semantic Colors` is the override collection (56 variables — 48 mirroring Core's `mode` surface + 7 state tokens + 1 state-foreground). Composites grow incrementally per fidelity ticket. The collection name keeps a `Colors` suffix for historical reasons even though it also contains FLOATs (radii, stroke-widths) so the entire Core `mode` surface is overridable from one place.

### Code-shipped composites

Each has a `.tsx` implementation in `packages/dashboard/src/components/`, a matching `.figma.tsx` Code Connect mapping, and a Figma counterpart in the Crew DS file. Skeleton-fidelity bar — semantic-token bindings and slot structure are correct; pixel polish is opportunistic.

Figma node IDs below are in the live consolidated file (`9FeJPriqdsdA4n9R5Xsrr8`,
`Composites` page) — re-aimed from the archived standalone DS file by CREW-175.

| Composite            | Figma node       | Dashboard counterpart                                      |
| -------------------- | ---------------- | ---------------------------------------------------------- |
| `BrandMark`          | `220:211`        | `packages/dashboard/src/components/BrandMark.tsx`          |
| `TopNav`             | `245:133`        | `packages/dashboard/src/components/TopNav.tsx`             |
| `AgentRow`           | `212:910`        | `packages/dashboard/src/components/AgentRow.tsx`           |
| `ProjectSection`     | `220:224`        | `packages/dashboard/src/components/ProjectSection.tsx`     |
| `AgentsList`         | `220:227`        | `packages/dashboard/src/components/AgentsList.tsx`         |
| `AgentBody`          | `220:246`        | `packages/dashboard/src/components/AgentBody.tsx`          |
| `DrawerHeader`       | `594:803`        | `packages/dashboard/src/components/DrawerHeader.tsx`       |
| `StateHistoryBar`    | `220:257`        | `packages/dashboard/src/components/StateHistoryBar.tsx`    |
| `TokenTable`         | `220:287`        | `packages/dashboard/src/components/TokenTable.tsx`         |
| `TokenBarRow`        | `555:449`        | `packages/dashboard/src/components/TokenBarRow.tsx`        |
| `TokensByTool`       | `577:643`        | `packages/dashboard/src/components/TokensByTool.tsx`       |
| `ViewportFrame`      | `220:292`        | `packages/dashboard/src/components/ViewportFrame.tsx`      |
| `ProjectRow`         | `220:300`        | `packages/dashboard/src/components/ProjectRow.tsx`         |
| `ProjectHeader`      | `220:315`        | `packages/dashboard/src/components/ProjectHeader.tsx`      |
| `ProjectConfigBlock` | `220:318`        | `packages/dashboard/src/components/ProjectConfigBlock.tsx` |
| `TimelineSection`    | `559:650`        | `packages/dashboard/src/components/Timeline/TimelineSection.tsx` |

`TopNav`, `AgentRow`, and `TimelineSection` resolve to component sets in the live file; the rest resolve to single components. `ErrorFallback` is the only un-built composite from the original Phase 4 inventory; it lands alongside the next fidelity ticket that surfaces a need.

> **Figma-side Pill consolidation (2026-05-12) is now reconciled in code (CREW-135).** The Figma DS merged `Button` / `StateBadge` / `CountBadge` / `TimelineTag` into a unified `Pill` component set, and the Crew DS moved into the dashboard file. CREW-135 reconciled the dashboard code: an internal `PillBase` owns the shared anatomy, and `Button` / `Badge` / `Tag` (under `components/ui/`) wrap it. The standalone `StateBadge.tsx` and `CountBadge.tsx` composites are retired — every state pill and count pill is now a `Badge`. See [`docs/rationale/design-system.md`](../docs/rationale/design-system.md#2026-05-12-figma-side-pill-consolidation) for the migration history.

### `components/ui/` vs `components/<feature>/` split

- `packages/dashboard/src/components/ui/` — **shadcn primitives + DS primitives** (`button`, `badge`, `tag`, `input`, `dialog`, `label`, `separator`, `form`). One file per primitive plus its `.figma.tsx` mapping. `pill-base.tsx` is the one exception — an internal shared anatomy for `button` / `badge` / `tag`, never exported or imported outside those three; it has no `.figma.tsx`. Don't put crew-specific composites here.
- `packages/dashboard/src/components/` (top level) — **Crew composites** that compose primitives + crew logic. `AgentRow`, `ProjectSection`, etc.

This is the canonical shadcn convention; the `components.json` `aliases` block maps `ui → @/components/ui`.

## Pill visual pattern

The canonical pill treatment. The Figma `Pill` component set (`272:120`) carries one anatomy across `type` (tag / pill / button-*), `color` (8), and `intensity` (4) axes. In code, the internal `PillBase` owns that anatomy; `Button` / `Badge` / `Tag` wrap it and supply their own static shape.

| Intensity       | Bg fill            | Stroke                  | Text                          |
| --------------- | ------------------ | ----------------------- | ----------------------------- |
| `ghost`         | transparent        | none                    | `state/X`                     |
| `muted`         | `state/X` dark bg  | none                    | `state/X`                     |
| `mid` (default) | `state/X` dark bg  | `state/X` (1px)         | `state/X`                     |
| `loud`          | `state/X` solid    | `state/X` (same as bg)  | `state/foreground` (slate/950) |

**Code-Figma parity contract:** the surface classes come from `pillSurfaceClasses(color, intensity)` in `packages/dashboard/src/lib/pill-variants.ts`, which sources the per-state `text` / `bg` / `border` / `solidBg` / `solidBorder` Tailwind tokens from `STATE_CLASSES` in `packages/dashboard/src/data/state-meta.ts` (plus a `white` color for neutral CTAs). When changing canonical state colors, update both the Figma variants AND `STATE_CLASSES` — same value in both places.

**Icon slot:** the pill icon is a `ReactNode` `icon` prop (a leading slot mapped to Figma's `Icon` INSTANCE_SWAP), never a CSS-drawn dot. State badges pass `lucide/circle`; the badge's color, not its glyph, carries the state.

**Embedding rule:** when a composite needs a state pill or count pill, compose a real `Badge` — not a hand-built ellipse + text. Hand-built pills drift from canonical color tweaks and new state variants.

**Figma Plugin API gotcha:** `inst.fills = [...]` and `inst.strokes = [...]` on a fresh instance (created via `variant.createInstance()`) **do not inherit** the variant's opacity property — instances default to opacity 1.0 even when the variant has 0.10. Always force opacity explicitly after `createInstance()` / `swapComponent()`. `setBoundVariableForPaint` silently drops the input paint's opacity for the same reason. See `figma-design-system-propagation` skill Trap 1 for the workaround.

## Code Connect — intentionally not published

The `figma connect publish` step is **deliberately skipped**. Code Connect publishing requires a Figma **Organization or Enterprise** team plan; crew is on Figma Pro Full, so the publish call fails with a permissions error. Decision rationale lives in [`docs/rationale/design-system.md`](../docs/rationale/design-system.md#code-connect-publish-decision-rationale).

What this means in practice:

- `.figma.tsx` files in `packages/dashboard/src/components/ui/` (and Crew composite siblings) **stay in code** as inert documentation of the Figma → shadcn mapping. They don't surface in Figma's Dev Mode Inspect panel, but they remain authoritative as a written contract.
- The `design-with-figma` skill (Phase 5, separate Epic) reads them from disk directly — no Code Connect API dependency.
- Future composites should still author the matching `.figma.tsx` file alongside each component. Same convention, just no publish at the end.
- **No `FIGMA_ACCESS_TOKEN` setup needed.** No GitHub Actions secret for Figma publish needed.
- CREW-125's "all 7 primitives have a `.figma.tsx` file authored" is the Definition of Done; the "publish + Inspect panel returns shadcn JSX" criterion is dropped.

The decision is reversible — the file structure stays compatible with future publish if the team plan changes.

### Existing Code Connect mappings

`Button` / `Badge` / `Tag` map to the Crew consolidated file's unified `Pill` set (`272:120` in `9FeJPriqdsdA4n9R5Xsrr8`) — CREW-135. The remaining primitives still target Core's component nodes (file `UkPJj6vd7HMKcey7M0XF4N`), because the screens file instances those shadcn primitives directly from Core via the library link.

| Code component       | Mapping file                                               | Figma component                         | Figma node id |
| -------------------- | ---------------------------------------------------------- | --------------------------------------- | ------------- |
| `Button`             | `packages/dashboard/src/components/ui/button.figma.tsx`    | `Pill` set (Crew file)                  | `272:120`     |
| `Badge`              | `packages/dashboard/src/components/ui/badge.figma.tsx`     | `Pill` set (Crew file)                  | `272:120`     |
| `Tag`                | `packages/dashboard/src/components/ui/tag.figma.tsx`       | `Pill` set (Crew file)                  | `272:120`     |
| `Input`              | `packages/dashboard/src/components/ui/input.figma.tsx`     | `Default` set on Input page (Core)      | `520:3062`    |
| `Dialog`             | `packages/dashboard/src/components/ui/dialog.figma.tsx`    | `Dialog` set on Dialog page (Core)      | `594:105`     |
| `Label`              | `packages/dashboard/src/components/ui/label.figma.tsx`     | `Label` set on Label page (Core)        | `76:8617`     |
| `Separator`          | `packages/dashboard/src/components/ui/separator.figma.tsx` | `Separator` on Seperator page (Core)    | `76:10202`    |
| `FormItem` (form.\*) | `packages/dashboard/src/components/ui/form.figma.tsx`      | `Field` component on Field page (Core)  | `1188:5362`   |

### Pill mapping — color × intensity × type

`button.figma.tsx` / `badge.figma.tsx` / `tag.figma.tsx` map the `Pill` set's variant axes to the code contract: `color` (8 — Figma's kebab `pr-open` → code's snake `pr_open` via `figma.enum`), `intensity` (`ghost` / `muted` / `mid` / `loud`), and — for `Button` only — `type` → `size` (`button-xs|sm|default|lg` → `xs|sm|md|lg`). Each mapping also exposes the `Icon` INSTANCE_SWAP via `figma.instance('Icon')`. `Badge` and `Tag` pin `variant: { type: 'pill' }` / `{ type: 'tag' }` so the set resolves to the right anatomy. Code Connect is still not published (see above) — the `.figma.tsx` files stay as inert documentation.

### Skipped: text-content extraction

Layer names inside kit variants are the literal text characters (the primary Button's text layer is named `Button`; the icon variant has no text layer at all), so `figma.textContent("Button")` would only land on a subset. The example snippets use placeholder strings (`Button`, `Badge`, `Email`, ...) instead.

### Maintainer heads-up

The `*.figma.tsx` files under `packages/dashboard/src/components/ui/` are picked up by the dashboard's `tsc -p tsconfig.json`. Renaming a shadcn primitive's prop union (e.g. dropping `'lg'` from Button's `size` type) breaks the typecheck in the matching `*.figma.tsx`. That's a feature — it forces a Code Connect mapping update in the same change.

## Conventions

### Sample data

Use the canonical sample data in this file's frontmatter (`kanban-api` project, `KAN-23` ticket) when mocking up screens. Keeps screens consistent across the file.

### Fonts

Dashboard uses **Hanken Grotesk** (sans) + **Fira Code** (mono) per `packages/dashboard/src/index.css`. Earlier Figma frames imported via html.to.design substituted `Sora` because Hanken Grotesk wasn't available at capture time — CREW-126 corrected this. Any new Figma work uses Hanken Grotesk / Fira Code exclusively.

### Theme

Dashboard ships **dark-only** as default (`<html class="dark">` is set at app boot in `main.tsx`). Crew DS supports both light and dark modes via the inherited `Crew / Semantic Colors` collection; Crew screens default to dark canvas mode.

## Verification

Visual-fidelity verification for UI work is governed by the user-level **`visual-fidelity-check`** skill. It triggers on changes under `packages/dashboard/src/components/` or new/modified `.figma.tsx` files when the project has a `[visual_fidelity]` block in its crew TOML, and compares rendered UI against the **committed Figma snapshot** at `.crew/figma-snapshot/` — a git-tracked artifact, not regenerated per dispatch.

### After a Crew DS design change — refresh the snapshot

The committed snapshot goes stale the moment the Crew Figma design changes without it being regenerated. **After any change to the Crew Figma design system this session — a `use_figma` write, a `figma-generate-*` run, a component or token edit — run the `figma-snapshot-refresh` skill before that design feeds into code implementation.** It re-exports, re-enriches, and commits `.crew/figma-snapshot/`, keeping it in step with the Figma file `visual-fidelity-check` validates against.

`figma-snapshot-refresh` is the producer gate (after design, before code); `visual-fidelity-check` is the consumer gate (after code). `crew figma-snapshot --check` reports on demand whether the committed snapshot has gone stale.
