# CREW-105 — FilterChips + SearchBar + LiveModeToggle + empty filter state

Jira: https://safturento.atlassian.net/browse/CREW-105

## Goal

Wires interactivity into the Timeline shell. Six filter chip groups
(Tool calls / Assistant prose / Thinking / System / Hooks & skills /
Other) with curated defaults, substring search via `eventOneLiner`,
live-mode toggle with `↓ N new events` pill, and an all-off empty
state with a "Show all" reset.

Plan reference: `docs/superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md`
tasks 23, 24, 25, 27.

## Relevant files

- `packages/dashboard/src/components/Timeline/Timeline.tsx` — orchestrates chips/search/live-mode; replaces empty toolbar slots.
- `packages/dashboard/src/components/Timeline/FilterChips.tsx` (NEW) — six chip groups + `defaultVisibleSet`.
- `packages/dashboard/src/components/Timeline/SearchBar.tsx` (NEW) — substring search with `useDeferredValue`.
- `packages/dashboard/src/components/Timeline/LiveModeToggle.tsx` (NEW) — toggle + new-events pill.
- `packages/dashboard/src/components/Timeline/eventClassification.ts` (NEW) — chip-group classifier + `eventOneLiner` helper, shared by chips/search.

## Decisions

- **`eventOneLiner` lives in `eventClassification.ts`** — colocated with the chip-group classifier so both consumers (search filter + future EventCard renderers in CREW-L) share one source of truth for one-liner content.
- **Timeline takes a new optional `agentState` prop** — needed for LiveModeToggle's default-on/off (ON unless agent is `finished`/`error`). AgentBody integration lives in a follow-on slice; default prop value defaults live mode ON so the standalone Timeline behaves sensibly when used without a state.
- **Live-mode default tracked via `useState` initializer** — initial value derived from `agentState`; a prop change after mount does not retroactively reopen the toggle.
- **All four pieces commit independently per plan** — one commit each for tasks 23/24/25/27 to keep the diff bisectable.

## Notes

This ticket is dashboard-only — no daemon HTTP routes change, so no Bruno updates. The existing Timeline tests already stub `clientHeight`/`getBoundingClientRect`/`ResizeObserver`; new tests reuse the same setup.
