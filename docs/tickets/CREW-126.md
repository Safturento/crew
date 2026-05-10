# CREW-126 — Phase 3 — Migrate existing Figma screens to consume Crew DS

Jira: https://safturento.atlassian.net/browse/CREW-126

## Goal

Final ticket of the Design System Bootstrap Epic (CREW-120). Migrate the 11 frames in the Figma screens file (`9FeJPriqdsdA4n9R5Xsrr8`) to consume Crew DS variables and component instances, fix the font (Sora → Hanken Grotesk), and rename the file. Upon landing, design fidelity tickets become unblocked: each can cite specific Crew DS components and node IDs.

## Plan reference

`docs/superpowers/plans/2026-05-09-design-system-bootstrap-phases-1-3.md` — Phase 3, Tasks 3.1 through 3.11.

## What landed in this PR

The autonomous run scoped Phase 3 down to the unambiguous, scriptable parts. Three blockers prevented executing the full plan in one shot — see "Deferred work" below for context and follow-up tickets.

**Font fix on all 11 frames.** Every text node using `Sora` (the html.to.design import substitute when Hanken Grotesk wasn't available at capture time) was swapped to `Hanken Grotesk`, preserving each node's style:

- 429 single-font text nodes mutated (379 `Sora Regular` → `Hanken Grotesk Regular`, 50 `Sora SemiBold` → `Hanken Grotesk SemiBold`)
- 3 mixed-font nodes had their `Sora` segments replaced via `setRangeFontName` (after preloading `Fira Code Medium` so the mutation could succeed)
- `Fira Code` segments (the dashboard's mono font, already correct) untouched
- Final font usage across 920 text nodes: exclusively `Hanken Grotesk` + `Fira Code` — zero remaining `Sora`
- Verified visually on `Agents List` frame; layout intact, all glyphs rendering correctly

**Documentation.** Phase 3 status, the 11-frame inventory with node IDs, and the three blockers are now recorded in `docs/plans/design-system.md`. Three followup entries land in `docs/followups.md` so the deferred work isn't lost.

## Deferred work

These items moved to followups because executing them in an autonomous run carried high risk of producing visually-broken or technically-invalid output:

1. **Bind hardcoded fills to Crew DS semantic variables** — 2,400+ fill-bearing nodes with hardcoded hex; mapping hex → semantic token (`background` vs `card` vs `border` vs `muted-foreground`) requires designer judgment per element. See `docs/followups.md#2026-05-09--crew-dashboard-screens--bind-hardcoded-fills-to-crew-ds-semantic-variables`.
2. **Rebuild ad-hoc modals + detached primitives as Crew DS instances** — Crew DS has zero composites at this stage (Phase 4 builds them); Core's primitives are searchable but Core isn't formally added to the screens file. See `docs/followups.md#2026-05-09--crew-dashboard-screens--rebuild-ad-hoc-modals--detached-primitives-as-crew-ds-instances`.
3. **Manual file rename** — `figma.root.name` setter is API-blocked (`"Setting the document name is currently not supported"`); needs a one-time desktop UI action. See `docs/followups.md#2026-05-09--manual-rename-of-figma-screens-file-to-crew-dashboard-screens`.

The "User-only finalization step (CREW-126)" section in `docs/plans/design-system.md` captures the manual actions remaining for the user.

## Relevant files

- `docs/plans/design-system.md` — Phase 3 partial scope section + frame inventory + finalization step
- `docs/followups.md` — three new active entries for deferred work
- `docs/superpowers/plans/2026-05-09-design-system-bootstrap-phases-1-3.md` — original plan; not modified

## Decisions

- **Defer color binding and instance swaps to designer-led tickets** — heuristic auto-binding from hex would over-merge intentionally-different shades or mis-classify (e.g. read a gray border as `muted-foreground` text). Better to ship the unambiguous wins (font fix) now and get the rest right with a human in the loop.
- **Crew DS Modal/Dialog/Form composites are a Phase 4 prerequisite for Task 3.10** — the original plan assumed they existed. They don't yet (`design-system.md` confirms Crew DS is "one variable collection and zero components"). Task 3.10 should be re-tackled after Phase 4 ships the composites, or a decision is made to use raw Core primitives instead.
- **One-shot autonomous run made font fix tractable across all 11 frames at once.** The 920 text nodes were small enough to handle in a single `use_figma` call (with all required fonts preloaded). Node-graph mutations on 3,810 nodes for color binding would need many rounds with verification, which doesn't fit the autonomous-run shape.

## Open questions

- [ ] Group the deferred color-binding work into one ticket per frame, or per logical section (lists / details / modals)?
- [ ] When Phase 4 starts, sequence composite-build before consuming-side migration? Or use raw Core primitives in the meantime?
- [ ] Re-check Figma Plugin API releases for a `setName` / `figma.root.name = ...` setter; if/when it ships, the manual-rename followup becomes scriptable.

## Notes

The ticket's Definition of Done expects all four bullets (variable bindings, mode toggle works, real Crew DS instances, fonts corrected) — only the fonts bullet is met by this PR. The other three are documented as follow-up scope. Reviewer should confirm this scope reduction is acceptable before the ticket transitions to Done. CREW-120 (Epic) can move to Done as soon as the three followups are formally ticketed (or accepted as Phase 4 prerequisites).
