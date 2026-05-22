# Agent drawer code migration to new Figma composites — design

**Date:** 2026-05-22
**Status:** Draft for review
**Branch:** `plan/agent-drawer-rebuild`

## Background

The 2026-05-21 design pass landed a redesigned agent drawer in Figma (file
`9FeJPriqdsdA4n9R5Xsrr8`, AgentBody `220:246`). It introduces several new
composites and restructures the body content. The dashboard code still renders
the pre-redesign drawer: inline `AgentHeader` inside `AgentBody`, a standalone
`StateHistoryBar` section, a flat virtualized `Timeline`, and the unused
`TokenTable.tsx`. This work migrates the drawer code to the new design with full
data plumbing for the new sections (no mock data, no placeholders).

The Figma snapshot was refreshed in the preceding commit on this branch (also
2026-05-22), so the new composites are visible to `visual-fidelity-check` as the
diff target.

## Front-half decisions

| Decision                               | Choice                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Scope boundary                         | **Drawer + AgentPage, full data plumbing** — both surfaces redesigned; new backend fields ship together |
| Data plumbing shape                    | **Extend `AgentDetail`** — single round-trip via `useAgent`; no new endpoints                           |
| Sequencing                             | **Vertical slice, backend first** — one Epic, 5 child tickets, backend unblocks parallel frontend       |
| RunMetrics widget (Layer-1)            | **Drop from drawer + AgentPage** — placement decision tracked in `docs/followups.md`                    |
| Timeline section data source           | **Group client-side** off existing `useStateHistory` + transcript events                                |
| `app_url` / `jira_url` derivation      | **Server-side compose** — already-loaded project config; render-time URLs                               |
| `tokens_by_tool` aggregate location    | **Embedded in `AgentDetail`** — same SSE invalidation as the rest of the detail                         |
| StateHistoryBar fate                   | **Delete** — state history merges into TimelineSection headers                                          |

## Ticket breakdown — Epic

One Epic (`CREW-???: Drawer code migration to new Figma composites`) with five
child tickets. Dependency edges shown in the parallelism plan at the bottom.

### Ticket 1 — `backend(AgentDetail)`: add `app_url`, `jira_url`, `tokens_by_tool`

Extends `AgentsService.getAgentDetail` + the `AgentDetail` interface in
`packages/dashboard/src/data/types.ts`. Small ticket. Blocks 2, 3.

- `app_url: string | null` from `[playwright].app_url || [bruno_smoke].base_url`
  (already loaded for prompt generation; just exposed).
- `jira_url: string | null` constructed server-side from project config's Jira
  base + `ticket_key`.
- `tokens_by_tool: { tool: string; tokens: number; percent: number }[]` via SQL
  aggregate over `tool_calls`:
  `SELECT tool_name, SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS tokens FROM tool_calls WHERE run_id IN (<this-agent's-runs>) GROUP BY tool_name ORDER BY tokens DESC`.
  Percent computed server-side from the row total.
- Frontend wire: add `tool_calls.changed` invalidation to `useAgent` so the new
  `tokens_by_tool` aggregate refreshes during an active run, not just on run
  completion (see "Data flow → Backend → API" below).

### Ticket 2 — `dashboard(DrawerHeader)`: extract DrawerHeader composite

New `<DrawerHeader>` component matching Figma `594:803`. Replaces the inline
`AgentHeader` function in `AgentBody.tsx`. Blocked by ticket 1.

Props: `detail: AgentDetail`, `showCloseButton: boolean`, `showOpenAsPage:
boolean`, `onClose?: () => void`.

Internal structure:

- breadcrumb row: `project · ticket_key · state Pill · runtime · tokens`
- title row: `ticket_title`
- meta row: 3 mono-font Pills (docker `app_url`, jira `jira_url`, worktree
  `worktree_path`) + Provide-input Pill on `waiting` state
- top-right: Open-as-page Pill + X-close Pill, each conditional on its flag

The Unicode `✕` close glyph in `AgentDrawer.tsx:42` and the standalone close
button there delete; close action moves into `<DrawerHeader showCloseButton/>`.
Resolves the 2026-05-13 followup about the `lucide/x` SVG.

### Ticket 3 — `dashboard(TokensByTool)`: TokensByTool section

