# CREW-231 — Dashboard polish A — Timeline classification & event keys

Jira: https://safturento.atlassian.net/browse/CREW-231

## Goal

Two dashboard-only timeline fixes from the Dashboard polish batch (CREW-230),
plan Tasks 1 (#5) and 2 (#2) in `docs/superpowers/plans/2026-06-05-dashboard-polish.md`:

1. **#5 — Stable timeline event keys.** `eventKey` falls back to `Math.random()`
   for events with no `uuid`/`timestamp`, so `crew_startup_*` rows (which carry
   only `startedAt`) get a fresh React key every render. The active-section 1s
   ticker remounts them and wipes each row's expand state. Fix: fall back
   `uuid → timestamp → startedAt → ${type}:${index}`.
2. **#2 — Coalesce the `Skill` tool into Skills.** A `tool_use` named `Skill`
   currently classifies as `tools` and shows as a selectable tool in the Tools
   subtree. It should classify as `skills`, be excluded from `eventToolAliases`,
   and render with the **Skill invoked** label + hooks-and-skills palette,
   matching skill attachments.

## Relevant files

- `packages/dashboard/src/components/Timeline/Timeline.tsx` — `eventKey` helper + call site
- `packages/dashboard/src/components/Timeline/eventClassification.ts` — `eventCategories`, `eventToolAliases`
- `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` — `specForAssistantBlock`
- Co-located `*.test.*` for each.

## Decisions

- **Skill tool name matched on the literal `'Skill'`** — `toolAlias('Skill')` is a
  no-op (no `mcp__` prefix), so a direct string compare is correct.
- **`tool_result` blocks stay under `tools`** — `eventCategories` has no
  id→name map, so a result can't know its tool name. The paired `tool_use`
  already contributes `skills`, so a Skill invocation is still reachable via the
  Skills filter. Documented in code as a deliberate choice.
- **Skill rows reuse the `'hooks-and-skills'` RowSpec category** — maps to the
  `initializing` palette via `CATEGORY_COLOR`, identical to skill attachments.
  No new color needed.

## Merge note

Touches `Timeline.tsx` / `Timeline.test.tsx` — merge-serialize with CREW-234.
Build in parallel; whichever merges first, rebase the other.
