# Fidelity Vertical Slices — Design Spec

**Status:** Draft, awaiting user review
**Date:** 2026-05-10
**Brainstormed by:** safturento + Claude (Opus 4.7)

## Summary

Continue Phase 4 of the design system bootstrap (full Crew DS coverage of dashboard composites) by riding existing fidelity tickets — **CREW-117** (Agent drawer) and **CREW-119** (Agents list) — as the units of work. Each ticket bundles building the Crew DS composites it needs, refactoring the dashboard composite to consume shadcn primitives, migrating the corresponding Figma frame (color binding + ad-hoc primitive swap from CREW-126's deferred followups), the original visual fidelity sweep, and updates to the design-system inventory doc. No new Epic — only two tickets in flight; Epic-ifying becomes worth it if a third fidelity ticket appears. Adds Crew-specific state-color tokens to Crew DS as a one-time addition during CREW-119.

## Context & motivation

The design system bootstrap Epic (CREW-120) closed with Phases 1-3 done modulo CREW-126's three deferred followups:

1. **Color binding** — bind hardcoded fills in 11 frames to Crew DS semantic variables (~2,400 fill-bearing nodes; needs designer judgment per element)
2. **Composite rebuild** — replace ad-hoc modals + detached primitive structures across 8 frames with real Crew DS component instances (blocked because Crew DS had zero composite components at CREW-126 time)
3. **Manual rename** — Figma file from "Untitled" → "Crew Dashboard Screens" _(done 2026-05-10)_

Followup #2 is the largest, and it's effectively Phase 4 (build the Crew DS composites that didn't exist yet). Followup #1 is per-frame work that pairs naturally with #2. Followup #3 was a one-minute action.

The original Phase 4 spec called for "incremental, opportunistic during fidelity tickets." Two pre-existing fidelity tickets — CREW-117 (Agent drawer) and CREW-119 (Agents list) — are exactly the right vehicle. They predate the design system bootstrap (created when the design hand-off existed but the system didn't), so their original scope was "code-side fidelity sweep." With the design system in place, their scope expands to the full vertical slice: build the Crew DS composites the screen needs, refactor code to consume shadcn primitives, migrate the Figma frame, do the fidelity sweep.

## Architecture

Architecture is settled by the prior design system bootstrap spec (`docs/superpowers/specs/2026-05-09-design-system-bootstrap-design.md`) — Core (forked shadcn kit, published) → Crew DS (override layer + composites, published) → Crew Dashboard Screens (consumer). shadcn/ui is the dashboard's primitive layer in `packages/dashboard/src/components/ui/`. Code Connect mappings live as `.figma.tsx` files in code (publish skipped per project memory — Pro plan tier limitation).

What's new here is the **vertical slice strategy**: each fidelity ticket is the unit of work. Inside a ticket, the work spans Figma + code together rather than siloed by surface. This is the spec's original intent ("opportunistic during fidelity tickets") finally exercised.

### Why no new Epic

Two tickets only. Epic overhead (description maintenance, parallelism plan, dependency edges) doesn't pay back at N=2. Both tickets are independent enough — only one component (`StateBadge`) is shared, and the work-order rule (whichever runs first builds it) is trivial to convey in a comment on the second ticket. If a third fidelity ticket arrives — Project Page sweep, New Run modal flow sweep, or any of the other 7 frames left untouched after CREW-126 — Epic-ify at that point.

## Per-ticket scope

Both tickets follow the same five-step bundle:

1. **Build Crew DS composites** for this screen (subset of the 11 Phase 4 components named in the bootstrap spec)
2. **Refactor dashboard code** to consume shadcn primitives (Button, Input, Dialog, etc.) where applicable, replacing inline `div + Tailwind` patterns
3. **Migrate Figma frame**: bind hardcoded fills to Crew DS semantic + state tokens, swap detached primitive structures for the new Crew DS instances. Picks up CREW-126's followups #1 and #2 for this screen.
4. **Visual fidelity sweep** — the original ticket goal. Pixel/spec comparison against the Figma frame; close gaps.
5. **Update `docs/plans/design-system.md`** inventory with the new components' Figma node IDs.

### CREW-119 — Agents list visual fidelity sweep to design hand-off v2

| Aspect                              | Details                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma frame**                     | `Agents List (/)` (id `1:2` per CREW-126's frame inventory)                                                                                                     |
| **Code surface**                    | Dashboard's `AgentsList` route + `AgentRow`, `ProjectSection`, `StateBadge`, `TopNav`, `BrandMark` components                                                   |
| **Crew DS composites built**        | `TopNav`, `BrandMark`, `AgentRow`, `AgentsList`, `StateBadge`, `ProjectSection`                                                                                 |
| **Notable refactors**               | `AgentRow`'s inline `<button>` → `<Button variant="ghost" size="sm">`; `StateBadge` becomes a thin wrapper around the new state-color tokens (see next section) |
| **First-time additions to Crew DS** | State-color semantic tokens (`state/running`, `state/error`, `state/waiting`, etc. — see Section "State colors")                                                |
| **Visual scope**                    | Per the original CREW-119 ticket: Agents list page matches the design hand-off v2 Agents List frame                                                             |

### CREW-117 — Agent drawer visual fidelity sweep

| Aspect                       | Details                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma frames**             | `Agents List (/) - Agent Drawer Open` + `Agent Page (/agent/XXX-123/full)`                                                                                                   |
| **Code surface**             | Dashboard's `AgentBody`, `StateHistoryBar`, `TokenTable`, `ViewportFrame` components                                                                                         |
| **Crew DS composites built** | `AgentBody`, `StateHistoryBar`, `TokenTable`, `ViewportFrame`, `StateBadge` (shared — only built if CREW-119 hasn't landed first)                                            |
| **Notable refactors**        | Drawer Close icon-button → shadcn pattern if a clean shadcn `IconButton` exists; otherwise template inline. `TokenTable` row borders should bind to `border` semantic token. |
| **Visual scope**             | Per the original CREW-117 ticket: drawer composes `TokenTable` + `StateHistoryBar` + grouped Timeline matching the hand-off                                                  |

### Component overlap + ordering

`StateBadge` is shared between the two tickets. Whichever runs first builds it; the second ticket's plan should reference the first's commit/PR for the StateBadge work and skip its own build step.

Both tickets touch different frames, different routes, and (mostly) different components — they're parallel-safe with that one shared-component caveat. If running in parallel via `crew run`: dispatch CREW-119 first (~10 min head start) so StateBadge lands before CREW-117 needs it. Then dispatch CREW-117.

## State colors → Crew DS semantic tokens

The dashboard already has `--color-state-running`, `--color-state-error`, `--color-state-waiting`, `--color-state-pr-open`, `--color-state-finished`, `--color-state-initializing`, `--color-state-idle` tokens preserved in `index.css` from CREW-122's token migration. They're not part of shadcn's semantic vocabulary (which is intentionally generic) but they're real semantic tokens for crew specifically.

**Decision:** add them to Crew DS's `Crew / Semantic Colors` collection as one-time additions during CREW-119 (the first ticket to need them via `StateBadge`). Names mirror the CSS: `state/running`, `state/error`, `state/waiting`, `state/pr-open`, `state/finished`, `state/initializing`, `state/idle`. Each aliases to a matching `tw/colors` primitive in Core (e.g. `state/error` → `tw/colors / red/500` or whichever shade matches the existing OKLCH value in `index.css`).

This is exactly the override-layer pattern Crew DS is for — the architecture explicitly says "thin override layer over Core … one variable collection and zero components" can grow as Crew-specific tokens emerge. State colors are the first such growth.

The user's framing on this decision (2026-05-10): "if we're leaning on the designs becoming the source of truth we should go into that 100%." Resolves any ambiguity about whether state colors should remain code-only or surface in Figma — they surface.

After CREW-119, Crew DS will have ~55 variables (48 shadcn semantic + 7 state). The `Crew / Semantic Colors` row in `design-system.md`'s inventory updates accordingly.

## Build pattern (recipe per Crew DS composite)

For each composite added during a fidelity ticket:

1. **Inspect the dashboard component** — variants, props, size/spacing values, color usage. The CVA config (or className strings if no CVA) defines the Figma component's variant API.
2. **Build the Crew DS Figma component** in the Crew DS file via `use_figma`. Use Crew DS semantic tokens for fills/strokes/text colors; Core's `tw/*` collections for spacing, radii, type. Variant property names + values match the dashboard's CVA exactly (drift becomes a Code Connect lint failure — though we don't publish, the `.figma.tsx` template still encodes the contract).
3. **Author the `.figma.tsx` mapping file** at `packages/dashboard/src/components/<Component>.figma.tsx`. Maps Figma variant properties to dashboard component props using `figma.enum`, `figma.boolean`, `figma.children`. Dashboard composites map to their custom React component; primitives that wrap shadcn map to the shadcn component instead.
4. **Publish the Crew DS update** — user-only step in Figma desktop (Plugin API has no publish equivalent; documented in the design-system.md publish handoff).
5. **Update `docs/plans/design-system.md`** inventory: append a "Component inventory" entry with name, Figma node ID, dashboard counterpart path.

### Build pattern (recipe per Figma frame migration)

1. **Inspect the frame** via `get_metadata` to enumerate fill-bearing nodes + their hardcoded colors.
2. **Group nodes by intended semantic role** — designer judgment. Dim slate at 90% lightness on a card → `card`; same dim slate at 50% lightness → `border`; agent state pill background → `state/running` etc. Resist the temptation to auto-classify by lightness; the same hex can mean different semantic things in different contexts.
3. **Apply bindings via `use_figma`** — `setBoundVariableForPaint` per node. One commit per logical group is overkill; whole frame in one mutation is fine since it's all one ticket's atomic Figma change.
4. **Swap detached primitives for Crew DS instances** — when a `Background+Border+Shadow` frame is acting as a button, replace with a `Button` Crew DS instance. Preserves the visual but makes the Figma file consume the design system instead of mimicking it.
5. **Verify with `get_screenshot`** — visual check that the migration didn't break anything. Compare against the original frame.

## Risks

1. **CVA variant ↔ Figma variant mapping non-trivial for AgentRow.** AgentRow's CVA has multiple variant axes (state, has-action-button, density, etc.). Modeling this faithfully in Figma without combinatorial explosion may need a small design discussion mid-ticket. Mitigation: start with the most common combinations (the actual state-driven variants visible in the design hand-off) and skip combinatorial dead zones.
2. **Color-binding judgment calls block the ticket.** When a hex doesn't obviously map to a semantic token, the agent will need user input. Mitigation: let the agent surface those calls inline rather than guessing; if there are too many, scope-reduce and defer to a follow-on ticket.
3. **Component build order conflicts in parallel runs.** `StateBadge` shared by both tickets. Mitigation called out in "Component overlap + ordering" — dispatch CREW-119 first.
4. **Crew DS Figma file becomes the bottleneck.** All Crew DS additions hit the same file; concurrent agent runs may step on each other's writes. Mitigation: serialize Figma writes to Crew DS even when tickets run in parallel; the agent for CREW-117 should pull Crew DS state before adding components.
5. **Visual fidelity sweeps can scope-creep.** Original CREW-117 + CREW-119 were code-only fidelity. Now they're code + Figma + design system. Mitigation: if either ticket grows beyond ~2 days, pause and decide whether to scope-reduce (do the build-out + frame migration in one ticket, defer the actual fidelity sweep to a fast-follow).

## Out of scope

- **Other 9 frames not covered by these two tickets** (Projects List, Project Page, Register Modal, New Run Modals 1-3, Edit Project Modal, Delete Confirm Modal). Wait for their own fidelity tickets; the design system gets components incrementally as those tickets demand.
- **Remaining Crew DS composites not built in this round.** After CREW-117 + CREW-119 land, Crew DS will have 10 of the 11 composites named in the original Phase 4 spec — only `ErrorFallback` remains. Waits for a ticket that needs it (most likely surfaces during Project Page or settings-style fidelity work).
- **Phase 5** (`design-with-figma` skill v1 + `crew design-sync` reconciliation CLI). Separate brainstorm, separate Epic. The skill skeleton exists from CREW-124's Phase 2 work; refining it benefits from the Phase 4 + fidelity-sweep experience this round produces.
- **Code Connect publish** — already decided skipped (project memory `project_code_connect_skipped`). `.figma.tsx` files keep landing as inert documentation.
- **Bulk migration of remaining 9 Figma frames** outside their fidelity tickets — would re-introduce the CREW-126 problem (color-binding judgment can't be auto-scripted).
- **Wrapping CREW-117 + CREW-119 in a new Epic.** Two-ticket overhead doesn't pay back. Re-evaluate when a third fidelity ticket arrives.
