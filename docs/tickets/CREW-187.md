# CREW-187 — dashboard(drawer): Timeline UX expansion

Jira: https://safturento.atlassian.net/browse/CREW-187

## Goal

Six coupled UX changes for the drawer Timeline + TokensByTool:

1. Replace the bare `<input>` SearchBar with the DS `Input` composite + leading `lucide/search` icon.
2. Replace the inline FilterChips strip with a single Filters Pill + Popover.
3. Add a shared `toolAlias()` utility that collapses MCP tool names into `MCP:<Service>` buckets.
4. Slim event classification to five categories + a `DROPPED_TYPES` list filtered at the data layer.
5. Drive the Filters popover's "Tools" rows from the agent's `tokens_by_tool` aliased + sorted descending.
6. Re-aggregate `TokensByTool` client-side by alias (no backend change).

## Relevant files

- `packages/dashboard/src/format/tool-alias.ts` — new utility + helper
- `packages/dashboard/src/components/Timeline/eventClassification.ts` — Slim 5 rewrite + `isDroppedEvent`
- `packages/dashboard/src/components/Timeline/Timeline.tsx` — drop pre-filter, filter-state shape
- `packages/dashboard/src/components/Timeline/SearchBar.tsx` — switch to `<Input>` + leading icon
- `packages/dashboard/src/components/Timeline/FilterChips.tsx` — replaced by `Filters.tsx`
- `packages/dashboard/src/components/ui/input.tsx` — add `leadingIcon?: ReactNode` prop
- `packages/dashboard/src/components/ui/popover.tsx` — new shadcn-style wrapper around radix-ui Popover
- `packages/dashboard/src/components/TokensByTool.tsx` — client-side alias aggregation

## Decisions

- **Popover primitive lives in `components/ui/popover.tsx`.** Mirrors the existing `dialog.tsx` shape; `radix-ui` is already a dep so no new install.
- **`DROPPED_TYPES` is applied at the dashboard data layer in `Timeline.tsx`.** The ticket allows either dashboard- or daemon-side; doing it on the consumer keeps the change scoped to one PR and lets the daemon stay a passthrough.
- **Filter state = `{ categories: Set<CategoryId>; tools: Set<string /* alias */> }`.** `tools` empty means "all tools" (no narrowing). Event predicate: categories AND (tools empty OR event has at least one matching aliased tool).
- **`TokensByTool` row order preserved by alias-total descending.** Same shape as before; only the row identity changes.
- **`Filters` pill shows numeric badge only when current selection diverges from defaults** (categories ≠ defaults OR tools non-empty).

## Open questions

- None blocking — every implementation question resolves from the ticket body.

## Ruled out

- Backend tool_name normalisation — explicitly out of scope per the ticket.
- TranscriptRow composite — separate ticket.
- Virtualization inside open TimelineSection — separate perf ticket.

## Notes

The 2026-05-13 search-icon followup in `docs/followups.md` is closed by Item 1 and moves to Resolved in this PR.
