# CREW-135 fixture — T1 Pill primitives

**Source:** PR [#177](https://github.com/Safturento/crew/pull/177) — feat(dashboard): T1 — pill primitives (Button/Badge/Tag color × intensity contract)

**Date captured:** 2026-05-12

**Captured from:** Agents-list view at the top of the dashboard (TopNav + agent rows). Renders all the touched components — Button, Badge, the state-badge dots, the Clear attention count pill, and the View PR action.

## What's wrong (ground truth)

### 1. State badges render without a visible outline

**Symptom:** State badges (`PR open`, `Running`, `Initializing`, `Error`, `Waiting`) appear as flat-filled dark chips with no border. Figma reference (snapshot/screens/1-756.png) shows a thin 1px stroke in the state color (e.g. `amber/500` for waiting, `slate/500` for running).

**Root cause:** Caller-side intensity choice. `AgentRow.tsx:67-69` and `AgentBody.tsx:65-72` both pass `<Badge intensity="muted">`. The Pill set's `type=pill, color=X, intensity=muted` variant has `strokes: []` (no border) — verified in `snapshot/composites/272-120.json`. The Figma agent-drawer screenshot uses `intensity=mid`, which adds the 1px state-colored stroke. Should be `intensity="mid"`.

**Affected files:**
- `packages/dashboard/src/components/AgentRow.tsx:67-69`
- `packages/dashboard/src/components/AgentBody.tsx:65-72`

**Not a bug in:** `pillSurfaceClasses` (correctly emits `border border-{color}-500` for `mid`) or `badge.tsx` (correctly composes the helper).

### 2. Clear attention button has an outer border where Figma has none

**Symptom:** The Clear attention button in the top-right of the dashboard renders with a subtle outline. Figma reference (`snapshot/composites/243-120.png`) shows the "Clear attention" container as an unbordered frame (just text + count pill side-by-side).

**Root cause:** Two contributing factors.

a. **Caller passes the wrong intensity.** `TopNav.tsx:38-39` uses `<Button color="running" intensity="mid">`. The Pill set's `intensity=mid` adds the slate/500 stroke. Figma's Clear attention is a borderless frame; the matching button intensity is `ghost` (no fill, no stroke, just text in the color).

b. **Legacy className override still present.** `TopNav.tsx:42` keeps `className="border-white/10 text-muted-foreground hover:bg-popover disabled:opacity-40"`. The `border-white/10` overrides the system's border treatment. After fixing (a), this className override is also stale and should be dropped.

**Affected files:**
- `packages/dashboard/src/components/TopNav.tsx:37-43` — intensity + className cleanup

### 3. Clear attention count pill uses loud (solid) instead of mid (hollow) intensity

**Symptom:** The `2` count inside the Clear attention button renders as a solid yellow pill (bg-amber-400, dark text). Figma reference shows a hollow yellow pill: dark amber-1050 background with a 1px amber/500 stroke and amber/400 text.

**Root cause:** Caller-side intensity choice. `TopNav.tsx:48` uses `<Badge color="waiting" intensity="loud">`. Figma's count-pill instance at node `332:230` (child of Clear attention frame) is `type=pill, color=waiting, intensity=mid` — verified in `snapshot/composites/243-120.json`. Should be `intensity="mid"`.

**Affected files:**
- `packages/dashboard/src/components/TopNav.tsx:47-49`

### 4. `pillSurfaceClasses('white', 'loud')` uses wrong shade

**Symptom:** The `+ New Run` button (white/loud variant) renders with a slightly dim near-white background. Figma reference for `type=button-sm, color=white, intensity=loud` uses `zinc/50` (#FAFAFA). Code's `pill-variants.ts` `WHITE_CLASSES.solidBg` is `bg-neutral-200` (#E5E5E5).

**Root cause:** Helper bug — wrong Tailwind shade mapping for the `white` PillColor. `WHITE_CLASSES` constant at `packages/dashboard/src/lib/pill-variants.ts:9-13` should use `bg-zinc-50` not `bg-neutral-200`. The Figma intent matches zinc/50; this was an assumption error in the original spec that the agent followed literally.

**Affected files:**
- `packages/dashboard/src/lib/pill-variants.ts:9-13` — change `solidBg: 'bg-neutral-200'` to `solidBg: 'bg-zinc-50'`. Also reconsider `text: 'text-slate-950'` — Figma uses `zinc/950` (#09090B), but slate-950 (#020617) is nearly identical and a defensible substitution. Flag as a low-severity finding.

### 5. View PR button uses Unicode arrow instead of an SVG icon

**Symptom:** View PR action on PR-open agent rows shows "View PR ↗" with a Unicode "north-east arrow" character (U+2197). Glyph metrics, weight, and color don't match the Figma reference, which uses `lucide/arrow-up-right` SVG with controlled stroke width.

**Root cause:** Caller-side rendering choice. `AgentRow.tsx:119-122` and `AgentBody.tsx:85-90` put the arrow in the text content:

```tsx
<a href={agent.prUrl ?? '#'} target="_blank">
  View PR ↗
</a>
```

Should use SVG: `<Button><ArrowUpRight /> View PR</Button>` (or post-T2: a `leadingIcon` prop).

**Affected files:**
- `packages/dashboard/src/components/AgentRow.tsx:117-122`
- `packages/dashboard/src/components/AgentBody.tsx:85-90` (same pattern for "↗ Open as page")

## Findings that may or may not be flagged (judgment calls)

### State badge dot indicator vs Figma's icon slot

`badge.tsx:43-49` renders a CSS-only dot (`<span h-1.5 w-1.5 rounded-full bg-{color}>` — 6×6 filled circle). The Figma Pill set's `Has Icon=true` defaults to `lucide/git-pull-request` (the SET-level default), but state-badge instances on agent screens use a circle glyph. Visually similar (small colored dot), but not the same primitive. The skill may or may not flag this depending on threshold — it's a "looks close enough" case where a human might accept the CSS dot as an equivalent.

## Out of scope for this fixture

- **2px button height mismatch.** Code's button-sm = `h-8` (32px); Figma's button-sm = 30px. Below the threshold worth flagging unless paired with another problem.
- **Color-token aliasing differences** that don't change rendered hex. E.g., Figma's bound variable `state/running -> slate/400` resolves to the same `#94A3B8` as the code's `text-slate-400`. The skill should focus on rendered-output drift, not naming differences.
- **Pre-existing dashboard issues that CREW-135 didn't introduce.** If something was broken before CREW-135, it's not in scope for this fixture.
