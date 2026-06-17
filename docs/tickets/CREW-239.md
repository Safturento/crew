# CREW-239 — Drawer sticky headers: condensed header + pinned timeline toolbar

Jira: https://safturento.atlassian.net/browse/CREW-239

## Goal

Pin a condensed agent header (ticket key · truncated title · state badge · close button) and the timeline filter/search toolbar to the top of the agent drawer while the body scrolls as a single container. Identical behavior in drawer and full-page modes (close button drawer-only).

## Relevant files

- `packages/dashboard/src/components/AgentBody.tsx` — became the single scroll container; owns the IntersectionObserver sentinel + condensed-header overlay
- `packages/dashboard/src/components/CondensedHeader.tsx` — new composite (Figma node `706:1059`); exports `CONDENSED_HEADER_PX`
- `packages/dashboard/src/components/Timeline/Timeline.tsx` — sticky toolbar, inner scroll viewport removed, scroll consumers repointed via `scrollContainerRef`; exports `TOOLBAR_PX` / `PINNED_CHROME_PX`
- `packages/dashboard/tests/e2e/drawer-sticky-headers.spec.ts` — real-browser regression coverage (jsdom mocks IO + sticky away)
- `docs/superpowers/plans/2026-06-09-drawer-sticky-headers.md` — the 6-task plan this executed

## Decisions

- **IntersectionObserver sentinel, not scroll listeners** — a zero-height div at the DrawerHeader's bottom edge observed with the scroll container as root; no per-frame work. (Per spec.)
- **`scrollbar-gutter: stable` lives on the agent scroll container now** — the inner timeline viewport carried it before; self-review caught that the migration dropped it (2026-06-10).
- **e2e asserts `toolbarTop === 44` as a literal** — importing `CONDENSED_HEADER_PX` from the component module would drag React/lucide into the Playwright node transform; the literal is anchored by comment instead.

## Open questions

(none)

## Ruled out

- `scroll-margin-top` for section-jump offsetting — jumps use `scrollTo` (not `scrollIntoView`), where scroll-margin doesn't apply; offset is computed against the container instead.

## Notes

Verification quirks hit during the run, all environmental (not this change): `agent-drawer.spec.ts:118` + `runner-status-chip.spec.ts:8` fail identically on main and this branch on the worktree stack; `agent-actions` e2e runs leave pending rows in the daemon's action queue, which makes the bruno `get-pending` long-poll claim a stale action — drained by re-running `get-pending` until empty.
