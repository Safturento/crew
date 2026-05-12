# Button system rollout across Crew DS Composites and Dashboard Screens

**Spec date:** 2026-05-11
**Status:** Approved — in-session execution to follow
**Scope:** Design-only (Figma writes). No application code changes in this Epic.

## Context

A design system gains compounding value when consumer surfaces actually reference its primitives, not when the primitives merely exist in the DS file. Once a Button component lands in the DS, every screen and composite that still ships inline "button-shaped frames" represents leaked design intent — those inline frames won't pick up future Button polish (focus rings, hover states, token tweaks) and they encode the design decision in two places at once.

The signal to do this rollout is: a foundational primitive is now built with explicit token bindings and component properties, and there's a known backlog of *places that should use it but don't yet*. Premature rollouts (before the primitive's variant surface is settled) cause rework; deferred rollouts (months after the primitive ships) cause divergence between the design intent and what shipped.

> **Project-specific:** Crew DS file is `DsA7QuEa2WthDATkksd1Bq`. The Button COMPONENT_SET sits at `204:50` on its Composites page, built with 6 variants × 4 sizes (24 components) plus `Show Leading Icon` BOOLEAN + `Leading Icon` INSTANCE_SWAP properties. See [`project_crew_ds_button_built.md`](../../../.claude/projects/-home-safturento-Repos-crew/memory/project_crew_ds_button_built.md) for the bindings table. The Crew Dashboard Screens file is `9FeJPriqdsdA4n9R5Xsrr8`.

## Options considered

### Property type for the size axis (variant vs BOOLEAN/INSTANCE_SWAP/TEXT)

When extending a DS primitive, every new axis prompts the question "should this be a variant or a property?" The Figma model has four property types: `VARIANT`, `BOOLEAN`, `INSTANCE_SWAP`, `TEXT`. Non-VARIANT types can only modify *pre-existing properties* on an instance (`visible`, `mainComponent`, `characters`). They cannot change geometry, paint bindings, padding, or anything else that requires the component itself to be different.

| Axis | Non-VARIANT property viable? | Why / why not |
|------|------------------------------|---------------|
| `variant` (style) | No | Each variant has different fill/stroke/text-color bindings. No non-VARIANT property type can rebind a fill to a different variable. |
| `size` | No | Each size has different padding, height, font size, item spacing. None of these are reachable from a BOOLEAN / INSTANCE_SWAP / TEXT property. |
| `Show Leading Icon` | Yes — BOOLEAN | Controls one node's `visible`. Already in the set. |
| `Leading Icon` | Yes — INSTANCE_SWAP | Swaps an embedded instance's `mainComponent`. Already in the set. |
| `Label` (button text) | Yes — TEXT | Drives one text node's `characters`. **Added in this Epic.** |

**General rule for future DS components:** VARIANTs are for axes where the underlying component geometry or bindings must differ between values. BOOLEAN / INSTANCE_SWAP / TEXT are for axes where the same component can be modified on the instance. Reach for the non-VARIANT property first; fall back to VARIANT only when geometry or bindings genuinely have to change. See [`feedback_figma_component_properties_over_variants.md`](../../../.claude/projects/-home-safturento-Repos-crew/memory/feedback_figma_component_properties_over_variants.md).

### State-colored solid buttons (Provide input / Inspect)

The dashboard's `AgentRow.tsx` renders two buttons with inline `bg-state-waiting` / `bg-state-error` Tailwind overrides that don't map to any current Button variant. Three options were considered:

1. **Add new variants `warning` + `danger` to Button.** Cleanest DS approach — the state-colored buttons become first-class. Expands set from 24 → 32 variants. Forces an eventual code-side update to remove the inline classNames.
2. **Use per-instance fill overrides on `variant=default`.** Possible in Figma but breaks the DS abstraction — the override is invisible/non-semantic in the variant set view, and propagation of future changes to the default variant won't carry the state-colored uses.
3. **Leave waiting/error action buttons as detached frames for now.** Defers the design decision; introduces a followup ticket later.

**Chosen: option 1.** First-class variants make the state-colored buttons reusable, surface them in the variant picker, and let the canvas documentation enumerate the full button surface. The expansion cost (8 components) is modest given the existing 24.

### Ticket-slicing for the rollout

Three approaches were considered:

1. **By area of work** — 4 sequential phases: Button extension → Composites → Screens projects-view frames → Screens modals.
2. **By Figma file** — 3 phases (Button extension, all Crew DS work, all Screens work). Simpler dependency graph but creates one fat single-threaded ticket for "all Screens work."
3. **Atomic per swap target** — 7+ tiny tickets, max parallelism, more coordination overhead.

**Chosen: option 1, but executed in-session rather than as Jira tickets.** Design work doesn't benefit from autonomous-agent dispatch (the user is the visual judge — needs real-time feedback per phase), so the standard Epic + tickets + `crew run` flow doesn't fit. See [`feedback_design_work_skip_jira_tickets.md`](../../../.claude/projects/-home-safturento-Repos-crew/memory/feedback_design_work_skip_jira_tickets.md).

## Recommendation by context

- **DS primitive maturity** — only roll a primitive through consumers once its variant surface is reasonably stable. If the primitive is still actively being prototyped, rollouts cause churn; the primitive will reshape and every consumer has to follow. The Button's surface settled when the user committed to the 6 → 8 variant set, the 4-size grid, the leading-icon slot, and the semantic-token routing.
- **Design vs code work** — design work in Figma is iterative and visual; reserve the Jira-ticket flow for code work where an autonomous agent can act with full context. For Figma work, brainstorm + spec, then execute in-session.
- **Followup graduation** — followups that this rollout resolves move to `Resolved` in `docs/followups.md` as part of the execution, not as a separate cleanup task.

## Chosen approach

A four-phase in-session execution, each phase a verification checkpoint before moving on. Phase 1 unblocks the others; Phases 2 and 4 can interleave; Phase 3 depends on Phase 2 completing because it consumes the polished Composites.

> **Project-specific:** The four phases described below all happen in two Figma files. Crew DS (`DsA7QuEa2WthDATkksd1Bq`) takes Phases 1 + 2. Crew Dashboard Screens (`9FeJPriqdsdA4n9R5Xsrr8`) takes Phases 3 + 4.

## Implementation outline

### Phase 1 — Extend the Button set

Goal: Button COMPONENT_SET supports the two state-colored action-button styles needed by `AgentRow.tsx`, plus a `Label` text property for ergonomic content swapping.

1. Add two new Crew Semantic Color variables in the `button/` namespace, both aliased to existing `state/` primitives:
   - `button/warning-bg` → `state/waiting`
   - `button/danger-bg` → `state/error`
2. Build 8 new component variants (2 styles × 4 sizes), inserted into the existing variant set. Token bindings:

   | Variant | Fill | Text |
   |---------|------|------|
   | `warning` | `button/warning-bg` | `state/foreground` |
   | `danger` | `button/danger-bg` | `state/foreground` |

   `state/foreground` is the dark-on-bright text color the StateBadge "loud" intensity already uses for the same reason — both new variants are bright-bg-light-fg patterns.
3. Each new variant follows the existing Button anatomy: HORIZONTAL auto-layout, size-appropriate padding/itemSpacing/fontSize, fixed height, hidden `Leading Icon` instance as first child wired to the existing `Show Leading Icon` BOOLEAN + `Leading Icon` INSTANCE_SWAP properties.
4. Add a `Label` TEXT property to the set, default `"Button"`. Bind each of the 32 variants' text node's `characters` to the new property via `componentPropertyReferences`.

Result: 32-variant Button set with **five component properties** in total — two VARIANT axes (`variant`, `size`), one TEXT (`Label`), one BOOLEAN (`Show Leading Icon`), and one INSTANCE_SWAP (`Leading Icon`).

### Phase 2 — Crew DS Composites

Goal: ProjectHeader and AgentRow stop using inline button-shaped frames and instead reference real Button instances.

**ProjectHeader (`82:15`):**

- Delete inline `Button.outline` (id `82:21`); replace with a Button instance: `variant=outline, size=sm, Label="Edit"`.
- Delete inline `Button.destructive` (id `82:23`); replace with a Button instance: `variant=destructive, size=sm, Label="Remove"`.
- The existing `actions-block` auto-layout (id `82:20`) remains; only its children change.

**AgentRow (`169:62`) — fill 7 state variants' `action` slots per `AgentRow.tsx`:**

| State variant | Action buttons (all `size=xs`) |
|---------------|--------------------------------|
| initializing | empty |
| running | empty |
| idle | `variant=outline, Label="Resume"` + `variant=ghost, Label="Finish"` |
| waiting | `variant=warning, Label="Provide input"` |
| pr_open | `variant=outline, Show Leading Icon=true, Leading Icon=lucide/git-pull-request, Label="View PR"` + `variant=ghost, Label="Finish"` (note: the code currently labels this `"View PR ↗"` with an arrow glyph; in Figma the leading icon replaces the arrow's role, so the Label is just `"View PR"`) |
| error | `variant=danger, Label="Inspect"` |
| finished | empty |

Each action slot is the existing 168×24 frame; instances are inserted as auto-layout children with right-justified alignment to match the dashboard's `flex items-center justify-end gap-1.5`. Concretely: set the slot's `primaryAxisAlignItems = 'MAX'`, `counterAxisAlignItems = 'CENTER'`, `itemSpacing = 6`.

### Phase 3 — Screens projects-view frames

Goal: frames `1:2334` (Projects view) and `1:2443` (Project detail) replace their detached primitives with Crew DS instances; buttons flow through transitively via the polished composites.

- **Frame `1:2334`** — swap detached `ProjectRow`-shaped layouts to `ProjectRow` instances; swap detached `CountBadge`-shaped frames to `CountBadge` instances.
- **Frame `1:2443`** — swap the hand-built ProjectHeader-shaped layout to a `ProjectHeader` instance (now containing Button instances via Phase 2); swap the hand-built ProjectConfigBlock-shaped section to a `ProjectConfigBlock` instance.

No direct Button swaps in this phase — the composite-instance substitution carries the buttons transitively.

### Phase 4 — Screens modals

Goal: three ad-hoc modals (`9:2`, `18:2`, `23:2`) use Button instances for their action rows; modal chrome (overlay, header, body) remains as ad-hoc compositions for now.

> **Project-specific:** No Crew DS Modal/Dialog composite exists yet. Creating one is a separate design exercise (modal chrome decisions, sizing, behavior contracts) that exceeds this Epic's scope. The followup `2026-05-09 — Crew Dashboard Screens — rebuild ad-hoc modals + detached primitives as Crew DS instances` is partially resolved by this Epic — the Button-instance portion is covered, the Modal composite portion is not.

For each of the 3 modals:

1. Identify the detached button-shaped frames inside (typically Cancel + Confirm/Delete).
2. Replace each with a Button instance, variant + Label chosen to match the modal's intent (Delete confirmation → `variant=destructive` for the destructive action; New Run confirm → `variant=default`; etc.).
3. Leave the modal's other detached structure (overlay, container, header text, etc.) for the future Modal-composite Epic.

## Verification

Each phase has a visual checkpoint before moving to the next:

| Phase | Verification |
|-------|--------------|
| 1 | Screenshot of the extended 32-variant Button set. Test instance row at `size=default` with one of each new variant (`warning`, `danger`) with `Show Leading Icon=true` to confirm icon color inheritance via text-fill binding. Verify the new `Label` property is editable from the instance properties panel. |
| 2 | Side-by-side: ProjectHeader before/after. AgentRow: all 7 state variants rendered with action slots populated per the table. Spot-check that the `View PR` button's icon is `lucide/git-pull-request` and that the icon color matches the outline text color. |
| 3 | Frame `1:2334` before/after, frame `1:2443` before/after. Confirm composite instances are properly placed and the cascading Button instances render. |
| 4 | Each of the 3 modals rendered, button instances correctly resolve to the chosen variant and Label. Modal chrome (overlay, header) intentionally unchanged. |

Empirical comparison against the running dashboard is **deferred** — see Non-goals.

## Non-goals

- **Updating `button.tsx`** (axis C). The dashboard's runtime appearance will visibly diverge from the new Figma design until a separate Epic addresses it. Specifically: `bg-state-waiting` / `bg-state-error` inline classNames remain in `AgentRow.tsx`; the `button/*` semantic tokens from Phases 1 and prior don't exist in `packages/dashboard/src/index.css` yet; the destructive variant's new tinted-bg-with-stroke styling is Figma-only.
- **Daemon QuickAction endpoint wiring.** The existing followup `2026-05-10 — Wire dashboard QuickAction buttons (Resume / Finish / Inspect / Provide input) to daemon endpoints` is unaffected by this Epic.
- **Creating a Crew DS Modal/Dialog composite.** Phase 4 swaps Button instances inside modals but does not introduce a Modal primitive.
- **Full Screens-file audit.** Frames beyond the four named (`1:2334`, `1:2443`, `9:2`, `18:2`, `23:2`) are out of scope. Anything noticed during execution becomes a fresh `docs/followups.md` entry.
- **Hover / disabled / focus state variants.** The Button set represents idle state only. Hover/disabled live in code (Tailwind state modifiers) or in Figma prototyping, not in additional Button variants.
- **Icon-only Button sizes.** The `icon`, `icon-xs`, `icon-sm`, `icon-lg` square variants from `button.tsx` remain deferred.
- **Trailing icon slot.** Leading icon only.

## Forward path

The natural next Epics, in approximate order:

1. **Axis C — Reconcile `button.tsx` to the new design.** Wire `button/*` tokens into `packages/dashboard/src/index.css`; replace inline `bg-state-waiting` / `bg-state-error` classNames with new `Button` variant values (`warning`, `danger`) mapped through CVA; align the destructive variant's CSS to the tinted-bg-with-stroke styling. This brings the running dashboard back in sync with the Figma design.
2. **Crew DS Modal/Dialog composite.** Define modal chrome (overlay, container, header, body, footer) as a Crew DS composite. Once it exists, the remaining portion of the `2026-05-09` modals followup can resolve fully (the modals stop being ad-hoc compositions and become Modal instances).
3. **Daemon endpoints + dashboard wiring** for the QuickAction buttons (existing followup). Once the buttons are visible in design and present in code, wiring them to real daemon endpoints is the natural next step.
4. **Hover / disabled / focus interactive variants** if the team wants prototypable hover states represented in Figma. Currently these live only in CSS.

## Followups resolved by this Epic

- `2026-05-10 — Polish CREW-131 Projects view composites` — resolved by Phase 2 (ProjectHeader) and Phase 3 (frames `1:2334` + `1:2443`).
- `2026-05-09 — Crew Dashboard Screens — rebuild ad-hoc modals + detached primitives as Crew DS instances` — **partially** resolved by Phase 4 (Button-instance portion) and Phase 3 (detached primitives in projects-view frames). The Modal-composite portion remains open and is captured in Forward path #2.
