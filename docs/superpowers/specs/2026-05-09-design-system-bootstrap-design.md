 Can you # Design System Bootstrap — Design Spec

**Status:** Draft, awaiting user review
**Date:** 2026-05-09
**Brainstormed by:** safturento + Claude (Opus 4.7)

## Summary

Bootstrap a multi-layer Figma design system for the crew dashboard, structured for reuse across future projects (Recipes is queued next). Establish a project-agnostic Core library (Tailwind v4 token vocabulary + Heroicons + responsive primitives), a project-specific Crew Design System extending Core (theme overrides + components matching `packages/dashboard/src/components/`), and a generic `design-with-figma` Claude Code skill that drives the design-via-discussion → Figma-via-MCP workflow. Adopt shadcn/ui as the codebase primitive layer in a coordinated refactor so Code Connect mappings are 1:1 from day one. Build a `crew design-sync` reconciliation CLI to detect drift between Figma variables and the Tailwind `@theme` block.

Phased over five phases (~2 weeks of focused work, much of it incremental). Phases 1-3 are sequential and unblock the design fidelity tickets. Phases 4-5 are incremental and run alongside other work.

## Context & motivation

Three pressures drove this:

1. **Visual drift is already shipping.** The `2026-05-08` followup explicitly notes "Slice 1c shipped without citing the design hand-off (visual drift)." This is structural, not a one-off — the dashboard codebase has no canonical design tokens and no link between code components and a design source of truth. Every new component is freehand.
2. **The design fidelity tickets planned yesterday need a foundation.** Doing fidelity work without a design system means each ticket re-litigates colors / spacing / typography. With a system, fidelity becomes "make it match the Figma component" — bounded scope.
3. **Workflow shift.** safturento wants to replace the claude.ai/design → manual hand-off → Figma-import pattern with a discussion-driven Claude+Figma MCP workflow. This requires both the Figma library to design INTO and a skill that codifies the workflow.

The recent session built three modals directly into a Figma file via the official Figma MCP, validating the Claude+MCP design path is viable. This spec formalizes the architecture around it.

## Architecture

Three layers, in dependency order:

| Layer | Lives in | Owner | Purpose |
|---|---|---|---|
| **Core Library** | New published Figma file in safturento's Figma team, e.g. `Core Design System` | safturento (project-agnostic) | Tailwind v4 token vocabulary as Figma variables (light + dark modes), Heroicons import (outline + solid, 24px), responsive breakpoint variables, layout primitives (Stack, Cluster, Container). Reusable across any project. |
| **Crew Design System** | New published Figma file in same team, `Crew Design System`. Depends on (consumes) Core. | crew project | Crew-specific semantic theme aliases (shadcn-aligned naming: `background`, `foreground`, `primary`, `destructive`, etc.), Crew components matching `packages/dashboard/src/components/`, Code Connect mappings (1:1 to shadcn primitives + 1:1 to crew composites). |
| **Crew Screens** | The current "Untitled" file (`9FeJPriqdsdA4n9R5Xsrr8`) renamed to `Crew Dashboard Screens`, plus future per-feature files. Consumes Crew DS. | per design effort | Screen compositions, prototype flows, design fidelity references for tickets. |

Both libraries are **published** so Figma's library system handles versioning, deprecation flags, and consumer-side update prompts. Updates flow library → consumers via Figma's "Updates available" prompt.

### Source-of-truth direction

**Bidirectional with explicit reconciliation.** Either side can be modified. The `crew design-sync` tool (Phase 5) detects drift; the design-with-figma skill calls it as a precheck before Figma work begins. No automated drift correction — manual review preserves intent.

In practice, the typical flow is: design iteration happens in Figma (driven by discussion + MCP), implementation lands in code (which may further refine values during fidelity work). Drift between iterations gets reconciled deliberately at hand-off time.

## Phasing

Five phases. Sequential through phase 3, incremental thereafter.

### Phase 1 — Core Library v1

**Deliverables:**
- Figma file `Core Design System` published in safturento's Figma team
- Variable collections:
  - `Tailwind / Colors` — full default Tailwind v4 palette as variables (single mode; mode-invariant primitives)
  - `Tailwind / Spacing` — `space/0` through `space/96`
  - `Tailwind / Radii` — `radius/none` through `radius/full`
  - `Tailwind / Type` — font-families (sans, mono), font-sizes, font-weights, line-heights, letter-spacings
  - `Tailwind / Breakpoints` — `breakpoint/sm` through `breakpoint/2xl`
- Heroicons import (outline + solid, 24px source size) from the Heroicons community library
- Layout primitives (Stack, Cluster, Container) as base auto-layout templates
- Documented variable scopes per type (no `ALL_SCOPES` defaults)

**Bootstrap mechanism:** A `use_figma` script that takes the Tailwind v4 default palette JSON (grabbed from Tailwind docs) and creates all primitive variables programmatically. Manual variable creation would take hours and be error-prone.

