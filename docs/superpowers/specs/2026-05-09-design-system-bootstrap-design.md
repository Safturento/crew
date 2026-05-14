Can you # Design System Bootstrap — Design Spec

**Status:** Draft, awaiting user review
**Date:** 2026-05-09
**Brainstormed by:** safturento + Claude (Opus 4.7)

## Summary

Bootstrap a multi-layer Figma design system for the crew dashboard, structured for reuse across future projects (Recipes is queued next). Adopt an existing community shadcn/ui Figma kit (originally Figma community file `UkPJj6vd7HMKcey7M0XF4N` "shadcn ui components with variables — Tailwind classes — Updated January 2026") as the foundation — it already provides Tailwind primitives, shadcn-aligned semantic tokens with Light + Dark modes, the full lucide icon set (1,469 components), and every shadcn primitive component. We fork it (save copy to user's Figma team), rename it `Core Design System`, retrofit explicit variable scopes (the kit defaults to `ALL_SCOPES` which pollutes property pickers), add layout primitives (Stack/Cluster/Container), and publish. A project-specific Crew Design System extends Core with Crew-specific overrides and composites. Generic `design-with-figma` Claude Code skill drives the design-via-discussion → Figma-via-MCP workflow. Adopt shadcn/ui as the codebase primitive layer so Code Connect mappings are 1:1 from day one. Build a `crew design-sync` reconciliation CLI to detect drift between Figma variables and the Tailwind `@theme` block.

Phased over five phases (~1 week of focused work for Phases 1-3 thanks to the kit shortcut, then incremental). Phases 1-3 are sequential and unblock the design fidelity tickets. Phases 4-5 are incremental and run alongside other work.

## Context & motivation

Three pressures drove this:

1. **Visual drift is already shipping.** The `2026-05-08` followup explicitly notes "Slice 1c shipped without citing the design hand-off (visual drift)." This is structural, not a one-off — the dashboard codebase has no canonical design tokens and no link between code components and a design source of truth. Every new component is freehand.
2. **The design fidelity tickets planned yesterday need a foundation.** Doing fidelity work without a design system means each ticket re-litigates colors / spacing / typography. With a system, fidelity becomes "make it match the Figma component" — bounded scope.
3. **Workflow shift.** safturento wants to replace the claude.ai/design → manual hand-off → Figma-import pattern with a discussion-driven Claude+Figma MCP workflow. This requires both the Figma library to design INTO and a skill that codifies the workflow.

The recent session built three modals directly into a Figma file via the official Figma MCP, validating the Claude+MCP design path is viable. This spec formalizes the architecture around it.

## Architecture

Three layers, in dependency order:

| Layer                  | Lives in                                                                                                                                             | Owner                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Core Library**       | Forked from community kit `UkPJj6vd7HMKcey7M0XF4N`, saved to user's Figma team in `Design Systems` project, renamed `Core Design System`, published. | safturento (project-agnostic) | Tailwind primitives (multiple `tw/*` collections), shadcn-aligned semantic tokens with Light + Dark modes (`mode` collection: `background`, `foreground`, `primary`, `destructive`, `card`, `border`, etc.), all shadcn primitive components (Button, Input, Dialog, Form, etc. — 60+ component pages), full lucide icon set (1,469 icons), Radix color alternative (`rdx/colors`). Plus our additions: explicit variable scopes (retrofit), layout primitives (Stack, Cluster, Container). Reusable across any project. |
| **Crew Design System** | New published Figma file in same team, `Crew Design System`. Depends on (consumes) Core.                                                             | crew project                  | Thin layer of Crew-specific overrides on Core's semantic tokens where Crew differs from shadcn defaults; Crew composites matching `packages/dashboard/src/components/` that aren't covered by Core's primitives; Code Connect mappings (1:1 to shadcn primitives + 1:1 to crew composites).                                                                                                                                                                                                                              |
| **Crew Screens**       | The current "Untitled" file (`9FeJPriqdsdA4n9R5Xsrr8`) renamed to `Crew Dashboard Screens`, plus future per-feature files. Consumes Crew DS.         | per design effort             | Screen compositions, prototype flows, design fidelity references for tickets.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Both libraries are **published** so Figma's library system handles versioning, deprecation flags, and consumer-side update prompts. Updates flow library → consumers via Figma's "Updates available" prompt.

**Why fork an existing kit instead of building from scratch?** Aligns with the user's stated preference for stable existing solutions over reinventing. The kit author has already done the labor of bootstrapping ~1,800 variables, 60+ shadcn components, and 1,469 lucide icons — all using semantic naming that exactly matches shadcn convention. Forking (rather than depending on the community file directly) gives us full ownership: we customize freely, the upstream can change without affecting us. The kit's own caveats (default `ALL_SCOPES`, slightly messy `tokens` collection) are addressed by the retrofit work in Phase 1.

### Source-of-truth direction

**Bidirectional with explicit reconciliation.** Either side can be modified. The `crew design-sync` tool (Phase 5) detects drift; the design-with-figma skill calls it as a precheck before Figma work begins. No automated drift correction — manual review preserves intent.

In practice, the typical flow is: design iteration happens in Figma (driven by discussion + MCP), implementation lands in code (which may further refine values during fidelity work). Drift between iterations gets reconciled deliberately at hand-off time.

## Phasing

Five phases. Sequential through phase 3, incremental thereafter.

### Phase 1 — Core Library v1

**Deliverables:**

- Forked community kit moved into user's Figma team, renamed `Core Design System`, published
- All ~1,800 variables in the kit's collections retrofitted with **explicit scopes** per Figma's variable-scope semantics. Mapping by collection:
  - `tw/colors` (244) → `["FRAME_FILL", "SHAPE_FILL", "STROKE_COLOR", "TEXT_FILL", "EFFECT_COLOR"]`
  - `tw/padding`, `tw/margin`, `tw/space`, `tw/gap` → `["GAP", "WIDTH_HEIGHT"]` (with appropriate subset per type — padding restricted to padding scopes)
  - `tw/border-radius` → `["CORNER_RADIUS"]`
  - `tw/border-width`, `tw/stroke-width` → `["STROKE_FLOAT"]`
  - `tw/font` → `["FONT_FAMILY", "FONT_SIZE", "FONT_WEIGHT", "LINE_HEIGHT", "LETTER_SPACING"]` per sub-type
  - `tw/height`, `tw/max-height`, `tw/max-width` → `["WIDTH_HEIGHT"]`
  - `tw/opacity` → `["OPACITY"]`
  - `mode` (semantic colors with Light + Dark) → same as `tw/colors`
  - `rdx/colors` → same as `tw/colors`
- Layout primitives (Stack, Cluster, Container) as Figma components — added to Core since the kit doesn't have them
- Document the messy `tokens` collection: leave intact (used by kit's components), document as "internal helpers; ignore in design work"
- Add `destructive-foreground` semantic token if missing from `mode` collection (shadcn convention requires it)
- Add semantic aliases for breakpoints (the kit has 640/768/1024/1280/1536 as raw numerics in `tokens`; alias them to `breakpoint/sm`...`breakpoint/2xl` in a new tiny collection)

**Bootstrap mechanism:** A series of `use_figma` scripts: (1) a scope-retrofit script that walks every variable in the kit and sets scopes per the mapping above, (2) a small script to add layout primitive components, (3) an inspection-and-document script that confirms final state.

**What we're NOT doing:** No more bootstrapping Tailwind primitives from scratch. The kit already has them. No more separate Heroicons import — lucide is in the kit and lucide-react is the matching code library. No shadcn-kit-choice work — already chosen.

**Effort:** ~half day (was 2-3 days before kit adoption)

### Phase 2 — Crew DS v1 + Skill v0 skeleton + shadcn install

**Deliverables:**

- `npx shadcn@latest init` run in `packages/dashboard` configured for Tailwind v4 (pin a CLI version known to work with v4)
- Initial shadcn primitives installed: Button, Input, Dialog, Form, Badge, Label, Separator
- Figma file `Crew Design System` published, depending on Core (which now includes the kit's shadcn primitives + lucide + variables)
- Crew theme override layer: a small variable collection in Crew DS that aliases Core's `mode` tokens to Crew-specific values where Crew differs from shadcn defaults. For example, if Crew wants its `primary` to be a specific Tailwind shade rather than the kit's chosen alias, override here. Most tokens just re-alias to Core unchanged.
- Crew composites collection: components matching `packages/dashboard/src/components/` that aren't covered by Core's shadcn primitives (e.g. `AgentRow`, `StateBadge`, `StateHistoryBar`, `TokenTable`). These are bigger compositions specific to crew.
- Code Connect mappings for installed primitives (1:1 from day 1) — point at Core's shadcn primitive components in Figma and dashboard's `components/ui/*` in code
- Skill skeleton at `~/.claude/skills/design-with-figma/SKILL.md` — frontmatter + 5-step bullet outline + hard gates. Most prose is `<!-- TODO: refine in Phase 5 -->` placeholders.
- Initial `crew/docs/plans/design-system.md` with Phase 1 + Phase 2 file URLs and conventions

**What we're NOT doing in Phase 2 anymore:** No semantic colors collection from scratch — Core (the forked kit) already has it. No shadcn kit choice + adoption + theming — already done in Phase 1 by virtue of being the kit. Crew DS is now mostly ALIASES + ADDITIONS, not foundation-building.

**Effort:** ~1 day for Crew DS Figma work; the code-side Phase 2 work (shadcn install + token migration + adding primitives + Code Connect) is unchanged at ~3-4 days

### Phase 3 — Migrate current screens to Crew DS

**Deliverables:**

- Current "Untitled" Figma file (`9FeJPriqdsdA4n9R5Xsrr8`) renamed to `Crew Dashboard Screens`
- All existing imported frames (Agents List, Agent Drawer Open, Agent Page, Projects List, Project Page, Register Modal, New Run Modals 1-3, Edit Project Modal, Delete Confirm Modal) refactored to:
  - Use Crew DS variables for all colors, spacing, radii (replace hardcoded values from html.to.design import)
  - Use Crew DS component instances for primitives (replace detached `Background+Border+Shadow` frames with `Modal` instance, etc.)
- The 3 modals just built (New Run Confirm, Edit Project, Delete Confirm) rebuilt as proper Crew DS instances rather than ad-hoc constructions

**Effort:** 1-2 days

### Phase 4 — Crew DS v2 — full coverage

**Deliverables (incremental, opportunistic during fidelity tickets):**

- Build remaining Crew DS components matching dashboard composites: TopNav, AgentRow, AgentBody, AgentsList, ProjectSection, StateBadge, StateHistoryBar, TokenTable, ViewportFrame, ErrorFallback, BrandMark
- Each component gets 1:1 Code Connect mapping to its dashboard counterpart
- During each fidelity ticket, refactor the touched composites to consume shadcn primitives (Button, Input, Dialog, etc.) instead of inline `div + Tailwind`. Opportunistic — no separate big refactor sprint.

**Effort:** 1 ticket per component (~5-8 tickets), can run concurrently with non-design work

### Phase 5 — Skill v1 + reconciliation tooling

**Deliverables:**

- `crew design-sync` CLI command at `packages/cli/src/commands/design-sync.ts`
  - Diff logic in `packages/shared/src/design-sync/`
  - Reads Tailwind `@theme` block from `packages/dashboard/src/index.css`
  - Reads Core + Crew DS variables via Figma REST API
  - Reads CVA component variants via TypeScript AST (e.g. `ts-morph`) from `packages/dashboard/src/components/ui/*.tsx`
  - Reports drift across three surfaces: token-value, semantic-alias, component-variant
  - Read-only by default; `--apply <code|figma>` flag for trivial cases (gated behind confirmation)
- Skill v1 refinement at `~/.claude/skills/design-with-figma/SKILL.md`
  - Replace placeholders with prose drawn from Phase 3 + 4 experience
  - Add references files (`handoff-template.md`, `project-config-schema.md`)
  - Document judgment-call patterns ("when to skip brainstorming sub-steps")

**Effort:** 2-3 days

## Token + variable strategy

### Two-layer token system

**Primitive tokens** (Core, in the `tw/*` collections from the forked kit): Mirror Tailwind v4 raw palette 1:1. Mode-invariant. Example: `slate/950` (in `tw/colors`) resolves to a single OKLCH value regardless of theme.

**Semantic tokens** (Core, in the kit's `mode` collection — Light + Dark modes built in): Aliases pointing at `tw/colors` primitives. Mode-aware. The kit ships with shadcn's exact semantic vocabulary already wired: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, plus the sidebar suite (`sidebar`, `sidebar-foreground`, etc.) and chart colors (`chart-1` through `chart-5`).

**Crew theme overrides** (Crew DS): A small set of aliases that selectively re-point Core's `mode` tokens to different primitives where Crew's brand differs from shadcn defaults. Most semantic tokens just pass through Core unchanged.

Components bind to semantic tokens, never primitives directly. Toggling Figma's mode flips the bound primitive automatically.

### Kit collection inventory (Core, after retrofit)

Kit ships with 16 collections; we add scopes and a small `Core / Layout` collection for our additions:

| Collection              | Modes            | Variables | Purpose                                                                                                                               |
| ----------------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tw/colors`             | single           | 244       | Tailwind palette — 22 families × 11 shades, plus white/black/transparent                                                              |
| `tw/padding`            | single           | 245       | Padding step values for Tailwind p-\* classes                                                                                         |
| `tw/space`              | single           | 68        | space-y/space-x utility step values                                                                                                   |
| `tw/border-radius`      | single           | 149       | rounded-\* values incl. responsive variants (rounded-s-sm, etc.)                                                                      |
| `tw/margin`             | single           | 245       | m-\* step values                                                                                                                      |
| `tw/gap`                | single           | 102       | gap-\* step values                                                                                                                    |
| `tw/border-width`       | single           | 45        | border-{1,2,4,8} etc.                                                                                                                 |
| `tw/stroke-width`       | single           | 11        | SVG stroke widths                                                                                                                     |
| `tw/font`               | single           | 47        | Font-family/size/weight/line-height/letter-spacing                                                                                    |
| `tw/height`             | single           | 24        | h-\* step values                                                                                                                      |
| `tw/max-height`         | single           | 35        | max-h-\* values                                                                                                                       |
| `tw/max-width`          | single           | 51        | max-w-\* values incl. max-w-{sm,md,lg,xl,2xl,...}                                                                                     |
| `tw/opacity`            | single           | 21        | opacity step values                                                                                                                   |
| `mode`                  | **Light + Dark** | 47        | Semantic colors (shadcn-aligned) + `radius-*` + stroke/border-width semantic aliases                                                  |
| `tokens`                | single           | 89        | Internal kit helpers — _raw numeric values like `0,5`, `1,25`, `640`. Document as "ignore in design work; used by kit's components."_ |
| `rdx/colors`            | Light + Dark     | 396       | Radix-style color palette (alternate to Tailwind). Available but Crew chooses Tailwind.                                               |
| **NEW** `Core / Layout` | single           | ~3        | Stack, Cluster, Container layout primitive components (Phase 1 addition)                                                              |

### Variable scopes

The kit defaults every variable to `ALL_SCOPES`, which floods every property picker. **Mandatory Phase 1 retrofit:** walk every variable and set explicit scopes per type. Mapping:

| Variable category                                         | Scopes                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Color (in `tw/colors`, `mode`, `rdx/colors`)              | `FRAME_FILL`, `SHAPE_FILL`, `STROKE_COLOR`, `TEXT_FILL`, `EFFECT_COLOR` |
| Spacing (`tw/padding`, `tw/margin`, `tw/space`, `tw/gap`) | `GAP`, `WIDTH_HEIGHT` (with appropriate subset per type)                |
| Radius (`tw/border-radius`)                               | `CORNER_RADIUS`                                                         |
| Border / stroke widths                                    | `STROKE_FLOAT`                                                          |
| Font family                                               | `FONT_FAMILY`                                                           |
| Font size                                                 | `FONT_SIZE`                                                             |
| Font weight                                               | `FONT_WEIGHT`                                                           |
| Line height                                               | `LINE_HEIGHT`                                                           |
| Letter spacing                                            | `LETTER_SPACING`                                                        |
| Width / max-width / height / max-height                   | `WIDTH_HEIGHT`                                                          |
| Opacity                                                   | `OPACITY`                                                               |

The retrofit is a single use_figma script that walks `getLocalVariableCollectionsAsync()` and rewrites scopes per a switch on collection name + variable type. Idempotent and reversible.

### Naming convention

Tailwind `@theme` block uses `--color-slate-950`, `--space-4`, etc. The kit's variables use `slate/950`, `space-4`, `rounded-md` — close to but not identical to Tailwind's CSS-variable naming (some use `/` as delimiter, some use `-`). The reconciliation tool maps between these conventions.

### Mode mapping example

The kit's `mode` collection already wires Light and Dark mappings. Example bindings:

```
mode collection:
  background:
    light mode → tw/colors / slate/50  (kit's choice)
    dark mode  → tw/colors / slate/950 (kit's choice)
  primary:
    light mode → kit-chosen Tailwind shade
    dark mode  → kit-chosen Tailwind shade
  destructive:
    light mode → kit-chosen red shade
    dark mode  → kit-chosen red shade
```

**Crew DS overrides** can re-point any of these aliases to different `tw/colors` primitives if the kit's choices don't match crew's brand. For Phase 2 scoping, we'll likely override a small set (e.g. tweak `primary` to a specific Tailwind shade). Most tokens pass through unchanged.

## Component + Code Connect strategy

### Adopt shadcn/ui as the primitive layer

shadcn/ui is canonical Tailwind + CVA + Radix accessibility, with a copy-into-repo CLI (no NPM dependency). Recent versions support Tailwind v4 — pin a known-working CLI version when running `init` in Phase 2.

Adopting shadcn means:

- We don't hand-roll Button / Input / Dialog / Form / Badge / etc.
- The shadcn semantic token vocabulary (`background`, `primary`, `destructive`, etc.) IS the Crew DS semantic vocabulary — no translation layer
- Code Connect maps Crew DS Figma primitives 1:1 to shadcn-installed components in `packages/dashboard/src/components/ui/*`
- Crew composites (AgentRow, ProjectSection, etc.) get refactored to consume shadcn primitives during Phase 4 fidelity tickets

### What gets a Code Connect mapping

| Component class                                                                                                                                                 | Source of code                                                                                       | Code Connect mapping                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primitives** (Button, Input, Dialog, Form, Badge, Label, Separator, etc.)                                                                                     | `packages/dashboard/src/components/ui/*` (shadcn-installed)                                          | 1:1. Variant Figma properties (`variant=primary\|secondary\|destructive\|ghost`, `size=sm\|md\|lg`) map to shadcn's CVA variant props directly.                                                                                 |
| **Crew composites** (AgentRow, ProjectSection, AgentBody, AgentsList, TopNav, StateBadge, StateHistoryBar, TokenTable, ViewportFrame, ErrorFallback, BrandMark) | `packages/dashboard/src/components/*` (custom)                                                       | 1:1. These don't have Figma variants beyond data — rendered with concrete props.                                                                                                                                                |
| **Layout primitives** (Stack, Cluster, Container, Grid)                                                                                                         | shadcn's layout primitives if shipped, or custom utilities in `packages/dashboard/src/lib/layout.ts` | Templated Code Connect (Tailwind utility patterns, not extractable components)                                                                                                                                                  |
| **Icons**                                                                                                                                                       | `lucide-react` (already in `package.json`)                                                           | Lucide icons live inside Core (1,469 icon components in the `Lucide Icons` page from the forked kit, all 24×24, named `lucide/<icon-name>`). Code Connect maps each used icon to its `lucide-react` counterpart. NOT Heroicons. |

### Code Connect file locations

`packages/dashboard/src/components/**/*.figma.tsx` — colocated with each component file. Standard layout.

### CVA variant alignment

Figma component variant property names + values match the shadcn component's CVA variant config exactly. Drift becomes a Code Connect lint failure. Example for Button:

```tsx
import { figma } from '@figma/code-connect';
import { Button } from '@/components/ui/button';

figma.connect(Button, '<crew-ds-figma-url>', {
  props: {
    variant: figma.enum('variant', {
      default: 'default',
      destructive: 'destructive',
      ghost: 'ghost',
    }),
    size: figma.enum('size', { sm: 'sm', default: 'default', lg: 'lg' }),
    label: figma.children('Label'),
  },
  example: ({ variant, size, label }) => (
    <Button variant={variant} size={size}>
      {label}
    </Button>
  ),
});
```

## Reconciliation tooling

### Three drift surfaces

1. **Token-value drift.** Primitive value differs between `@theme` block and Core library variable. E.g. `--color-blue-500: oklch(0.6 0.2 240)` in code, but Figma's `color/blue/500` resolves to `oklch(0.62 0.18 245)`.
2. **Semantic-alias drift.** A semantic token's mapping diverges. E.g. code's `--background: var(--color-slate-950)`, but Figma's `background` (Dark mode) is aliased to `color/slate/900`.
3. **Component-variant drift.** Component CVA variants don't match Figma variant properties. E.g. code's Button has `default | destructive | ghost | outline`, Figma has `default | destructive | ghost` (missing `outline`).

### `crew design-sync` command

Read-only by default. Manual review decides which side wins.

```bash
$ crew design-sync
Reading Tailwind config from packages/dashboard/src/index.css ...
Reading Core library variables from Figma (file: <core-key>) ...
Reading Crew DS semantic aliases from Figma (file: <crew-ds-key>) ...

✓ 312 primitive tokens match
⚠ 2 primitive tokens drift:
  color/blue/500
    code:  oklch(0.6 0.2 240)
    figma: oklch(0.62 0.18 245)
  space/4
    code:  1rem
    figma: 0.95rem

⚠ 1 semantic alias drift:
  background (Dark mode)
    code:  color/slate/950
    figma: color/slate/900

✓ Component variants match (5 components checked)

Run `crew design-sync --apply code` to push code values to Figma.
Run `crew design-sync --apply figma` to push Figma values to code.
Or fix manually (recommended) and re-run.
```

`--apply <side>` is destructive and gated behind a confirmation prompt. Auto-apply exists for trivial cases (typos); most real drift is resolved manually because the right answer is usually a third value.

### When it runs

| Trigger                                                                         | Behavior                                                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual: `crew design-sync`                                                      | Prints drift report. Exits 0 if clean, 1 if drift.                                                                                             |
| Optional pre-commit hook (off by default per crew's no-pre-commit-hooks policy) | Same as manual; blocks commit if drift. Opt-in per-developer.                                                                                  |
| Optional CI step on PRs touching design tokens or shadcn primitives             | Posts drift report as PR comment; doesn't block merge unless drift is in a "frozen" file.                                                      |
| Inside the `design-with-figma` skill                                            | Skill calls `crew design-sync` as precheck before any Figma work begins. Surfaces drift to user/Claude so resolution happens before iteration. |

### Out of scope for the tool

- **No auto-resolution by default** — drift signals intent that hasn't propagated; manual review preserves intent.
- **No drift detection on shadcn-internal primitives Crew hasn't adopted in Figma** — only flags drift on tokens/components Crew has explicitly mapped.
- **No image/visual regression** — different tooling (Chromatic, Percy) for that.

## Skill structure

### Location & shape

Lives at `~/.claude/skills/design-with-figma/`, project-agnostic:

```
~/.claude/skills/design-with-figma/
├── SKILL.md
└── references/
    ├── handoff-template.md          # project-agnostic boilerplate
    └── project-config-schema.md     # docs the per-project config schema
```

No project-specific knowledge baked in. The skill reads project context from `<repo>/docs/plans/design-system.md` (sits next to `architecture.md` per crew's existing convention).

### Per-project config schema

Each project adopting the workflow maintains `docs/plans/design-system.md` with frontmatter:

```yaml
---
core_library_url: 'https://www.figma.com/design/<core-key>/Core-Design-System'
project_library_url: 'https://www.figma.com/design/<project-key>/<Project>-Design-System'
screens_file_url: 'https://www.figma.com/design/<screens-key>/<Project>-Screens'
handoff_doc_root: 'docs/designs'
sync_command: 'crew design-sync' # the project's own reconciliation CLI
sample_data:
  project: 'kanban-api'
  ticket: 'KAN-23'
  user: 'kanban-api operator'
---
# <Project> Design System

[
  Prose: component inventory with Figma node IDs,
  project-specific design
  conventions,
  naming patterns,
  things unique to this project's design language.,
]
```

For Recipes (queued next), the file at `recipes/docs/plans/design-system.md` has its own frontmatter values. Same skill, different config.

### Frontmatter trigger

```yaml
---
name: design-with-figma
description: |
  Use when the user wants to design or update UI in any project — mockup a
  new screen, design a new component, modify an existing screen, sketch a
  feature, prototype an interaction, or update visual fidelity.

  If the project has docs/plans/design-system.md configured, reads that for
  Figma file URLs, component inventory, conventions, and sync command.

  If the project does NOT have a design system configured, surface a
  non-blocking suggestion: "If you want to design with more structure I can
  set up a design system for this project (Figma library + components +
  reconciliation tooling). Otherwise we'll proceed with ad-hoc Figma work
  using figma-generate-design directly." Continue with the user's choice.

  Triggers: "let's design X", "design a Y for [project]", "add a Z screen",
  "mock up [feature]", "sketch out [thing]", "update the [view] design".

  Do NOT trigger for pure code work with no design implication.
---
```

### Workflow

```
0. CONTEXT LOAD
   • Find <repo>/docs/plans/design-system.md (search up from cwd).
   • Parse frontmatter: file URLs, sync command, sample data, conventions.
   • If absent: surface non-blocking suggestion to bootstrap (see frontmatter).
     • If user wants to bootstrap: explain that bootstrapping is a multi-phase
       effort (Figma library + theme + skill config) and suggest spinning up
       a dedicated planning effort (brainstorming → spec → ticketing) for it.
       End this skill invocation; bootstrap is its own engagement.
     • If user wants to continue ad-hoc: fall back to invoking
       figma-generate-design directly with no project context.

1. PRE-CHECK
   • Run the configured sync_command.
   • Surface drift; ask user to resolve or explicitly acknowledge before
     proceeding.

2. DISCUSS
   • Invoke superpowers:brainstorming for scope.
   • Terminal state is THIS skill's step 3 (Figma construction), not writing-plans.

3. PLAN VISUALLY
   • Identify which project DS components compose the design.
   • Decide target file: extend existing screens file, or new file.
   • If new components are needed (not in project DS yet): STOP. Surface to
     user, suggest invoking figma-generate-library to add them to project DS
     first.

4. BUILD IN FIGMA
   • Invoke figma:figma-generate-design (loads figma:figma-use as prerequisite).
   • Pass project DS file URL as primary discovery context, screens file as
     target.
   • Build incrementally per figma-generate-design workflow. Validate with
     screenshots after each section.

5. HAND-OFF
   • Write hand-off doc at <handoff_doc_root>/<YYYY-MM-DD>-<slice>/README.md
     using references/handoff-template.md (with project values substituted).
   • Commit the hand-off doc.
   • Ask user: "Want to create the implementation ticket(s) now?"
     • Yes → invoke superpowers:writing-plans, then ticket per project's
       global CLAUDE.md planning workflow.
     • No → end skill.
```

### Hard gates

1. NO Figma writes before user has approved the design from step 2.
2. NO new components added to project DS without invoking figma-generate-library (which has its own discovery + naming workflow). The design-with-figma skill is for COMPOSING with existing components, not creating them.
3. NO hand-off doc creation without user-visible Figma screenshots in the conversation showing the final state.

## Open risks

1. **shadcn CLI Tailwind v4 compatibility.** Recent versions support v4, but the support is relatively new. Phase 2 must verify which CLI version works cleanly with the dashboard's existing v4 setup. Mitigation: pin a known-working version, document it in `crew/docs/plans/design-system.md`.

2. **Forked-kit upstream drift.** We fork the community kit (save copy to our team) and then modify it. The original community file may continue to evolve — new shadcn primitives added, lucide updated, tokens revised. We don't auto-track. Mitigation: this is the explicit tradeoff for owning Core. Periodically (every ~6 months) check whether the upstream kit has meaningful additions worth manually porting in. Document the fork point (kit version / last-updated date) in `docs/plans/design-system.md` so we know what we forked from.

3. **Kit's `tokens` collection is messy.** 89 raw-numeric variables with empty scopes, used internally by the kit's components. We document them as "ignore in design work" but they remain visible in the Figma Variables panel as noise. If they become a real annoyance, options are: (a) move them to a hidden collection, (b) prefix-rename them, or (c) accept as background noise. Defer decision until Phase 1 retrofit reveals impact.

4. **Reconciliation tooling complexity.** The CVA AST parser for component-variant drift detection is the most complex piece. If it's too costly to build in Phase 5, ship reconciliation v1 with just token-value + semantic-alias drift; defer component-variant drift to a v2.

5. **Figma library publishing requires Figma org/team setup.** safturento has Figma Pro Full which supports library publishing, but the team itself needs to support it. Phase 1 verifies team setup early via the manual file-creation step.

6. **Drift-during-iteration ergonomics.** While iterating on a design, the reconciliation tool may flag transient drift that's about to be resolved. The skill should call `design-sync` as a precheck (not at every step) to avoid noise.

7. **Kit may include components/features Crew doesn't need.** The kit ships 60+ shadcn component pages, 5 icon libraries, charts, blocks, examples — far more than Crew uses. Carrying them as part of Core is OK (they're inert until used) but inflates the publish surface. If publish performance becomes a real issue, we can prune in a future Phase. Not a v1 concern.

## Out of scope

The following are intentionally NOT in v1:

- **Per-tenant theming beyond light/dark** (enterprise theme variants for white-labeling)
- **Visual regression testing** (Chromatic / Percy integration)
- **Storybook integration** (separate concern; Figma serves the same purpose for design exploration)
- **Component variant drift v2** (defer if Phase 5 effort runs over)
- **Auto-migration tooling** (the Phase 3 migration is manual; if a future project needs to migrate from a different design system, build tooling then)
- **Figma asset pipeline / icon export automation** (icons are referenced via lucide-react, not exported)
- **Multi-language / i18n affordances in components** (when needed, builds on top of the system)
- **Accessibility audit tooling** (Radix-via-shadcn covers a11y at the primitive level; auditing is separate)

## Phasing summary

| Phase                                            | Sequential?                                       | Effort                       | Key deliverable                                                                                     |
| ------------------------------------------------ | ------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 1 — Core Library v1                              | Sequential, blocks 2                              | ~half day                    | Published Core library: forked kit with retrofitted scopes + layout primitives + breakpoint aliases |
| 2 — Crew DS v1 + skill skeleton + shadcn install | Sequential (Crew DS Figma) + parallel (code work) | ~1 day Figma + 3-4 days code | Published Crew DS (theme overrides on Core); shadcn primitives in dashboard; skill skeleton         |
| 3 — Migrate current screens                      | Sequential, blocks 4                              | 1-2 days                     | "Untitled" file refactored to consume Crew DS instead of detached imports                           |
| 4 — Crew DS v2 full coverage                     | Incremental, opportunistic with fidelity tickets  | ~5-8 small tickets           | Remaining dashboard composites in Crew DS; primitive consumption in code via opportunistic refactor |
| 5 — Skill v1 + reconciliation tooling            | Starts after 3                                    | 2-3 days                     | `crew design-sync` CLI; refined skill from real Phase 3+4 experience                                |

Phases 1-3 should run as a single Epic (sequential dependencies). Phase 4 is its own Epic with N child tickets. Phase 5 is its own Epic.

> **Pivot note (2026-05-09 evening):** Original Phase 1 estimate was 2-3 days for from-scratch Tailwind primitive bootstrapping + Heroicons import + layout primitives. We discovered an existing comprehensive shadcn community kit (file `UkPJj6vd7HMKcey7M0XF4N`, "Updated January 2026") that already provides Tailwind primitives + shadcn components + lucide icons + Light/Dark modes. Adopting it as the basis for Core cuts Phase 1 effort to ~half day (the work is now retrofitting scopes + adding layout primitives) and Phase 2 Figma effort to ~1 day (Crew DS becomes overrides + composites rather than building semantic collections from scratch). Other phases unchanged.
