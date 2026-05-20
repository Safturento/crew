# AgentRow card redesign — design

**Date:** 2026-05-19
**Status:** Draft for review
**Branch:** `docs/agentrow-card-redesign-spec`

## Context

The dashboard's `AgentRow` component shipped during the original agents-list slice (CREW-102 /
CREW-103) as a six-column table row: `STATE | ID | RUNTIME | TOKENS | TITLE | actions`. The
Figma design system has since evolved the same surface into a **card** with stacked content —
title on top, dot-separated icon meta below, quick-actions right-aligned — and per-state border
+ fill treatment for the attention states. The committed Figma component at node `212-910` is
the canonical end-state. The drift is the single largest visual-fidelity gap between the
rendered dashboard and Figma; structural rather than spacing.

A 2026-05-18 pass already corrected sizing issues that surfaced during the CREW-135 Pill
primitive work (the `h-16` / `gap-3` adjustments after the root-font-size fix in PR #243). That
landed AgentRow on the correct dimensions but did not touch the layout shape itself. This spec
covers the layout shape.

In the 2026-05-19 brainstorm, the user also flipped the Figma component's quick-action buttons
from the previous `xs` size to `sm`. The code update for that flips the same way.

## Inputs

- Figma component: [Crew DS Composites — AgentRow `212-910`](https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=212-910)
- Figma consumers: Agents List ([`1-2`](https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=1-2)) and Project detail ([`1-2443`](https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=1-2443))
- Committed snapshot: `.crew/figma-snapshot/composites/212-910.json` + `.png`
  (currently stale on the `xs → sm` action-button edit — refreshed via the selective-export work
  that gates the implementation `crew run`; see Out of Scope §3)
- 2026-05-13 followup that pre-sized this work, anchored at `docs/followups.md`
  ("Agent rows: code renders as table; Figma designs as cards")

> **Project-specific:** the followup memo claimed three consuming screens (Agents List, Project
> detail, Agent full page). Verified during this brainstorm: `AgentRow` is consumed in exactly
> one place — `ProjectSection.tsx` — which `AgentsListPage` and `ProjectDetailPage` render.
> `AgentFullPage` does not list other agents and is not a consumer. The followup memo needs
> correction as part of resolving it on this PR.

## The model

Rewrite `AgentRow` from a six-column grid into a flex card with a title-and-meta stack. Keep
the data contract (the `AgentRowProps` shape) and the state-color tokens (`STATE_CLASSES`,
`STATE_META`) untouched — the rewrite is purely structural + a button-size flip. Add a
`showHeader` prop to `ProjectSection` so the Project detail page can hide the inner section
header (the page already shows the project name at the top via `ProjectHeader`); when the
section header is hidden, the page renders the active/total count adjacent to its own `AGENTS`
heading so the information isn't lost. Delete the `ColumnHeaderRow` component — the table
header it owned has no home in the card layout.

## Changes

### 1. `AgentRow.tsx` — card rewrite

Replace the current 6-column grid (`grid-cols-[100px_90px_90px_70px_1fr_168px]`) with a flex
row: `[state-pill] [title-and-meta-stack] [actions]`. Card chrome stays at
`h-16 rounded border bg-card px-4 py-3 transition-colors hover:bg-popover`. Per-state border
and background continue to come from the existing `cva` variants block driven by
`STATE_CLASSES[state]`.

**Internal layout (left-to-right):**

| Slot | Content | Sizing |
|---|---|---|
| State pill | `<Badge color={state} intensity="mid" icon={<StateIcon />}>{meta.label}</Badge>` — unchanged today | `shrink-0`, vertically centered |
| Title + meta stack | Vertical flex with `min-w-0` so truncation works. Top row: `<span class="truncate text-sm text-foreground">{agent.ticketTitle}</span>`. Bottom row: inline meta. | `flex-1`, `gap-0.5` between rows |
| Quick actions | Same switch on `agent.state` as today; size `xs → sm`. | `shrink-0`, `ml-auto` |

**Meta row.** Inline flex with three icon+value pairs separated by literal `·` characters and
typed as `font-mono text-xs text-muted-foreground`:

- ticket glyph (likely `<Hash />`) ` {agent.key}`
- runtime glyph (likely `<Clock />`) ` {runtime}`
- tokens glyph (likely one of `Diamond` / `Sparkle` / `Coins` — set-level instance per Figma) ` {formatTokens(agent.tokens)}`

Icons render at `h-3 w-3` `inline-block`. Final lucide names for all three glyphs get
confirmed against `212-910.json`'s `componentInstances[].componentName` at implementation
time — the snapshot is the binding spec for which DS-canonical lucide instance sits in each
slot.

**Attention pulse.** Keep the existing `<span aria-hidden absolute inset-y-1.5 left-0 w-1 rounded-full ${stateClasses.solidBg} animate-att-pulse>`
overlay for `meta.attention` states (waiting / pr_open / error). It renders on top of the new
card border. The static "accent" rectangle on the Waiting variant in Figma is the design
stand-in for this animated stroke — Figma cannot animate, so the code preserves the motion that
the static asset implies.

**Click semantics.** `role="button"`, `tabIndex={0}`, `aria-label={\`${key} — ${ticketTitle}\`}`,
whole-card click → `onSelect`. Enter/Space → `onSelect` only when `e.target === e.currentTarget`
(unchanged guard so focused action buttons don't double-fire). Action buttons stop propagation
through their existing `QaGroup` wrapper.

**Button size flip.** All `<Button>` calls inside `QuickActions` move from `size="xs"` to
`size="sm"`. Matches the Figma component update.

**State styling matrix** (no token contract change — same `STATE_CLASSES` keys consumed in the
same way):

| State | Card border | Card bg | Attention bar | Quick actions |
|---|---|---|---|---|
| Initializing | default `border` | default `bg-card` | — | — |
| Running | default | default | — | — |
| Idle | default | default | — | Resume (mid) + Finish (ghost) |
| Waiting | `STATE_CLASSES.waiting.border` | `.bg` | yes | Provide input (loud) |
| PR open | `STATE_CLASSES.pr_open.border` | `.bg` | yes | View PR (mid, GitPullRequest) + Finish (ghost) |
| Error | `STATE_CLASSES.error.border` | `.bg` | yes | Inspect (mid) |
| Finished | default | default | — | — |

### 2. `ProjectSection.tsx` — `showHeader` prop, drop `ColumnHeaderRow`

Add `showHeader?: boolean` (default `true`) to `ProjectSectionProps`. When `false`, omit the
entire header `<div>` (chevron toggle + folder icon + name + ExternalLink open-project button +
count text + repoPath). The collapsed state is meaningless without the toggle — short-circuit
the `useState(collapsed)` branch when the header is hidden so the body always renders.

In both branches, remove the `<ColumnHeaderRow placement="per-section" />` render. The list
gap between cards likely needs to increase from `gap-1.5` (cards carry more visual weight than
table rows); the exact gap is resolved against the Figma reference at implementation time.

### 3. `ProjectDetailPage.tsx` — page-level count, `showHeader={false}`

Pass `showHeader={false}` to `<ProjectSection>`. Render the active/total count adjacent to the
existing `AGENTS` heading:

```tsx
const total = filteredAgents.length;
const active = filteredAgents.filter((a) => a.state !== 'finished').length;
// ...
<div className="mt-8 mb-2 flex items-center gap-2">
  <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">AGENTS</h2>
  <span className="text-xs text-muted-foreground">{active} active · {total} total</span>
</div>
```

The `active` definition (`state !== 'finished'`) matches the inner `ProjectSection`'s current
behavior on `AgentsListPage` — both surfaces show the same count for the same agent list.

### 4. `ColumnHeaderRow.tsx` — delete

The file `packages/dashboard/src/components/ColumnHeaderRow.tsx` and any `.test.tsx` companion
are removed. Grep confirms one consumer (`ProjectSection.tsx`); removing that import along
with the deletion is the entire consumer-side change.

### 5. Test updates

`AgentRow.test.tsx` is rewritten to assert card affordances rather than column positions:

- Card renders with `role="button"` and `aria-label` `"{key} — {ticketTitle}"`
- Title text present and truncates
- Meta row contains all three values (key, runtime, tokens) — query by text content
- State pill renders with the correct label
- Attention-pulse `<span>` present for waiting / pr_open / error and absent for the others
- Quick actions render the right buttons per state, click handlers fire with the correct
  `QuickActionKind`, and `onSelect` does not fire when an action is clicked
- Whole-card click and Enter/Space on the card itself fire `onSelect`
- Live-runtime updates tick when state is `initializing` or `running` (`vi.useFakeTimers` carries over)

`ProjectSection.test.tsx` — if absent, add a minimal file covering: `showHeader={false}` omits
the header, body and empty-state still render; `showHeader={true}` (default) renders the
header.

`ProjectDetailPage.test.tsx` — extend to assert the count appears next to the `AGENTS` heading
and the inner `ProjectSection` header is hidden.

`AgentsList.tsx` — no test changes; default behavior unchanged.

`AgentRow.figma.tsx` — unchanged. Code Connect still maps to `212-910`. Visual-fidelity check
at PR time validates the rewritten code against the live Figma node.

## Verification

End-to-end: dispatched `crew run` on the implementation ticket completes with
`visual-fidelity-check` green against `.crew/figma-snapshot/composites/212-910.png`, and a hand
inspection of `AgentsListPage` + `ProjectDetailPage` in the running dashboard shows:

- All seven states render the card shape with the right border/fill treatment
- Waiting / PR open / Error cards show the animated left-edge pulse stroke on top of the card border
- ProjectDetailPage shows no inner section header; AgentsListPage still shows it
- `{active}/{total}` count appears next to the AGENTS heading on ProjectDetailPage and matches
  the same count the AgentsListPage inner-header shows for the same project
- Hover, focus, click, and keyboard activation behave identically to the table-row version
- Live runtime ticks every second while a row is `running` or `initializing`

Unit verification: `npm test --workspace=crew-dashboard` passes including the rewritten
`AgentRow.test.tsx` and new `ProjectSection` / `ProjectDetailPage` cases. Typecheck and lint
green. `agents-doc-parity-check` reports no `.agents/*.md` `covers` glob matches that warrant a
doc update (this is component-shape work; `.agents/design-system.md` already covers
`packages/dashboard/src/components/**`, but the prose there describes the DS contract, not
specific component layouts — confirm during implementation).

## Non-goals

1. **The five sibling visual-fidelity followups noticed in the same 2026-05-13 comparison
   session stay separate.** Per the brainstorm decision: `BrandMark` glyph drift, drawer
   Close-button Unicode-X, search-input leading icon, Token-usage section gate, Hide-finished
   toggle Figma reference — each gets its own ticket on its own cadence.
2. **No new DS primitives.** Approach B (decompose row into Title/Meta/Actions sub-components)
   and approach C (extract a `Card` primitive into `ui/`) were both ruled out as premature.
   The row stays a single file; the card shape stays inlined in `AgentRow.tsx`. Revisit if a
   second consumer surfaces.
3. **The selective figma-snapshot export is a separate, hard-blocking prerequisite.** That work
   is tracked as the 2026-05-19 entry in `docs/followups.md` and gets brainstormed +
   implemented in-session immediately after this spec lands, before the implementation
   `crew run` for AgentRow is dispatched. Refreshing the snapshot to capture the `xs → sm`
   button edit waits on selective export so a single-node refresh is feasible.
4. **No data contract change.** `AgentRowProps`, the `Agent` shape, and the SSE / React-Query
   layer above the row are all untouched. The rewrite is render-only.

## Forward path

If a future consumer wants a similar card shape (e.g., a Run history row, a Project tile),
revisit approach C — extract a `ui/card.tsx` primitive at that time and have both consumers
compose it. Don't pre-build it now. Same reasoning for approach B: if the row's three sub-areas
(title, meta, actions) start being reused independently or differ across consumers, decompose
then.

## Followup correction

The 2026-05-13 followup memo ("Agent rows: code renders as table; Figma designs as cards") in
`docs/followups.md` cites three consuming screens. Implementation PR moves it to **Resolved**
with a correction noting the actual consumer scope: one component, one parent (`ProjectSection`),
two consuming pages (`AgentsListPage`, `ProjectDetailPage`); `AgentFullPage` does not list
other agents.
