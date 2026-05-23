# CREW-188 — dashboard(drawer): TranscriptRow composite

Jira: https://safturento.atlassian.net/browse/CREW-188

## Goal

Replace `EventCard` in the drawer Timeline with a `TranscriptRow` composite that
matches the Figma drawer redesign — a single horizontal row per content block:
left **Tag** (event-category coloured, mono) · middle one-liner (truncate) ·
right meta column (`HH:MM:SS · NNN tok`).

## Relevant files

- `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` — new composite
- `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx` — Slim 5 coverage
- `packages/dashboard/src/components/Timeline/TranscriptRow.figma.tsx` — Code Connect mapping
- `packages/dashboard/src/components/Timeline/Timeline.tsx` — swap `<EventCard>` for `<TranscriptRow>`
- `packages/dashboard/src/components/Timeline/EventCard.tsx` — removed (and renderers/ retired)
- `.agents/design-system.md` — add `TranscriptRow` row to composite list
- `docs/followups.md` — Resolved entry for the TranscriptRow Figma-fidelity gap

## Decisions

- **Figma node ID is `553:445`, not `318:230`.** The ticket body cites `318:230`
  (which is actually the `Input` primitive) and `558:477` (which is actually the
  `TimelineToolbar`). Verified via `.crew/figma-snapshot/index.json`. The real
  `TranscriptRow` component lives at `553:445`. Snapshot screenshot confirms the
  single-row Tag-text-meta anatomy.
- **One row per content block, not per event.** Mirrors the existing `EventCard`
  iteration model so an assistant turn carrying text + thinking + tool_use renders
  as three rows. Avoids losing per-block context (Bash command body vs. surrounding
  assistant prose).
- **Tag colour drives event-category identity, not state.** Slim 5 → Pill colour
  mapping: `conversation → running` (slate), `tools → waiting` (amber, matching
  the Figma sample where `Bash` resolves to `waiting/mid`), `thinking → pr_open`
  (violet), `hooks-and-skills → initializing` (blue), `system → idle` (gray).
  Errors override to `error` (red) — tool_result with `is_error: true`, system
  api_error, attachment hook_non_blocking_error.
- **Tag label** = tool name for `tool_use`; `Result` (with the tool's name when
  resolvable from the event's other blocks, else the truncated `tool_use_id`) for
  `tool_result`; `Assistant` / `User` for text blocks; `Thinking` for thinking;
  `[<attachment.type>]` for attachments; `[system/<subtype>]` for system events.
- **Tokens column shows assistant `output_tokens`** for assistant blocks only
  (mirrors existing renderers). Other blocks render the timestamp alone.
- **Row collapsible via `<details>` semantics.** Click the row to expand a `<pre>`
  with the underlying JSON / full text — preserves the existing EventCard
  expand-on-click affordance so users keep their data-density tool. Visual fidelity
  to the Figma snapshot is the collapsed state.
- **`data-testid="transcript-row"`** on the row element, `data-block-type` on the
  same element for diagnostic targeting. `aria-label` summarises the category +
  one-liner.
- **Old `EventCard` + `renderers/` directory deleted.** Replacement is total —
  no transitional shim. The only `EventCard` reference today is in
  `Timeline.tsx`; removing both keeps the diff atomic.

## Open questions

- None — the Figma snapshot resolves everything the ticket body left ambiguous.

## Ruled out

- Per-tool category colour table (e.g. `Bash → warning`, `Read → info`). The Slim 5
  category-based mapping is simpler and matches the existing Filters dropdown axis.
- Virtualisation — explicitly out of scope per the ticket.

## Notes

The ticket's "Followup move" instruction expects an existing entry in
`docs/followups.md`. None of today's followups names the TranscriptRow gap
specifically — the closest is the 2026-05-11 "Crew DS is partial vs Dashboard
Screens; Timeline container + Bash event tags missing" entry, which covers
"timeline container composition" broadly. Per the ticket's "(add one if it
doesn't yet exist)" clause, this PR adds a dedicated entry and immediately
resolves it.
