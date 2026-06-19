# Agent State Override Control — operator escape hatch from the drawer

**Date:** 2026-06-19
**Status:** Design (brainstormed 2026-06-19) — Epic to be created
**Depends on:** [CREW-252](https://safturento.atlassian.net/browse/CREW-252) (Concrete State Triggers) — this design targets the **post-252 daemon** (reducer-driven state, no transcript inference).

## Problem / purpose

When the daemon gets an agent's state wrong — a mis-detection, a pre-252 stranded agent (CREW-243 stuck in `running`), a missed transition — there is no way to correct it short of a hand-run SQL script inside the daemon container. We want a first-class but **exceptional** operator control: an **escape hatch** to set an agent's state directly from the UI, replacing the throwaway `scripts/fix-agent-state.ts`.

This is explicitly *not* an everyday steering control. Optimize for safety and clarity (confirmation, all transitions allowed, provenance recorded), not for low-friction frequent use.

## Goal

From the agent drawer, an operator can override the agent's state to any of the 8 states, behind a confirmation, with the change applied live and its manual origin recorded for debugging.

## Non-goals

- **Everyday lifecycle steering / quick-action integration.** This is a correction tool, not part of the normal run→pr→finish flow.
- **A "locked" override** that permanently pins state against future automatic events. Overrides are a one-shot nudge; terminal stickiness (below) covers the common case. (YAGNI.)
- **A bespoke "manually set" visual marker in the timeline/drawer.** The `source` provenance lands on the row (queryable, timeline-available) but v1 ships no special UI badge for it. Easy follow-up.
- **Override from the agents-list row.** Drawer only.
- **`waiting` semantics.** `waiting` is offered as a selectable target like any other state, but this design adds no new behavior around it.

## Design

### UX flow (drawer)

1. In the **drawer header**, next to the state `Badge` (`packages/dashboard/src/components/DrawerHeader.tsx:114`), add a small **icon button** (an "override"/sliders affordance). Styled as a secondary action — it should read as exceptional, not primary.
2. Click → a **popover** listing **all 8 states** (`init`, `running`, `pr_open`, `pr_merged`, `error`, `finished`, `idle`, `waiting`), each with its `StateIcon` + label from `STATE_META`. The agent's current state is shown disabled/marked.
3. Select a target → an **`AlertModal`** (existing composite, `packages/dashboard/src/components/AlertModal.tsx`) confirms: *"Override {KEY} state from `{current}` to `{target}`? This manually sets the agent's state and won't be undone automatically."* with Cancel / Override.
4. Confirm → the mutation fires; on success the modal closes and the badge updates **live via the existing `agent.state_changed` SSE** that already drives the drawer + list (no refresh, no bespoke optimistic path).

### Write path (post-252 daemon)

Post-252, every automatic transition flows: durable log → `IngestService.ingestStateEvent` → `reduceState(current, event)` → write `state_transitions` row + update `agentStateCache` + publish `agent.state_changed`. This design factors that write-tail into a shared helper and adds the override as a sibling caller.

- **`applyTransition(key, from, to, ts, source)`** — extracted private `IngestService` helper that inserts the `state_transitions` row (now carrying `source`), updates `agentStateCache`, and publishes the SSE. Both `ingestStateEvent` (passing the event's `source`) and the override call it.
- **`IngestService.recordStateOverride(key, toState)`** — reads the current state (→ `from`), then calls `applyTransition(key, from, toState, now, 'override')`. It does **not** read from or write to the durable file-log: an override is a synchronous operator command against a live daemon, not a producer lifecycle fact, so it has no durability gap to bridge and does not belong in the `STATE_EVENT_KINDS` vocabulary.
- **Route:** `POST /api/agents/:key/state`, body `{ state }` validated by Zod against the 8-value `AgentState` enum. Thin route → `recordStateOverride` → returns the resulting agent/state. `404` (`NotFoundError`) for an unknown key; `400` for an invalid state; `200` no-op when already in the target state.

### Override semantics — the load-bearing part

- **The override bypasses `reduceState` and its sticky guards.** That is the entire point of an escape hatch: it is the *one* path that can move an agent **out of a terminal state** (`finished`/`pr_merged`) — e.g. a wrongly-merged badge back to `pr_open`. Automatic events cannot (the reducer's stickiness blocks them); the operator can.
- **Coherence with the reducer:** because `recordStateOverride` updates `agentStateCache`, a subsequent automatic event reduces from the **overridden** state — it cannot silently undo the override from a stale cache.
- **Nudge, not lock:** overriding a *live* agent to a non-terminal state (e.g. `running`) leaves it open to subsequent real events (a later `pr_created` still moves it to `pr_open`). Terminal overrides naturally persist. For the escape-hatch use case (usually agents emitting no further events) this distinction rarely matters.

### Provenance — `source` on `state_transitions`

Add a nullable `source TEXT` column to `state_transitions`, stamped on **every** transition (not just overrides), so an agent's transition history shows exactly what drove each hop:

- `ingestStateEvent` stamps the originating `StateEvent.source` (`hook-pr-create`, `cli-run`, `cli-fixpr`, `cli-finish`, `runner-exit`).
- `recordStateOverride` stamps `override`.
- `PrPoller`'s `pr_open → pr_merged` write routes through `applyTransition` with `poller`; the startup-failure `recordError` path stamps `startup-failure`.
- Legacy / backfilled rows: `null`.

Kept as a free-form documented `TEXT` (not a strict CHECK) so new sources don't require a migration. Debug-only in v1 — surfaced nowhere new in the UI yet, but available to the timeline/history and to direct queries.

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| migration `00NN_state_transitions_source` | add `source` column | — |
| `IngestService.applyTransition` (extracted) | the one place a transition row is written + cached + published | migration |
| `IngestService.recordStateOverride` | operator override → `applyTransition(..., 'override')`, bypassing the reducer | applyTransition |
| `POST /api/agents/:key/state` route | validate + delegate | recordStateOverride |
| `bruno/endpoints/agents/post-state.bru` | route coverage | route |
| `StateOverrideButton` + popover (drawer) | the affordance + state list | route (via mutation) |
| override mutation hook | POST + invalidate/rely-on-SSE | TanStack Query |
| `AlertModal` confirm (reuse) | the safety gate | — |

## Error handling

- Unknown agent → `404`; invalid state → `400` (Zod). The mutation surfaces a toast/error on non-2xx; the modal stays open on failure so the operator can retry.
- No-op (already in target) → `200`, modal closes, nothing written.
- SSE is the update channel; if SSE is briefly disconnected the next list/drawer fetch reflects the DB row regardless.

## Testing

- **Daemon unit:** `recordStateOverride` writes a row with `source='override'`, updates the cache, publishes SSE; **can move out of `finished`/`pr_merged`** (bypasses stickiness); `applyTransition` stamps `source` for both callers; route returns 404 / 400 / 200-no-op correctly.
- **Bruno:** `post-state` happy path + 404.
- **Dashboard:** the button renders in the drawer header; popover lists 8 states with current disabled; selecting → AlertModal → confirm fires the mutation; cancel does nothing.
- **Visual fidelity:** the drawer-header change runs the `visual-fidelity-check` gate (componentDir touched).

## Decomposition (sketch — refined in writing-plans)

Small Epic, two children:

1. **Daemon** — `source` migration, `applyTransition` extraction (retrofit `ingestStateEvent` + `PrPoller` + `recordError` to pass `source`), `recordStateOverride`, the route, the Bruno endpoint.
2. **Dashboard** — the override button + popover, the AlertModal confirm, the mutation hook, the visual-fidelity gate.

Both depend on CREW-252 being complete. (2) depends on (1) for the route contract.
