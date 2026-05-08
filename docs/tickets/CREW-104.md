# CREW-104 — TokenTable + StateHistoryBar + Timeline shell with virtualization

Jira: https://safturento.atlassian.net/browse/CREW-104

## Goal

Three core drawer body components per UI design §5a/§5b/§5c, built as
standalone units and verified by unit tests. Integration into
`AgentBody` is a follow-on slice.

## Relevant files

- `packages/dashboard/src/components/TokenTable.tsx` — sortable per-tool tokens table with share-of-total %
- `packages/dashboard/src/components/StateHistoryBar.tsx` — inline pills + arrows; click fires `onScrollTo(ts)`
- `packages/dashboard/src/components/Timeline/Timeline.tsx` — virtualized event list (placeholder EventCard) + empty toolbar slots
- `packages/dashboard/src/data/state-meta.ts` — adds `transitionToAgentState()` to bridge `TransitionState` (`init`) → `AgentState` (`initializing`)
- `packages/dashboard/package.json` — adds `@tanstack/react-virtual`

## Decisions

- **TransitionState → AgentState mapping in state-meta** — kept the
  state-history vocabulary (`init`) separate from the agents-list
  vocabulary (`initializing`) per the existing type-system split, then
  mapped at the consumer (StateHistoryBar). Avoids drifting either type.
- **Timeline shell only renders a placeholder EventCard** — per-type
  renderers (ToolUse / Thinking / Text / ToolResult / System / Attachment
  / Raw) land in CREW-L. The shell exposes empty FilterChips / SearchBar
  / LiveModeToggle slots ready to wire in the next tickets.
- **Browser smoke didn't render the new components** — they aren't yet
  wired into `AgentBody` (which still shows the
  "Timeline, state history, and token table land in CREW-J" placeholder).
  Verified the existing drawer flow has no regressions.

## Notes

- Virtualization in jsdom requires stubbing `clientHeight` /
  `getBoundingClientRect` / `ResizeObserver`; done in
  `Timeline.test.tsx` `beforeAll`.
- TokenTable click-to-sort is wired on the `<th>` itself (with
  `tabIndex=0` + `onKeyDown` for keyboard) so
  `getByRole('columnheader', { name: /tokens/i })` is directly clickable.