New `<TokensByTool>` composite matching Figma `577:643`, plus `<TokenBarRow>`
primitive matching `555:449`. Reads `tokens_by_tool` from AgentDetail. Blocked
by ticket 1.

`TokensByTool` props: `tokensByTool: AgentDetailTokensByTool[]`, `total: number`.
`TokenBarRow` props: `tool: string`, `tokens: number`, `percent: number`.

Renders header, body of `TokenBarRow`s, footer total. Replaces the dead
`TokenTable.tsx` (which deletes in ticket 5). Empty `tokens_by_tool` renders a
short empty-state row rather than the table — agent has done no tool calls yet.

### Ticket 4 — `dashboard(Timeline)`: state-grouped TimelineSection + Collapse-all

Refactors `Timeline.tsx` flat virtualized list into per-state sections matching
Figma `559:650`. Does not depend on ticket 1; can run in parallel with 2 and 3.

- New `<TimelineSection>` component. Props: `state`, `startedAt`, `elapsed`,
  `eventCount`, `tokenSum`, `isOpen`, `onToggle`, `children` (EventCards in
  range).
- New client-side grouping: `groupEventsByState(events, transitions)` returns
  per-state sections with their event arrays. Uses existing `useStateHistory`
  output; no new query.
- Toolbar (`<TimelineToolbar>` or inline-on-Timeline) gains Collapse-all Pill
  between Search and Live (matches Figma `558:477`).
- Per-section collapse state lives in `Timeline.tsx`'s local state. Collapse-all
  flips every section.
- Virtualization concession: closed sections render nothing past the header;
  only open sections virtualize their event lists.
- Active section uses a live-elapsed counter (move the `useLiveRuntime` pattern
  from `AgentBody.tsx:152-164` into `TimelineSection` for the active section).

Fallback when `transitions` is empty (new agent): render a single ungrouped
section using `detail.state` so the timeline never blank-screens.

### Ticket 5 — `dashboard(cleanup)`: delete dead components + final wires

Deletes the components the redesign replaces:

- `StateHistoryBar.tsx`, `StateHistoryBar.figma.tsx`, `StateHistoryBar.test.tsx`
- `TokenTable.tsx`, `TokenTable.figma.tsx`, `TokenTable.test.tsx`

AgentPage (`AgentBody mode="full"`) width/padding fixes to match Figma
`1:1900` — `AgentBody` instance at FIXED 1056w, centered in pageContainer with
`paddingTop: 32`.

Code Connect mapping updates for the changed composites + adds for the new ones
(`DrawerHeader.figma.tsx`, `TokensByTool.figma.tsx`, `TokenBarRow.figma.tsx`,
`TimelineSection.figma.tsx`).