**Effort:** 2-3 days

### Phase 2 — Crew DS v1 + Skill v0 skeleton + shadcn install

**Deliverables:**
- `npx shadcn@latest init` run in `packages/dashboard` configured for Tailwind v4 (pin a CLI version known to work with v4)
- Initial shadcn primitives installed: Button, Input, Dialog, Form, Badge, Label, Separator
- Figma file `Crew Design System` published, depending on Core
- Variable collection `Crew / Semantic Colors` with Light + Dark modes:
  - shadcn-aligned tokens: `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`
  - Each token aliases to a Core primitive per mode
- Variable collections `Crew / Semantic Spacing`, `Crew / Type Scale`, `Crew / Radii` (single mode each)
- Choose and adopt a shadcn/ui Figma community kit as the basis for Crew DS primitive components — evaluate options during this phase, document choice. Theme imported components with Crew tokens.
- Code Connect mappings for installed primitives (1:1 from day 1)
- Skill skeleton at `~/.claude/skills/design-with-figma/SKILL.md` — frontmatter + 5-step bullet outline + hard gates. Most prose is `<!-- TODO: refine in Phase 5 -->` placeholders.
- Initial `crew/docs/plans/design-system.md` with Phase 1 + Phase 2 file URLs and conventions

**Effort:** 3-4 days

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

**Primitive tokens** (Core): Mirror Tailwind v4 raw palette 1:1. Mode-invariant. Example: `color/slate/950` resolves to a single oklch value regardless of theme.

**Semantic tokens** (Crew DS): Aliases pointing at primitives. Mode-aware. Example: `background` (Dark mode) → `color/slate/950`; `background` (Light mode) → `color/white`.

Components bind to semantic tokens, never primitives directly. Toggling Figma's mode flips the bound primitive automatically.

### Variable scopes

Every variable gets explicit scopes; default `ALL_SCOPES` floods every property picker. Mandatory in the design-with-figma skill workflow.

| Variable type | Typical scopes |
|---|---|
| Color (background) | `FRAME_FILL`, `SHAPE_FILL` |
| Color (text) | `TEXT_FILL` |
| Color (border) | `STROKE_COLOR` |
| Spacing | `GAP`, `WIDTH_HEIGHT` |
| Radius | `CORNER_RADIUS` |
| Font family | `FONT_FAMILY` |
| Font size | `FONT_SIZE` |

Most semantic colors get multiple scopes (e.g. `border` is used as both stroke AND fill on dividers).

### Naming convention

Tailwind `@theme` block uses `--color-slate-950`, `--space-4`, etc. Figma variables use `/` separators for grouping: `color/slate/950`, `space/4`. The reconciliation tool maps between these conventions (kebab-with-double-dash vs slash-separated).

### Mode mapping example

```
Crew / Semantic Colors:
  background:
    Light → Tailwind / Colors / color/white
    Dark  → Tailwind / Colors / color/slate/950
  foreground:
    Light → Tailwind / Colors / color/slate/950
    Dark  → Tailwind / Colors / color/slate/50
  primary:
    Light → Tailwind / Colors / color/slate/900
    Dark  → Tailwind / Colors / color/slate/100
  destructive:
    Light → Tailwind / Colors / color/red/600
    Dark  → Tailwind / Colors / color/red/500
```

## Component + Code Connect strategy

### Adopt shadcn/ui as the primitive layer

shadcn/ui is canonical Tailwind + CVA + Radix accessibility, with a copy-into-repo CLI (no NPM dependency). Recent versions support Tailwind v4 — pin a known-working CLI version when running `init` in Phase 2.

Adopting shadcn means:
- We don't hand-roll Button / Input / Dialog / Form / Badge / etc.
- The shadcn semantic token vocabulary (`background`, `primary`, `destructive`, etc.) IS the Crew DS semantic vocabulary — no translation layer
- Code Connect maps Crew DS Figma primitives 1:1 to shadcn-installed components in `packages/dashboard/src/components/ui/*`
- Crew composites (AgentRow, ProjectSection, etc.) get refactored to consume shadcn primitives during Phase 4 fidelity tickets

### What gets a Code Connect mapping

| Component class | Source of code | Code Connect mapping |
|---|---|---|
| **Primitives** (Button, Input, Dialog, Form, Badge, Label, Separator, etc.) | `packages/dashboard/src/components/ui/*` (shadcn-installed) | 1:1. Variant Figma properties (`variant=primary\|secondary\|destructive\|ghost`, `size=sm\|md\|lg`) map to shadcn's CVA variant props directly. |
| **Crew composites** (AgentRow, ProjectSection, AgentBody, AgentsList, TopNav, StateBadge, StateHistoryBar, TokenTable, ViewportFrame, ErrorFallback, BrandMark) | `packages/dashboard/src/components/*` (custom) | 1:1. These don't have Figma variants beyond data — rendered with concrete props. |
| **Layout primitives** (Stack, Cluster, Container, Grid) | shadcn's layout primitives if shipped, or custom utilities in `packages/dashboard/src/lib/layout.ts` | Templated Code Connect (Tailwind utility patterns, not extractable components) |
| **Icons** | `lucide-react` (already in `package.json`) | Lucide Figma kit (community) imported, mapped to lucide-react components. NOT Heroicons — lucide is already installed and has wider icon coverage. |

