# CREW-106 — EventCard dispatch + 7 per-type Timeline renderers

Jira: https://safturento.atlassian.net/browse/CREW-106

## Goal

Replace the Timeline's placeholder `EventCard` (which prints `event.type`)
with a real router that switches on the top-level `event.type` (and the
nested `assistant`/`user` `content[]` blocks, plus the `system` /
`attachment` subtypes) and delegates to seven focused renderers under
`packages/dashboard/src/components/Timeline/renderers/`. Each renderer
emits the §5c card anatomy: line 1 = type-specific one-liner, line 2 =
timestamp + token cost (when available); clicking expands a card to a
type-specific full view.

## Plan reference

[Slice 1c plan, Task 26](../superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md).

## Relevant files

- `packages/dashboard/src/components/Timeline/EventCard.tsx` — top-level dispatcher; expands `assistant`/`user` content arrays into one card per content block.
- `packages/dashboard/src/components/Timeline/renderers/ToolUseCard.tsx` — `[Bash] npm test` style line 1; expand shows full input.
- `packages/dashboard/src/components/Timeline/renderers/ThinkingCard.tsx` — first ~80 chars of `thinking`; expand shows full prose.
- `packages/dashboard/src/components/Timeline/renderers/TextCard.tsx` — first ~80 chars of `text`; expand shows full prose.
- `packages/dashboard/src/components/Timeline/renderers/ToolResultCard.tsx` — `[result for {tool_use_id}]`; `[error]` prefix when `is_error`.
- `packages/dashboard/src/components/Timeline/renderers/SystemCard.tsx` — discriminates on `subtype`; `turn_duration` → `12.4s`, `api_error` → message, etc.
- `packages/dashboard/src/components/Timeline/renderers/AttachmentCard.tsx` — discriminates on `attachment.type`.
- `packages/dashboard/src/components/Timeline/renderers/RawCard.tsx` — fallback for the `unknown` event variant; expand pretty-prints `raw` JSON.
- `packages/dashboard/src/components/Timeline/Timeline.tsx` — replaces the placeholder `EventCard` with the new dispatcher.

## Decisions

- **One card per content block.** Assistant/user events carry a
  `content[]` array. The plan calls for one card per item rather than
  one card per envelope, so `EventCard` flattens the array. The current
  `Timeline` virtualizer expects a 1:1 event→row mapping; flattening
  happens inside `EventCard` (as a fragment) and remains compatible
  with the virtualizer because each rendered fragment still occupies a
  single virtualized row. (Multi-row flattening at the virtualizer
  layer is a follow-on.)
- **Token line 2 reads usage.output_tokens.** Spec §5c says line 2 is
  `HH:MM:SS · 1.2k tok`. Output tokens are the meaningful figure
  (input is mostly cache reads). Cards without a timestamp render
  line 2 as empty rather than fake-zero.
- **No diff renderer for Edit/Write yet.** The acceptance criteria
  reference diff-style expansion, but diff rendering is its own
  concern. ToolUseCard expand shows the raw input JSON for now;
  prettier renderers can layer on top later.

## Notes

Tests are colocated next to each renderer (`*.test.tsx`).
