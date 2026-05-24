# CREW-196 — Starting section in groupEventsByState Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `groupEventsByState` prepends a leading section for the initial state (the `from` of the first transition, fallback `'initializing'`) when transitions exist. Pre-transition events get correctly attributed to the leading section.

**Architecture:** Pure presentation fix. One function in `Timeline/groupEventsByState.ts` + matching tests.

**Tech Stack:** TypeScript + vitest. No new deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-196-starting-section-design.md`](../specs/2026-05-23-crew-196-starting-section-design.md)
**Ticket:** [CREW-196](https://safturento.atlassian.net/browse/CREW-196) (Epic [CREW-189](https://safturento.atlassian.net/browse/CREW-189))

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/dashboard/src/components/Timeline/groupEventsByState.ts` | Prepend leading section |
| Modify | `packages/dashboard/src/components/Timeline/groupEventsByState.test.ts` | New cases + update count-asserting cases |
| Modify (maybe) | `packages/dashboard/src/components/Timeline/Timeline.test.tsx` | If any test asserts section count, update |

---

## Task 1: Prepend the leading section

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/groupEventsByState.ts`
- Modify: `packages/dashboard/src/components/Timeline/groupEventsByState.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `groupEventsByState.test.ts` (six new cases — see spec § Testing for the full block). Run the suite first to confirm the existing tests pass.

```bash
npm run test:run --workspace=crew-dashboard -- groupEventsByState
```

- [ ] **Step 2: Run the new tests to verify fail**

```bash
npm run test:run --workspace=crew-dashboard -- groupEventsByState
```

Expected: FAIL — the new "prepends leading section" assertions are not satisfied; current code produces N sections from N transitions.

- [ ] **Step 3: Apply the fix**

Replace the body of `groupEventsByState` per the spec snippet. Key points:
- Keep the `transitions.length === 0` branch unchanged.
- Build leading section: `state = transitionToAgentState(first.from ?? 'initializing')`, `startedAt = earliest event ts or first.ts`, `endedAt = first.ts`.
- Spread leading section ahead of the existing transition-derived sections.
- Event assignment loop is unchanged (the `findIndex` already handles the new leading section because its `startedAt` ≤ events' ts and its `endedAt` > pre-transition events' ts).

Update the import line:

```ts
import type { AgentState, StateTransition, TranscriptEvent, TransitionState } from '../../data/types.js';
```

(adds `TransitionState` for the fallback annotation).

- [ ] **Step 4: Re-run tests**

```bash
npm run test:run --workspace=crew-dashboard -- groupEventsByState
```

Expected: PASS (new + existing).

- [ ] **Step 5: Run any consumer tests that might be off-by-one**

```bash
npm run test:run --workspace=crew-dashboard -- Timeline.test
```

If any test asserts a section count from the transition count (e.g. `expect(sections).toHaveLength(transitions.length)`), update it to `transitions.length + 1`.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/Timeline/groupEventsByState.ts \
        packages/dashboard/src/components/Timeline/groupEventsByState.test.ts \
        packages/dashboard/src/components/Timeline/Timeline.test.tsx  # if touched
git commit -m "fix(dashboard): groupEventsByState prepends leading section for initial state (CREW-196)

N transitions now yield N+1 sections — the leading one represents the
agent's initial state (the \`from\` of the first transition, fallback
\`initializing\`). Pre-transition events that previously got folded into
the post-transition section now correctly land in the leading section.

User-visible: every dispatched agent's drawer Timeline now opens with
a 'Starting' section instead of mis-labeling that period as 'Running'."
```

---

## Task 2: Visual smoke + verification

- [ ] `npm run lint` — green
- [ ] `npm run typecheck` — green
- [ ] `npm run test:run --workspace=crew-dashboard` — green
- [ ] Visual smoke: navigate to any agent with a non-trivial history (e.g. CREW-102 fixture, or any active dispatch in initializing+running). Drawer timeline should now open with a "Starting" (initializing) section ahead of any "Running" sections. CREW-194's minimap should show the corresponding state-color segment at the top.
- [ ] `visual-fidelity-check` skill (optional, since change is structural-data not visual). If run, expect one extra section in the minimap relative to the prior baseline — expected, not a regression.

PR title: `fix(dashboard): groupEventsByState prepends leading section (CREW-196)`
