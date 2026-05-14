# Pill contract correction (CREW-135 re-do)

## Context

CREW-135 ("T1: Pill primitives — Button/Badge/Tag color × intensity contract") shipped twice and regressed visually twice. The first attempt (PR #177, closed) and the May 12 re-dispatch (PR #188, open) both produced an implementation where:

- `Badge` renders a CSS-only colored dot when `hasIcon` is true. Figma's Pill set declares an `Icon` INSTANCE_SWAP property — the dot is a wrong approximation of what's an actual lucide icon component.
- `Button` text-with-trailing-icon patterns like `View PR ↗` use the literal `↗` Unicode glyph in JSX text. Figma's Pill set places all icons in the **leading** position; no trailing-icon design exists.
- `AgentRow.tsx` line 67 ships with `<Badge ... intensity="muted">` for the state badge. Per the design system memo, the canonical state-badge intensity is `mid` (bg 10% + border 30%).
- `Button`, `Badge`, and `Tag` are three sibling component files sharing only a `pillSurfaceClasses()` helper. They have no shared base — different base class strings, different size definitions, no shared icon-slot contract — despite all mapping to the same Figma Pill component set at `node-id=272:120` in file `9FeJPriqdsdA4n9R5Xsrr8`.

The plan doc that drove both attempts (`docs/superpowers/plans/2026-05-12-ds-to-code-reconciliation.md`) encoded the wrong contract at Task 1.3:

> Badge takes `color` + `intensity` + `hasIcon` (optional dot). Renders the human-readable label as `children`.

And the plan's example unit test for Badge uses `intensity="muted"` for an AgentRow-shaped instance:

```tsx
render(
  <Badge color="waiting" intensity="muted" hasIcon>
    Waiting
  </Badge>,
);
```

Both attempts implemented the plan faithfully. The regressions are in the plan, not the implementation.

This spec corrects the contract and supersedes the relevant sections of the original plan. A companion spec, `2026-05-13-visual-fidelity-skill-enforcement.md`, addresses the orthogonal failure (the visual-fidelity-check skill silently didn't fire). Both ship; B1 ships first because Thread A's re-dispatch needs the gate active.

## Goals

1. The React contract for pill primitives mirrors Figma's actual shape: one underlying anatomy (the Pill set), differentiated by component type (button / badge / tag), with the icon as a swappable slot.
2. The shape is extensible — a future `Chip`, `Pip`, or any other pill-shaped primitive can wrap the same base by supplying its own static shape (height / radius / padding / font) without re-litigating color / intensity / icon-slot behavior.
3. AgentRow's state badge, and every other call site that's wrong against the Figma snapshot, gets fixed in the same dispatch. The visual-fidelity-check skill (B1) catches anything missed.
4. The plan doc is updated so a third re-attempt cannot inherit the same mistake.

## Non-goals

- Re-litigating the color × intensity palette or the surface-class helper (`pillSurfaceClasses`). That logic is correct and stays.
- Trailing-icon support. Figma uses leading icons exclusively across the Pill set; the contract follows the design.
- Icon-only square Button variants (the current `icon-xs` / `icon-sm` / `icon-default` / `icon-lg` sizes). Icon-only buttons are achievable via `<Button size="sm" icon={<X />} aria-label="Close" />` with no children — the flex layout collapses to roughly-square. If a future use case needs explicit equal-width hit targets, that's a follow-up.
- Code Connect publish to Figma (`figma connect publish`). Per the existing `project_code_connect_skipped` memory, the crew Figma file is Pro-tier, not Org — `.figma.tsx` files stay as inert documentation in the repo and Code Connect doesn't run.

## Design

### Architecture

> **Project-specific:** components live under `packages/dashboard/src/components/ui/`. Helpers live under `packages/dashboard/src/lib/`. Affected files listed below.

A new internal `PillBase` component owns the shared anatomy. The three exported primitives wrap it and supply their own shape strings:

```
ui/pill-base.tsx     ← NEW. Internal (not exported from index/barrel).
                        Owns base layout classes, color × intensity surface
                        classes (via lib/pill-variants.ts), and the leading
                        icon slot.

ui/button.tsx        ← Edit. Thin wrapper around PillBase. Native <button>.
                        Owns the size axis (xs | sm | md | lg). No icon-only
                        size variants — icon-only achieved via icon prop +
                        no children.

ui/badge.tsx         ← Edit. Thin wrapper. Native <span>. Static shape
                        (height / radius / padding / font). No size prop.

ui/tag.tsx           ← Edit. Thin wrapper. Native <span>. Static shape with
                        Fira Code mono font + 17px height. No size prop.

lib/pill-variants.ts ← Keep. `pillSurfaceClasses(color, intensity)` returns
                        the bg / border / text class fragment. Unchanged.
```

`PillBase`'s contract:

```tsx
type PillBaseProps = {
  color?: PillColor; // 8 values, default 'running'
  intensity?: PillIntensity; // 4 values, default 'mid'
  icon?: React.ReactNode; // leading slot only
  shape: string; // wrapper-supplied: height/radius/padding/font/size-tied classes
  as?: 'button' | 'span'; // wrapper-supplied
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;
```

PillBase renders:

```tsx
<Comp
  data-slot="pill"
  data-color={color}
  data-intensity={intensity}
  className={cn(
    'inline-flex w-fit items-center whitespace-nowrap', // shared layout
    shape, // wrapper-supplied
    pillSurfaceClasses(color, intensity), // shared surface
    className,
  )}
>
  {icon}
  {children}
</Comp>
```

Each wrapper supplies its own `shape` constant. Button's lives inside the file as a `Record<Size, string>` keyed on the size axis; Badge and Tag's are static strings.

### Contract changes vs PR #188

| PR #188                                                                                              | Corrected                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Badge.hasIcon: boolean` → renders a CSS dot via `<span class="rounded-full bg-... h-1.5 w-1.5" />`  | **Drop `hasIcon`.** Replace with `icon?: React.ReactNode`. No fallback dot.                                                         |
| Button has no icon slot in its prop type                                                             | Add `icon?: React.ReactNode` (leading position).                                                                                    |
| Tag has no icon slot                                                                                 | Add `icon?: React.ReactNode` (leading position).                                                                                    |
| Button sizes: `xs \| sm \| default \| lg \| icon-xs \| icon-sm \| icon-default \| icon-lg` (8 sizes) | Button sizes: `xs \| sm \| md \| lg` (4 sizes). `default` → renamed `md`. All `icon-*` square variants removed.                     |
| Button/Badge/Tag each have their own base class string                                               | All three wrap `PillBase`. Base layout classes live in PillBase; only the shape (height/radius/padding/font) lives in each wrapper. |

### Code Connect updates

> **Project-specific:** `.figma.tsx` files at `packages/dashboard/src/components/ui/{button,badge,tag}.figma.tsx`.

Current `badge.figma.tsx` exposes `hasIcon` as `figma.boolean('Has Icon')` — the boolean visibility toggle. It does not expose the `Icon` INSTANCE_SWAP property. The corrected `.figma.tsx` files expose `Icon` via `figma.instance('Icon')` (or whatever Code Connect's current syntax is for INSTANCE_SWAP):

```tsx
// badge.figma.tsx (sketch)
figma.connect(Badge, '...?node-id=272-120', {
  variant: { type: 'pill' },
  props: {
    label: figma.string('Label'),
    icon: figma.instance('Icon'),  // INSTANCE_SWAP, resolves to a lucide component
    color: figma.enum('color', { ... }),
    intensity: figma.enum('intensity', { ... }),
  },
  example: ({ label, color, intensity, icon }) => (
    <Badge color={color} intensity={intensity} icon={icon}>
      {label}
    </Badge>
  ),
});
```

Whether the snapshot's `enrichment.componentProperties.Icon.name` resolves to a literal lucide component reference in the rendered Code Connect example is a Code Connect concern; the React contract just accepts a `React.ReactNode` and renders it.

### Caller migration

Every existing call site of `<Button>`, `<Badge>`, `<Tag>` is reviewed against the Figma snapshot's enrichment data:

- **State badges (AgentRow, AgentBody, ProjectRow):** `intensity="muted"` → `intensity="mid"`. `hasIcon` → `icon={<Circle .../>}` (or whatever lucide the per-state enrichment names — `enrichment.componentProperties.Icon.name` is the source of truth; the visual-fidelity-check skill reads it).
- **Quick-action buttons in AgentRow (`Resume`, `Finish`, `View PR ↗`, `Provide input`, `Inspect`):** literal trailing `↗` removed. Where Figma's instance has a leading icon, add `icon={<LucideIcon />}`. Where Figma's instance has no icon, no `icon` prop is passed.
- **Other call sites (`AgentBody`, `ProjectRow`, `ProjectSection`, `ProjectHeader`, `TopNav`, `ProjectsListPage`, `ui/dialog.tsx`):** systematic audit driven by the visual-fidelity-check skill's Step 4 (caller check). Each site's `color` / `intensity` / `icon` props are verified against the enriched snapshot.

The plan doc that supersedes the current one names the per-component audit as an explicit task rather than letting it ride implicitly under "callers updated".

### Plan doc supersession

The existing plan at `docs/superpowers/plans/2026-05-12-ds-to-code-reconciliation.md` is wrong (it encoded `hasIcon: boolean dot` for Badge). The new plan generated from this spec replaces Tasks 1.1–1.5 of the old plan with corrected versions and gets a clear name. The old plan gets a one-line note at the top:

> **Superseded** — see `docs/superpowers/plans/2026-05-13-pill-contract-correction.md`. The original encoded an incorrect Badge contract (`hasIcon: boolean dot` instead of `icon: ReactNode` slot). Do not implement from this doc.

The CREW-135 ticket description in Jira is updated to point at the new plan instead of the old one. Other ticket-level acceptance criteria are updated to reflect the corrected contract (4 button sizes instead of 8, `icon` slot instead of `hasIcon` dot, no `default` size, etc.).

## Acceptance criteria

- `ui/pill-base.tsx` exists, is not exported from any barrel file, and is the only file in the dashboard that wires `pillSurfaceClasses()` to the icon slot + base layout classes.
- `<Button color="X" intensity="Y" size="Z" icon={...}>label</Button>` works with all 8 colors × 4 intensities × 4 sizes (`xs | sm | md | lg`).
- `<Badge color="X" intensity="Y" icon={...}>label</Badge>` works for all color × intensity pairs. `hasIcon` is not part of the prop type.
- `<Tag color="X" intensity="Y" icon={...}>label</Tag>` works for all color × intensity pairs. Renders 17px tall, Fira Code 11.
- No reference to `hasIcon` exists anywhere in `packages/dashboard/`.
- AgentRow's state badge renders with `intensity="mid"` (not `muted`) and passes a lucide icon component (not a `<span>`).
- "View PR" buttons render with a leading lucide icon and no trailing Unicode glyph.
- All `.figma.tsx` files for Button, Badge, Tag expose the `Icon` INSTANCE_SWAP property.
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all pass in `packages/dashboard`.
- The `visual-fidelity-check` skill is invoked at step 8 of the dispatch workflow (B1's enforcement). Its findings report shows zero high-severity findings; medium/low findings are surfaced in the PR description.

## Verification

End-to-end verification is the re-dispatch itself: `crew run CREW-135` after B1 has shipped, with a fresh `~/Repos/crew-CREW-135` worktree and the closed PR #188 superseded.

Confirmation signals on the resulting PR:

- The dispatched agent invoked `visual-fidelity-check` (session transcript shows the `Skill` tool_use).
- AgentRow state badge renders with `intensity="mid"` and a real lucide icon.
- "View PR" buttons show a leading lucide icon, no `↗`.
- The visual-fidelity-check report appears in the PR description with zero high-severity findings.

## Dependencies and order

- **B1 (visual-fidelity-skill-enforcement.md) must ship before this thread re-dispatches.** Without B1, the next re-dispatch can produce the same regressions silently.
- This thread depends on the existing CREW-141 (Plugin-API enrichment) — already merged — for the snapshot data the skill reads. No new infrastructure is required.
- The administrative steps (close PR #188, delete remote `CREW-135` branch, reset the worktree, update the Jira description) happen in-chat after spec approval, before re-dispatch.

## Out of scope

- Re-doing CREW-136 (Form composites) or CREW-137 (Modal infrastructure). They are blocked by CREW-135's correct shape but their re-implementation is a separate effort. The Pill contract correction here is upstream of both.
- A general DS refactor of how primitives compose. PillBase is specific to pill-shaped primitives; if other DS families (e.g., form fields) need similar base/wrapper structure, that's a separate decision.
- Reviewing the `pillSurfaceClasses()` color/intensity outputs. The surface logic is correct per `project_crew_ds_palette_strategy` memory; only the wiring above it changes.

## Forward path

Once PillBase ships, future pill-shaped primitives (a `Chip` for filter lists, a `Pip` for status dots, etc.) extend the same base by supplying their own `shape` constant. No re-implementation of color / intensity / icon-slot anatomy.

The visual-fidelity-check skill (post-B1) catches any future caller drift automatically. If the gate proves load-bearing for these primitives, generalizing the same "structural + caller + visual" check to other DS families becomes the natural next investment.
