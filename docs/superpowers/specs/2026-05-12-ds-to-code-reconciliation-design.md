# Crew DS → code reconciliation

**Date:** 2026-05-12
**Status:** Spec — pending implementation plan
**Related:** [[project_crew_ds_pill_unified]] · [[project_crew_ds_modal_composites]] · [[project_crew_ds_form_composites]] · [[project_crew_ds_consolidated_into_dashboard_file]]

## Context

On 2026-05-12 the Crew Design System in Figma was consolidated into a single dashboard file (`9FeJPriqdsdA4n9R5Xsrr8`, page `Composites`) and the component library went through a significant restructure:

- The four old sets — Button, StateBadge, CountBadge, TimelineTag — were unified into a single **Pill** set (320 variants: 10 types × 8 colors × 4 intensities).
- Three new modal-family composites were added: **Modal** (slot pattern via INSTANCE_SWAP), **AlertModal** (shadcn AlertDialog parallel), **ModalSelectionRow** (picker rows).
- Three new form-family composites were added: **Input** (with optional leading icon), **FormField** (Label + Input wrapper), **Switch** (on/off toggle).
- A small **Stepper** composite was added for the New Run multi-step modal.

The dashboard code (`packages/dashboard/src/components/`) still reflects the *pre-consolidation* DS — separate `Button` / `StateBadge` / `CountBadge` components, no Modal/AlertModal/ModalSelectionRow/Stepper/Switch/FormField composites, and 21 `.figma.tsx` Code Connect files pointing at the now-archived standalone DS file.

This spec covers the work to reconcile the code with the new Figma DS at the **component-parity** level: every Figma composite has a matching code component with the right visual contract. **It does not wire the four new modal screens** (New Run, Register, Edit, Delete) into the live dashboard — those land in separate slices once the components exist to compose them with.

## Scope

In scope:

- Reconcile `ui/button.tsx` + `ui/badge.tsx` with the new color × intensity matrix.
- Build new components: `ui/tag.tsx`, `ui/switch.tsx` (shadcn-installed), `components/FormField.tsx`, `components/Modal.tsx`, `ui/alert-dialog.tsx` (shadcn-installed) + `components/AlertModal.tsx`, `components/ModalSelectionRow.tsx`, `components/Stepper.tsx`.
- Add a `leadingIcon` prop to `ui/input.tsx` (for the search-input variant used in agent drawer + agent page).
- Delete `components/StateBadge.tsx`, `components/CountBadge.tsx`, and their tests + `.figma.tsx` files. Update all callers to use `<Badge>` with the new props (no aliasing shim — hard break, per the project's no-backwards-compat-hacks rule).
- Update all relevant `.figma.tsx` files to point at the new Figma file URL (`9FeJPriqdsdA4n9R5Xsrr8`) and the new node IDs / variant restrictions.

Out of scope (deferred to future slices):

- Wiring the four new modal screens (New Run 1/2/3, Register, Edit, Delete) into live dashboard routes.
- Daemon endpoints those modals need (create-project, edit-project, dispatch-agent).
- Pixel-fidelity sweep of pages that already render (Agents, Projects) — they'll get visual smoke-test verification but no proactive polish.
- Trailing-icon Pill support (Filters dropdown, docker URL chip) — see `docs/followups.md` entries.
- CodeChip composite (mono-font URL/path display) — see `docs/followups.md`.
- Stepper-driven New Run state management — composite exists, wiring deferred.

## Architecture

### Shared color × intensity helper

The 8-color × 4-intensity matrix is the only shared piece across Button, Badge, and Tag. Three patterns considered:

| Pattern | Pros | Cons |
|---|---|---|
| Shared cva fragments (chosen) | Single source of truth, each component file stays focused | Slight indirection — must read the helper to understand a Button's classes |
| Each component duplicates the full matrix | Self-contained files, no cross-file reading | 3× duplicated 32-row compoundVariants — DRY violation |
| Single `<Pill>` primitive wrapped by Button/Badge/Tag | 1 source of truth as a real React component | Adds a wrapper layer that doesn't carry semantic value |

**Decision:** shared helper at `packages/dashboard/src/lib/pill-variants.ts` exports a function `stateColorVariants(color, intensity)` returning the class-string fragment (bg + border + text). Each component's `cva` config spreads this helper alongside its own size axis. This matches how shadcn's own cva configs are typically structured — small composable pieces, not deep abstractions.

### Per-component responsibilities

| Code component | Figma Pill variant scope | Responsibility |
|---|---|---|
| `<Button>` | `type ∈ {button-xs, button-sm, button-default, button-lg, button-icon-xs, button-icon-sm, button-icon-default, button-icon-lg}` | Clickable actions. Drops the legacy `variant` prop (`default | destructive | danger | ...`) in favor of `color` × `intensity`. Adds `iconOnly` mode for the four `button-icon-*` sizes. |
| `<Badge>` | `type = pill` | Status indicators (state pills, count chips). Absorbs StateBadge + CountBadge. Adds `Has Icon` slot for the dot pattern. |
| `<Tag>` | `type = tag` | Small Fira Code mono chips for tool-call rows in agent transcripts. |

### Prop vocabulary (consistent across Button / Badge / Tag)

- `color: 'idle' | 'initializing' | 'running' | 'waiting' | 'pr-open' | 'error' | 'finished' | 'white'`
- `intensity: 'ghost' | 'muted' | 'mid' | 'loud'`
- Component-specific `size` axis (Button: `xs | sm | default | lg | icon-xs | icon-sm | icon-default | icon-lg`; Badge: single size; Tag: single size)

### State color naming

State color names in code match Figma exactly (`idle`, `initializing`, `running`, `waiting`, `pr-open`, `error`, `finished`, `white`) — no translation layer. This carries through to the Tailwind class generation (e.g. `bg-running-loud` resolves via Tailwind v4 `@theme` tokens already migrated in CREW-122).

## T1 — Pill primitives

**Goal:** reconcile Button + Badge with the new visual contract, add Tag, retire StateBadge + CountBadge.

### Files created

- `packages/dashboard/src/lib/pill-variants.ts` — shared `stateColorVariants(color, intensity)` helper. Exports a `cva` config fragment OR a function returning a class string (implementation detail for the plan).
- `packages/dashboard/src/components/ui/tag.tsx` — new Tag primitive (Fira Code mono, small Pill `type=tag` parallel).
- `packages/dashboard/src/components/ui/tag.figma.tsx` — Code Connect mapping (Pill, `restrictToVariants: { type: 'tag' }`).

### Files rewritten

- `packages/dashboard/src/components/ui/button.tsx` — new `cva` config: `variants: { color, intensity, size }`. Size axis: `xs | sm | default | lg` plus `icon-xs | icon-sm | icon-default | icon-lg` for icon-only buttons. Keeps `asChild` via Radix Slot.
- `packages/dashboard/src/components/ui/badge.tsx` — new `cva` config: `variants: { color, intensity }`. Single size. Optional `hasIcon` for the dot pattern (StateBadge's dot moves here).
- `packages/dashboard/src/components/ui/button.figma.tsx` — point at Pill set (`9FeJPriqdsdA4n9R5Xsrr8`, node id of the Pill set), `restrictToVariants: { type: ['button-xs', 'button-sm', 'button-default', 'button-lg', 'button-icon-xs', 'button-icon-sm', 'button-icon-default', 'button-icon-lg'] }`.
- `packages/dashboard/src/components/ui/badge.figma.tsx` — point at Pill set, `restrictToVariants: { type: 'pill' }`.

### Files deleted

- `packages/dashboard/src/components/StateBadge.tsx`
- `packages/dashboard/src/components/StateBadge.test.tsx`
- `packages/dashboard/src/components/StateBadge.figma.tsx`
- `packages/dashboard/src/components/CountBadge.tsx`
- `packages/dashboard/src/components/CountBadge.test.tsx`
- `packages/dashboard/src/components/CountBadge.figma.tsx`

### Caller updates

All consumers of `<StateBadge>` and `<CountBadge>` migrate to `<Badge>` with the new prop names. Likely sites (verify during implementation):

- `AgentRow.tsx` — `<StateBadge state="running">` → `<Badge color="running" intensity="muted">`
- `AgentBody.tsx` — same pattern
- `AgentsList.tsx` (project section headers) — count chips
- `ProjectsTable.tsx` — count chips per project row
- Anywhere else `grep -rn "StateBadge\|CountBadge"` finds them

Button caller updates: every `<Button variant="X">` call site updates to `<Button color="..." intensity="...">`. Mapping (from `[[project_crew_ds_pill_unified]]`):

| Old `variant` | New `color` × `intensity` |
|---|---|
| `default` | `color="white" intensity="loud"` |
| `destructive` | `color="error" intensity="loud"` |
| `danger` | `color="error" intensity="mid"` |
| `warning` | `color="waiting" intensity="loud"` |
| `secondary` | `color="running" intensity="muted"` |
| `outline` | `color="running" intensity="mid"` |
| `ghost` | `color="running" intensity="ghost"` |
| `link` | `color="initializing" intensity="ghost"` |

### Tests

- `pill-variants.test.ts` — small unit test: `stateColorVariants('running', 'loud')` returns the expected class string. One assertion per intensity for one color, plus the `white` color's distinct mid/muted behavior (stroke uses `state/idle`, not `state/X`).
- `button.test.tsx` — existing test updated to new props.
- `badge.test.tsx` — existing test updated, plus the rendering paths previously in StateBadge.test.tsx and CountBadge.test.tsx folded in.
- `tag.test.tsx` — new, basic rendering matrix.

## T2 — Form composites

**Goal:** add the form-family composites used by future Register / Edit / search-input contexts.

### Files created

- `packages/dashboard/src/components/ui/switch.tsx` — added via `pnpm dlx shadcn@latest add switch`. The on/off thumb colors are themed to match Figma (on = `state/initializing` thumb on `blue-1050` track; off = `muted-foreground` thumb on `secondary` track) via Tailwind v4 `@theme` overrides if shadcn's defaults don't already match.
- `packages/dashboard/src/components/ui/switch.figma.tsx` — Code Connect mapping.
- `packages/dashboard/src/components/FormField.tsx` — composite: vertical Label + Input. Props: `label: string` (uppercase by convention), `htmlFor` (auto-generated if absent), plus all `Input` props passed through.
- `packages/dashboard/src/components/FormField.test.tsx` — basic rendering + prop passthrough.
- `packages/dashboard/src/components/FormField.figma.tsx` — Code Connect mapping.

### Files rewritten

- `packages/dashboard/src/components/ui/input.tsx` — add `leadingIcon?: ReactNode` prop. When set, render absolute-positioned `<span>` inside a relative wrapper, with input padding adjusted (`pl-9`). Existing API surface preserved for non-icon callers.
- `packages/dashboard/src/components/ui/input.figma.tsx` — update to new file URL + node ID; map `Has Icon` BOOLEAN prop to `leadingIcon`.

### Caller updates

The agent drawer + agent page have a search input pattern that's currently a hand-rolled `<div className="relative">` + `<input>` + `<SearchIcon className="absolute">` combo. Migrate those call sites to `<Input leadingIcon={<SearchIcon />} />`.

### Tests

- `input.test.tsx` — extended to cover `leadingIcon` render path.
- `switch.test.tsx` — basic on/off toggle test.
- `FormField.test.tsx` — label-input pairing, htmlFor auto-generation.

## T3 — Modal infrastructure

**Goal:** add the modal-family composites and the small Stepper used inside the New Run modal.

### Files created

- `packages/dashboard/src/components/ui/alert-dialog.tsx` — added via `pnpm dlx shadcn@latest add alert-dialog`.
- `packages/dashboard/src/components/Modal.tsx` — wraps shadcn `Dialog`+`DialogContent`+`DialogHeader`+`DialogTitle`. Props:
  - `title: string`
  - `open: boolean`
  - `onOpenChange: (open: boolean) => void`
  - `showClose?: boolean` (default `true`)
  - `children: ReactNode` (the slot — replaces Figma's INSTANCE_SWAP Content property)
  - Applies Crew dark styling (slate-950 background, 1px border, 14px radius, drop shadow).
- `packages/dashboard/src/components/AlertModal.tsx` — wraps shadcn `AlertDialog`+`AlertDialogContent`+`AlertDialogTitle`+`AlertDialogDescription`+`AlertDialogFooter`+`AlertDialogCancel`+`AlertDialogAction`. Props:
  - `title: string`
  - `description: string`
  - `cancelLabel?: string` (default `"Cancel"`)
  - `actionLabel?: string` (default `"Continue"`)
  - `actionColor?: ButtonColor` (default `"error"`)
  - `actionIntensity?: ButtonIntensity` (default `"loud"`)
  - `onCancel?: () => void`
  - `onAction?: () => void`
  - `open: boolean`
  - `onOpenChange: (open: boolean) => void`
- `packages/dashboard/src/components/ModalSelectionRow.tsx` — composite for picker rows inside Modal children. Props:
  - `primary: string` (Hanken Grotesk medium 14)
  - `secondary?: string` (Fira Code mono 12, `muted-foreground`)
  - `meta?: string` (right-aligned mono 12, `muted-foreground`)
  - `badge?: ReactNode` (a `<Badge>` instance, or null)
  - `onClick?: () => void`
- `packages/dashboard/src/components/Stepper.tsx` — small horizontal stepper. Props:
  - `steps: string[]` (e.g. `["Project", "Ticket", "Confirm"]`)
  - `current: number` (1-based)
  - Renders `1·Step 1 › 2·Step 2 › 3·Step 3` with the current step highlighted (`color="initializing" intensity="muted"` style) and others muted.
- `*.test.tsx` + `*.figma.tsx` for each of the four new composites.

### Caller updates

None within this ticket — the four new composites are uncalled until the modal screens are wired (separate slices). Existing dialog usage (if any — check for `<Dialog>` usage in `Timeline/` or elsewhere) stays on shadcn `Dialog` directly until those call sites are migrated as part of their own slice.

### Tests

- `Modal.test.tsx` — open/close, close button toggles, title render, children slot renders.
- `AlertModal.test.tsx` — open/close, action handler fires, cancel handler fires, custom labels.
- `ModalSelectionRow.test.tsx` — primary/secondary/meta render, badge slot, click handler.
- `Stepper.test.tsx` — current step highlighting, step count rendering.

## Code Connect file updates

All 21 existing `.figma.tsx` files plus 7 new ones (4 modal-family + Tag + Switch + FormField) need consistent treatment:

- `figma.figma.connect()` URL updates to `9FeJPriqdsdA4n9R5Xsrr8` (the consolidated Crew file).
- Node IDs update to the current component IDs (see `project_crew_ds_*` memory entries for the authoritative IDs as of 2026-05-12).
- For files mapping to the Pill set (`button.figma.tsx`, `badge.figma.tsx`, `tag.figma.tsx`), use `restrictToVariants` to scope the mapping to the appropriate Figma `type` value(s).
- For composites with new Figma component properties (Modal's `Title`/`Show Close`, AlertModal's `Title`/`Description`, etc.), wire `props` to the Figma property names per Code Connect's `figma.string()` / `figma.boolean()` / `figma.instance()` helpers.

`.figma.tsx` updates land in the same PR as the corresponding component (T1 PR updates button/badge/tag figma files; T2 updates input/switch/FormField; T3 updates the 4 modal-family files), so each PR is self-contained and reviewable in isolation. No separate "Code Connect sweep" ticket.

## Testing strategy

- **Unit tests:** every new/changed component gets a `*.test.tsx`. Existing tests for StateBadge/CountBadge fold their assertions into `badge.test.tsx` before deletion.
- **Type + lint:** `npm run typecheck` and `npm run lint` clean in each PR.
- **Visual smoke:** after T1 lands, spin up the dashboard locally (`docker compose up` per worktree convention) and eyeball Agents + Projects views for regression — those views consume Button + Badge heavily and the variant prop rename touches every call site.
- **No new e2e:** the four modal composites aren't wired into routes yet, so there's nothing to drive from Playwright. e2e specs follow when the modals are wired in separate slices.

## Dependencies + sequencing

```
T1 (Pill primitives)
   │
   ▼
T2 (Form composites)  ─┐
                        ├─►  done
T3 (Modal infra)       ─┘
```

T1 must land first because:

- Modal's header close button is a `<Button color="running" intensity="ghost" size="icon-sm">`.
- AlertModal's footer uses two `<Button>` instances (Cancel + Action).
- ModalSelectionRow accepts a `<Badge>` slot.

Without T1's new Button + Badge contracts in place, T2/T3 would either hardcode equivalent styles (technical debt) or use the old `variant`-based Button (visual drift). Landing T1 first keeps the dependency clean.

T2 and T3 run in parallel after T1 — they share no code surface.

## Followup links

Items deliberately out of scope, captured in `docs/followups.md`:

- **2026-05-12 — Pill needs trailing-icon support (Filters chevron-down)** — blocks migrating the Filters dropdown to `<Button>`.
- **2026-05-12 — CodeChip composite for mono-font URL/path display** — blocks migrating the docker URL chip and worktree path chip.
- **2026-05-12 — Re-link 8 detached AgentRow tiles in modal-overlay screen backgrounds** — Figma-side cleanup; doesn't affect code.
- **2026-05-12 — Update `.figma.tsx` Code Connect files after Crew DS consolidation** — this spec resolves the in-scope portion (button/badge/input + new files). Any further drift is folded into the screen-wiring slices.

## Open questions

None remaining at spec time. All architecture, scope, and sequencing decisions are settled in the conversation that produced this spec.
