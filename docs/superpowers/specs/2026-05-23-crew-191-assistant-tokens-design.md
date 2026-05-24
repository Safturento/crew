# CREW-191 — Surface Assistant tokens in TokensByTool

**Ticket:** [CREW-191](https://safturento.atlassian.net/browse/CREW-191)
**Epic:** [CREW-189](https://safturento.atlassian.net/browse/CREW-189)
**Date:** 2026-05-23

## Goal

Restore the **panel total = sum of visible row tokens** invariant on the drawer's TokensByTool composite. Currently `TranscriptRow` surfaces per-block `output_tokens` for every assistant event (text + thinking + tool_use), but `TokensByTool` only aggregates `tool_use` events. The user reads "Bash · 4k tokens" + "Assistant · 12k tokens" in the timeline and sees a panel total that omits the 12k.

Fix by adding an `"Assistant"` aggregate row to the daemon's `tokens_by_tool` builder.

## Non-goals

- **Per-category breakdowns** (input / output / cache_read / cache_creation) — owned by **F (CREW-195)** as part of cost-weighted display.
- **Total row at bottom of TokensByTool** — separate UX concern; this ticket just adds the missing contributor row.
- **Splitting Assistant into "Assistant text" / "Assistant thinking" sub-rows** — single bucket is enough.

## Design decisions (brainstormed 2026-05-23)

| Q | Decision |
|---|---|
| Q1 — aggregation location | **Daemon.** Extend the existing `tokens_by_tool` builder to include an `"Assistant"` entry. API stays the source of truth; CLI, Bruno, future consumers all see the new row. Sets up F's per-category schema change cleanly. |
| Q2 — bucket contents | **Output tokens only** (`usage.output_tokens` summed across assistant events). Matches what TranscriptRow already shows per row, so panel total = sum of visible row tokens. Avoids double-counting risk if tool rows already attribute any cache/input tokens. F layers input + cache + cost weighting on top. |
| Q3 — visual treatment | **Same row layout as tools + `lucide/sparkles` icon.** Renders identical to tool rows (label · bar · count); panel stays cohesive; Assistant is "another contributor." Sparkles signals AI without being twee. |

## Architecture

### Daemon side

Wherever `tokens_by_tool` is currently computed (likely `packages/daemon/src/services/AgentsService.ts` or a transcript-aggregation helper), extend the result to include one extra row at the front (or appropriately ordered):

```ts
{ tool: 'Assistant', tokens: <sum of output_tokens across assistant events for this agent> }
```

The exact aggregation point depends on how `tokens_by_tool` is currently built — the implementer locates it via grep. The contract is:

- New row whose `tool` field is the string `"Assistant"`.
- `tokens` field equals the sum of `usage.output_tokens` (treating `null`/`undefined` as 0) across all events where `event.type === 'assistant'`.
- Appears in the same array as existing tool rows; downstream alias aggregation in `TokensByTool.tsx` already handles unknown names (`"Assistant"` doesn't match any MCP prefix, so the alias `toolAlias("Assistant")` returns `"Assistant"` unchanged).

No DB schema change — `tokens_by_tool` is computed at query time. No migration needed unless the current implementation caches the aggregated array.

### Frontend side

Two changes in `packages/dashboard/src/components/TokensByTool.tsx`:

1. **Icon mapping** — extend whatever per-tool icon mapping currently exists (or add one if absent) so `"Assistant"` maps to `lucide/sparkles`. If there's no current mapping (tool rows render without icons today), introduce one: an inline `iconForTool(name: string)` returning the lucide component for known tools or `null` otherwise.

2. **Row sort order** — Assistant row visually surfaces near the top. Either:
   - Sort the rows so `"Assistant"` is always first regardless of token count, then tools by descending tokens.
   - Or let it sort naturally by token count (likely large enough to be top anyway).

   Recommend the explicit first-position sort — predictable, doesn't depend on token-count happenstance.

### TranscriptRow

No changes. Per-row token attribution stays identical. The bug is in TokensByTool's input, not TranscriptRow's rendering.

## Testing

### Daemon

`packages/daemon/src/services/AgentsService.test.ts` (or equivalent):

- Fixture with 3 assistant events (`output_tokens: 100, 200, 50`) and 2 Bash tool_use events.
- Assert `tokens_by_tool` includes `{ tool: 'Assistant', tokens: 350 }`.
- Assert Bash row still present with correct count.
- Assert agent with zero assistant events has no Assistant row OR has Assistant with `tokens: 0` (pick one — recommend: omit when 0 so the panel stays tight).

### Bruno

`bruno/agents.bru` or equivalent: assert the agent detail response's `tokens_by_tool` includes the Assistant row for a populated fixture (CREW-102).

### Frontend

`packages/dashboard/src/components/TokensByTool.test.tsx`:

- Renders an Assistant row when the input includes one.
- Assistant row shows the sparkles icon.
- Assistant row is always positioned first (regardless of token count).
- Existing tool-row tests still pass.

### Visual

`visual-fidelity-check` against the CREW-102 populated fixture: confirm the panel shows Assistant + 6+ tool rows; total matches the sum.

## Out of scope

- F's per-category extension (separate ticket; this lays the foundation).
- A totals row at the bottom of TokensByTool.
- Per-event token attribution UI (already done — TranscriptRow shows it).

## Risks

- **Double-counting if daemon's tool attribution includes assistant output tokens.** Tool rows likely sum SOMETHING tokenwise — if that "something" is `output_tokens` of the message that contained the tool_use, the Assistant row would double-count those tokens. Mitigation: when implementing, inspect the existing tool-row aggregator. If it uses `output_tokens`, switch tool rows to count invocations (or input-token-share) and let the Assistant row own output tokens. Document the choice.
- **Edge case: no assistant events.** Some agent fixtures might have only attachments/system events. Omit the Assistant row in that case (don't render `tokens: 0`).
- **Naming collision: a user could theoretically have a tool literally named "Assistant".** Very unlikely (it's a reserved-feeling name) but if it ever happens, the sum collides. Acceptable risk; flag in the ticket if it becomes real.
