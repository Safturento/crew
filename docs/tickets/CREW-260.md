# CREW-260 — Dashboard: drawer state-override control

Jira: https://safturento.atlassian.net/browse/CREW-260

Ticket 2 of the Agent State Override Control epic (CREW-258). Plan:
`docs/superpowers/plans/2026-06-19-state-override-control.md` (Tasks 2.1–2.2). The daemon
side (route + `source` provenance) landed as Ticket 1 / CREW-259.

## Goal

An operator can correct a wrong/stranded agent state from the drawer: an override icon button
beside the state badge → popover of all 8 states (current disabled) → AlertModal confirm →
`POST /api/agents/:key/state`. The badge updates live over the existing `agent.state_changed` SSE.

## Relevant files

- `packages/dashboard/src/data/state-meta.ts` — added `agentStateToTransitionState` (the only
  divergence is `initializing → init`; the daemon route speaks the `TransitionState` vocabulary).
- `packages/dashboard/src/data/HttpDaemonClient.ts` — `overrideState(key, state)` POSTs the mapped
  state; 404 → `AgentNotFoundError`, mirroring `refreshPrStatus`.
- `packages/dashboard/src/data/queries.ts` — `useOverrideState(key)` mutation, invalidating
  agent + state-history + agents (mirrors `useRefreshPrStatus`).
- `packages/dashboard/src/components/StateOverrideControl.tsx` — the control (ghost icon Button +
  `ui/popover` + `AlertModal`).
- `packages/dashboard/src/components/DrawerHeader.tsx` — mounts the control next to the state `Badge`.

## Decisions

- **Map `AgentState → TransitionState` in the client, not the component.** The route enum is the
  daemon's `TransitionState` (`init`), the dashboard models `AgentState` (`initializing`). The
  boundary (the HTTP client) is the right place to translate, so the component stays in dashboard
  vocabulary. Only `initializing → init` differs.
- **Follow the existing singleton-hook pattern, not prop injection.** The plan sketched a `client`
  prop; the codebase convention (mirrored from `useRefreshPrStatus`) is a `useOverrideState` hook over
  `defaultClient`, tested via `vi.mock('../data/queries.js')`. Used that for consistency.
- **AlertModal action color is `waiting` (amber), not the default `error` (red).** An override is a
  deliberate-but-recoverable correction, not a destructive delete — amber/caution reads truer. Same
  reasoning `FixPrModal` used to pick `running` over `error`.
- **No `.figma.tsx` for `StateOverrideControl`.** It's net-new UI the Figma design never included; a
  figma-less feature control composing designed primitives (like `FixPrModal`/`Drawer`). Recorded in
  `.agents/design-system.md` and `docs/visual-fidelity-reports/CREW-260.md`.

## Notes

Verified end-to-end in the browser: override drove a real `Running → Finished` flip with the badge
updating over SSE and a new timeline section appended; restored the fixture afterward. Visual-fidelity
gate, bruno smoke (no route change this ticket — `post-state.bru` shipped with CREW-259), e2e
(`state-override.spec.ts`), unit tests, typecheck, lint, format all green.
