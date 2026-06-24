# Timeline filter-menu Figma composites + code mapping

**Date:** 2026-06-24
**Status:** Design (brainstormed 2026-06-24) — interactive build to follow in a fresh session
**Type:** Design-system build (interactive Figma; user is the visual judge — not `crew run` dispatch)

## Problem / purpose

The Timeline filter menu is **built and shipped in code** (`packages/dashboard/src/components/Timeline/Filters.tsx`) but has **no Figma composites** on the Composites page. Its only Figma representation is inside throwaway *brainstorm* frames that were never promoted to clean composites:

- `660:859`, `665:864` — "Brainstorm — Timeline Filter Rework (Option B)"
- `699:1039` — "Hover states — reference"
- `707:1044` — "Brainstorm — Drawer sticky headers (pinned state)"

These brainstorm/exploration frames live on **Composites** (mixed with the 39 real component composites) when they should live on the project's existing **Brainstorm** page. Because they're scratch artifacts, their REST hash is unstable on re-fetch — they perpetually flag `crew figma-snapshot --check` as STALE (they were 3 of the original 19 drift hits; still drift right after a fresh export).

> **Project-specific:** the snapshot lives at `.crew/figma-snapshot/`; `[visual_fidelity].figma_pages = ["Composites", "Dashboard Screens"]`; `figma_file_key = 9FeJPriqdsdA4n9R5Xsrr8`. The export captures every top-level frame on those pages, which is why scratch frames on Composites get captured.

The fix is **not** to merely delete/move the brainstorm frames — that would erase the only Figma reference for the filter UI. We first build proper composites for the filter menu (mapped to the shipped components), *then* relocate the brainstorm frames.

## Goal

1. Build a **`FilterRow`** component set and a **`FilterMenu`** composite on the Composites page that faithfully mirror the shipped `Filters.tsx`.
2. Map them to code via Code Connect docs so future design changes correspond to the built components.
3. Move the 4 brainstorm/reference frames to the Brainstorm page and refresh the snapshot so Composites holds only real components.

## What's already there (reuse, don't rebuild)

- **`Checkbox`** COMPONENT_SET (`663:869`) — `state` (on/off/disabled) + `Label`. FilterRow nests this.
- **`Pill`** COMPONENT_SET (`272:120`) — the header "Select all"/"Clear" buttons (button-xs, idle, ghost) and the trigger ("Filters" button-sm, idle, mid) are Pill instances.
- **`TimelineToolbar`** (`558:477`) — already contains the Filters **trigger** Pill. The trigger stays as-is; this work adds the **menu/popover**, which the toolbar's trigger conceptually opens.

## Components to build

### `FilterRow` (COMPONENT_SET) — mirrors code's `FilterRow`

Nests the existing `Checkbox` composite (single-sources the checkbox visual).

- **Variant axis `state`: `on` / `off` / `disabled`** — sets the nested Checkbox's state; `disabled` additionally dims the whole row (mirrors the code's row-level `opacity-35`, used for master-off tool children).
- **Component properties** (per the props-over-variants convention — BOOLEAN/TEXT for optional parts, not new variant axes):
  - `Label` (TEXT) → flows to the nested Checkbox label.
  - `Has Count` (BOOL) + `Count` (TEXT, e.g. `"3 / 11"`).
  - `Has Disclosure` (BOOL) + `Expanded` (BOOL → chevron-down when true, chevron-right when false).
  - `Indent` (BOOL) → the tool-subtree left padding (`pl-7` in code).

Layout: auto-layout row, `gap-2`, `py-1.5`; `[checkbox+label]` hug-left/fill, then optional count (mono 10px muted), then optional disclosure chevron (size-4). Clear default white fills on every inner frame (createAutoLayout hardcodes white — see `~/.claude/conventions/figma.md`).

### `FilterMenu` (COMPONENT) — mirrors `PopoverContent`

A fixed **w-72** (288px) vertical auto-layout column:

1. **Header** (`px-3 py-2.5`, gap-1): "Filters" label (mono, 10px, uppercase, tracking-wide, muted-foreground) flex-fill, then "Select all" + "Clear" Pill instances (button-xs, idle, ghost).
2. **Divider** (1px top border, `border` token).
3. **Body** (`flex-col gap-0.5 p-2`): one `FilterRow` instance per category from `eventClassification.CATEGORIES`, in order, with default-visible states baked in:
   - Conversation — `on`
   - Tools — `on`, `Has Count` (`"5 / 11"` sample), `Has Disclosure`
   - Thinking — `off`
   - Hooks — `off`
   - Skills — `off`
   - System — `off`
   - Startup — `on`

**Two FilterMenu states** (variant axis `tools`: `collapsed` / `expanded`):
- `collapsed` — Tools row with chevron-right; no subtree. The initial-render default.
- `expanded` — Tools row with chevron-down, followed by an **indented ToolsSubtree**: a representative static set of `Indent` FilterRows (Bash, Edit, Read, MCP:Jira, MCP:Figma). These tool rows are **alias-derived/dynamic in code** (from `tokensByTool`); the composite shows a fixed sample purely as the visual contract.

> **Project-specific:** category labels + default-visible flags are the source of truth in `eventClassification.ts` (`CATEGORIES`). Conversation/Tools/Startup default visible; Thinking/Hooks/Skills/System default hidden.

## Code mapping (Code Connect docs)

Add **`packages/dashboard/src/components/Timeline/Filters.figma.tsx`** following the existing `TimelineSection.figma.tsx` / `TranscriptRow.figma.tsx` pattern:
- Map `FilterMenu` → the `Filters` / `PopoverContent` render.
- Map `FilterRow` → the code's `FilterRow` sub-component, wiring the Figma props (`Label`, `Has Count`/`Count`, `Has Disclosure`/`Expanded`, `Indent`, `state`) to the code props (`label`, `count`, `onToggleExpanded`/`expanded`, `indent`, `checked`/`disabled`).

> **Project-specific:** Code Connect is **not published** (crew is Figma Pro, not Org — see the `code_connect_skipped` note). `.figma.tsx` files stay as inert on-disk docs that the design-with-figma / visual-fidelity flow reads. No `figma connect publish`.

## Cleanup — relocate brainstorm frames + refresh snapshot

Only after the composites exist and are mapped:

1. Move all 4 frames (`660:859`, `665:864`, `699:1039`, `707:1044`) from Composites → the existing **Brainstorm** page (via `figma-use`). IDs are preserved across a page move; `figma_pages` excludes the Brainstorm page, so they stop being captured.
2. Run `figma-snapshot-refresh` (full export + compact `--enrich`). Composites then holds only real components, and `--check` should report fresh (the unstable scratch frames are gone).

## Verification

- **Visual fidelity:** each composite screenshotted and compared against the shipped `Filters.tsx` render (the `visual-fidelity-check` consumer reads `componentInstances`/`variantOverrides`/`componentPropertyOverrides`/`resolvedStyles`). FilterRow and FilterMenu (both states) match the rendered popover.
- **Mapping:** `Filters.figma.tsx` present and structurally consistent with the composites (props ↔ code props).
- **Snapshot:** post-refresh `crew figma-snapshot --check` reports fresh; Composites index contains `FilterRow` + `FilterMenu` and **no** `Brainstorm —`/`reference` frames.

## Out of scope

- Formalizing the "Filters" **trigger** as its own composite — it stays a Pill instance in `TimelineToolbar`.
- Any change to the shipped `Filters.tsx` behavior — this is design↔code *mapping*, not a code rework.
- Auto-deriving the tool-subtree rows in Figma — the expanded state shows a static representative sample.
- The general page-hygiene question (a lint/guard that keeps scratch frames off Composites) — separate followup if wanted.

## Execution note

Interactive Figma build, phased with visual verification at each step: FilterRow set → verify → FilterMenu (collapsed) → verify → FilterMenu (expanded) → verify → `Filters.figma.tsx` mapping → relocate frames → refresh snapshot. Driven live with the user as visual judge; not a `crew run` dispatch (Figma writes + the snapshot enrichment need the interactive session).