Resolves part of the 2026-05-08 followup ("Wire `StateHistoryBar`, `TokenTable`,
and Token-usage section into `AgentBody`") — `StateHistoryBar` and the
Token-usage section are addressed; that followup moves to Resolved as part of
this ticket.

Blocked by tickets 2, 3, and 4.

## Component inventory

### New

- `DrawerHeader.tsx` — composite (Figma `594:803`)
- `TokensByTool.tsx` — composite (Figma `577:643`)
- `TokenBarRow.tsx` — primitive row (Figma `555:449`)
- `TimelineSection.tsx` — section header + body slot (Figma `559:650`)

### Refactored

- `AgentBody.tsx` — strips inline `AgentHeader`, becomes `<DrawerHeader/>` +
  `<BodyContainer>` (padding 20/24/32/24, gap 28) wrapping `<TokensByTool>` +
  `<Timeline>`. Loses `RunMetrics` (see "Related followups" below).
- `Timeline.tsx` — keeps `FilterChips`, `SearchBar`, `LiveModeToggle`; flat list
  becomes section-grouped; adds Collapse-all.
- `AgentDrawer.tsx` — standalone close button + Unicode `✕` glyph delete; close
  passes through `DrawerHeader`.

### Deleted

- `StateHistoryBar.tsx` (+ `.figma.tsx`, `.test.tsx`)
- `TokenTable.tsx` (+ `.figma.tsx`, `.test.tsx`)

### Unchanged but referenced

`EventCard`, `FilterChips`, `SearchBar`, `LiveModeToggle`, `useAgent`,
`useStateHistory`, `STATE_META`, Pill primitives.

## Data flow

### Backend → API

`AgentsService.getAgentDetail` composes three new fields onto the response.

**SSE invalidation:** Today, `useAgent` listens to `agent.state_changed` (sets
the `state` field optimistically) and `run.completed` (full invalidate). It
does **not** listen to `tool_calls.changed`. With `tokens_by_tool` on
`AgentDetail`, the aggregate would only refresh on run completion — stale during
an active run.

Ticket 1 therefore includes a small frontend wire: add a `tool_calls.changed`
listener to `useAgent` that invalidates `['agent', key]`. The throughput on this
channel is modest enough (one event per assistant tool-use) that no debounce is
needed. If it ever does become hot, we'll add a `setQueryData`-with-merge path
that recomputes `tokens_by_tool` from the SSE payload directly, but that's
YAGNI for now.

The three other listeners that touch the same query (`useStateHistory`,
`useTimeline`) keep their existing wiring unchanged.

### Frontend interfaces

```ts
export interface AgentDetailTokensByTool {
  tool: string;
  tokens: number;
  percent: number;
}

export interface AgentDetail {
  // ...existing fields
  app_url: string | null;
  jira_url: string | null;
  tokens_by_tool: AgentDetailTokensByTool[];
}
```

### Timeline grouping

Client-side via:

```ts
function groupEventsByState(
  events: TranscriptEvent[],
  transitions: StateTransition[],
): Array<{
  state: AgentState;
  startedAt: number;
  endedAt: number | null;
  events: TranscriptEvent[];
}>;
```

`eventCount` and `tokenSum` per section are derived from the events in the
section's time window. `elapsed-in-state` is `endedAt - startedAt` for closed
sections, or `now - startedAt` (re-rendered every second) for the active
section.

## Error handling

- `app_url` / `jira_url` `null` → respective pill in DrawerHeader doesn't render.
  No placeholder — the row is just shorter.
- `tokens_by_tool: []` → TokensByTool renders an empty-state row ("No tool usage
  yet") rather than the table.
- `useStateHistory` returns empty transitions → Timeline falls back to a single
  ungrouped section using `detail.state`. Never blank-screens.
- `useAgent` loading + error states stay verbatim (existing patterns at
  `AgentBody.tsx:26-40`).
- DrawerHeader `showCloseButton=true` without `onClose` → X pill renders
  disabled. AgentPage passes `showCloseButton=false`, so this branch is mostly
  unreachable but defensive.

## Testing

### Unit (Vitest + RTL + jsdom)

One test file per new component, scoped to its ticket:

- `DrawerHeader.test.tsx` — renders all three meta-row pills when fields are
  present; hides docker / jira pills when their field is null; respects
  `showCloseButton` + `showOpenAsPage`; renders Provide-input only on `waiting`
  state.
- `TokensByTool.test.tsx` — renders rows in array order; formats footer total;
  empty-state when array is empty.
- `TokenBarRow.test.tsx` — bar width proportional to `percent`; tabular-nums on
  token cell.
- `TimelineSection.test.tsx` — collapse toggle changes body visibility; header
  reads state / elapsed / count / tokens correctly; active section uses
  live-elapsed.
- `Timeline.test.tsx` extension — events group into per-state sections when
  transitions exist; fallback single section when transitions empty; Collapse-all
  flips every section.

### Backend

- `AgentsService.test.ts` extension — `getAgentDetail` returns `app_url` /
  `jira_url` from project config; returns `tokens_by_tool` aggregated correctly
  across multiple runs; empty `tokens_by_tool` for agent with no tool calls;
  null URLs when project config missing them.

### Playwright e2e (one new file, lands with ticket 5)

`agent-drawer-redesign.spec.ts` — opens drawer, verifies DrawerHeader pills
render, opens a timeline section by clicking its header, asserts Collapse-all
collapses every section. Reuses the existing dev seed fixtures.

### visual-fidelity-check gate

Every frontend ticket (2, 3, 4, 5) runs `visual-fidelity-check` against the
relevant composite IDs in the refreshed snapshot. Unit tests catch logic
regressions, fidelity check catches visual regressions against the Figma
source.

### Deletions

`StateHistoryBar.test.tsx` and `TokenTable.test.tsx` delete with their
components (ticket 5).

## Parallelism plan

```
Phase 1
  Ticket 1 — backend (AgentDetail extensions)

Phase 2 (after ticket 1; ticket 4 has no hard dep but reviews here for cohesion)
  Ticket 2 — DrawerHeader composite
  Ticket 3 — TokensByTool composite
  Ticket 4 — Timeline state-section grouping + Collapse-all

Phase 3 (after 2 + 3 + 4)
  Ticket 5 — cleanup, deletions, AgentPage tweaks, e2e
```

Hard dependency edges (for Jira "blocks" / "is blocked by" links):

- Ticket 2 *is blocked by* Ticket 1 (DrawerHeader reads `app_url`, `jira_url`)
- Ticket 3 *is blocked by* Ticket 1 (TokensByTool reads `tokens_by_tool`)
- Ticket 4 has **no hard backend dep** — could ship before ticket 1 — but is
  framed in Phase 2 so the full surface ships in a recognisable shape
- Ticket 5 *is blocked by* Tickets 2, 3, 4

Three sequential phases for five tickets. Optimistically 2 review cycles end to
end if all three Phase-2 tickets land in one batch.

**Epic key:** to be assigned at Jira creation time (referenced as `CREW-???`
in the ticket-breakdown section). The plan-doc step will substitute the real
key once the Epic exists.

## Out of scope

- **RunMetrics widget placement.** Dropped from drawer + AgentPage in this work.
  Re-homing decision tracked in `docs/followups.md` (2026-05-22 entry).
- **MetricsTrendWidget.** Not in the Figma redesign; not touched here.
- **Backend SSE optimization for `tokens_by_tool`.** If the existing
  `tool_calls.changed` invalidation proves too hot we'll add debouncing in a
  follow-up; YAGNI for the slice.
- **Tooltip primitive for the worktree path / docker URL pills.** Click-to-copy
  is good enough; tooltips are a separate DS concern.
- **Per-section `endedAt` for the active section.** Section is open-ended until
  the next transition fires — that's the live-elapsed signal.
- **State history collapse-all-on-load default.** Sections open by default;
  collapse is an explicit user action.

## Acceptance criteria

1. `useAgent` returns `app_url`, `jira_url`, `tokens_by_tool` on `AgentDetail`,
   computed server-side from project config + tool_calls aggregate.
2. `<DrawerHeader>` renders matching Figma `594:803`, replacing the inline
   `AgentHeader` in `AgentBody`. `visual-fidelity-check` passes on the drawer
   header.
3. `<TokensByTool>` renders the new section matching Figma `577:643`, populated
   from real `tokens_by_tool`. `visual-fidelity-check` passes.
4. `<Timeline>` groups events into per-state sections matching Figma `559:650`,
   with a working Collapse-all toggle in the toolbar. Fallback single section
   when transitions empty. `visual-fidelity-check` passes.
5. `StateHistoryBar.tsx` and `TokenTable.tsx` (and `.figma.tsx`, `.test.tsx`
   siblings) are deleted.
6. The `AgentDrawer.tsx` Unicode `✕` close glyph is replaced by the lucide
   `<X/>` SVG inside the DrawerHeader's X pill. Resolves the 2026-05-13
   followup.
7. Playwright `agent-drawer-redesign.spec.ts` passes against the dev seed.
8. The 2026-05-08 followup ("Wire StateHistoryBar / TokenTable / Token-usage
   section into AgentBody") moves to Resolved.

## Related followups

- `docs/followups.md` — 2026-05-22 entry: RunMetrics widget needs a new home
  (dropped from drawer + AgentPage in this work; component itself stays).
- `docs/followups.md` — 2026-05-13 entry: drawer Close uses Unicode `✕`.
  **Resolved by ticket 2** (close moves into DrawerHeader's lucide X pill).
- `docs/followups.md` — 2026-05-13 entry: search input missing leading icon.
  Not addressed by this work — independent followup, depends on CREW-136 (T2
  Form composites).
- `docs/followups.md` — 2026-05-08 entry: Wire StateHistoryBar / TokenTable
  into AgentBody. **Partially resolved** (StateHistoryBar deleted, Token-usage
  section shipped as TokensByTool). The full entry moves to Resolved with
  ticket 5.