### Code Connect file locations

`packages/dashboard/src/components/**/*.figma.tsx` — colocated with each component file. Standard layout.

### CVA variant alignment

Figma component variant property names + values match the shadcn component's CVA variant config exactly. Drift becomes a Code Connect lint failure. Example for Button:

```tsx
import { figma } from "@figma/code-connect";
import { Button } from "@/components/ui/button";

figma.connect(Button, "<crew-ds-figma-url>", {
  props: {
    variant: figma.enum("variant", {
      "default": "default",
      "destructive": "destructive",
      "ghost": "ghost",
    }),
    size: figma.enum("size", { "sm": "sm", "default": "default", "lg": "lg" }),
    label: figma.children("Label"),
  },
  example: ({ variant, size, label }) => (
    <Button variant={variant} size={size}>{label}</Button>
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

| Trigger | Behavior |
|---|---|
| Manual: `crew design-sync` | Prints drift report. Exits 0 if clean, 1 if drift. |
| Optional pre-commit hook (off by default per crew's no-pre-commit-hooks policy) | Same as manual; blocks commit if drift. Opt-in per-developer. |
| Optional CI step on PRs touching design tokens or shadcn primitives | Posts drift report as PR comment; doesn't block merge unless drift is in a "frozen" file. |
| Inside the `design-with-figma` skill | Skill calls `crew design-sync` as precheck before any Figma work begins. Surfaces drift to user/Claude so resolution happens before iteration. |

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
core_library_url: "https://www.figma.com/design/<core-key>/Core-Design-System"
project_library_url: "https://www.figma.com/design/<project-key>/<Project>-Design-System"
screens_file_url: "https://www.figma.com/design/<screens-key>/<Project>-Screens"
handoff_doc_root: "docs/designs"
sync_command: "crew design-sync"   # the project's own reconciliation CLI
sample_data:
  project: "kanban-api"
  ticket: "KAN-23"
  user: "kanban-api operator"
---

# <Project> Design System

[Prose: component inventory with Figma node IDs, project-specific design
conventions, naming patterns, things unique to this project's design language.]
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

2. **shadcn Figma kit choice.** Multiple community kits exist; quality varies. Phase 2 needs to evaluate options (official shadcn community kit, third-party kits like shadcn/ui-figma) and pick one. If none are suitable, fall back to building Crew DS primitives ourselves using shadcn's class strings as the spec.

3. **Lucide Figma kit availability.** Need to verify a maintained lucide Figma kit exists. If not, Heroicons fallback (despite the slight code-side mismatch) is acceptable.

4. **Reconciliation tooling complexity.** The CVA AST parser for component-variant drift detection is the most complex piece. If it's too costly to build in Phase 5, ship reconciliation v1 with just token-value + semantic-alias drift; defer component-variant drift to a v2.

5. **Figma library publishing requires Figma org/team setup.** safturento has Figma Pro Full which supports library publishing, but the Figma team itself may need to be configured (vs. publishing into draft space). Phase 1 should verify team setup early.

6. **Drift-during-iteration ergonomics.** While iterating on a design, the reconciliation tool may flag transient drift that's about to be resolved. The skill should call `design-sync` as a precheck (not at every step) to avoid noise.

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

| Phase | Sequential? | Effort | Key deliverable |
|---|---|---|---|
| 1 — Core Library v1 | Sequential, blocks 2 | 2-3 days | Published Core library with Tailwind tokens + Heroicons + responsive primitives |
| 2 — Crew DS v1 + skill skeleton + shadcn install | Sequential, blocks 3 | 3-4 days | Published Crew DS depending on Core; shadcn primitives in dashboard; skill skeleton |
| 3 — Migrate current screens | Sequential, blocks 4 | 1-2 days | "Untitled" file refactored to consume Crew DS instead of detached imports |
| 4 — Crew DS v2 full coverage | Incremental, opportunistic with fidelity tickets | ~5-8 small tickets | Remaining dashboard composites in Crew DS; primitive consumption in code via opportunistic refactor |
| 5 — Skill v1 + reconciliation tooling | Starts after 3 | 2-3 days | `crew design-sync` CLI; refined skill from real Phase 3+4 experience |

Phases 1-3 should run as a single Epic (sequential dependencies). Phase 4 is its own Epic with N child tickets. Phase 5 is its own Epic.
