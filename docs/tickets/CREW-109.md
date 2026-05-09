# CREW-109 — Playwright E2E spec for the agent drawer

Jira: https://safturento.atlassian.net/browse/CREW-109

## Goal

Five-scenario Playwright spec at
`packages/dashboard/tests/e2e/agent-drawer.spec.ts` covering the
drawer's golden path, plus a window-level test hook
(`window.__crewTestInjectEvent`) on `CrewEventStream` so a synthetic SSE
event flips the state badge in the badge-pulse scenario.

## Relevant files

- `packages/dashboard/tests/e2e/agent-drawer.spec.ts` — adds the five
  AC scenarios to the existing drawer-behavior file (`page.route` mocks
  the timeline endpoint with a two-event fixture spanning the
  `tool-calls` and `assistant-prose` chip groups).
- `packages/dashboard/src/data/eventStream.ts` —
  `CrewEventStream.exposeTestInjector()` attaches
  `window.__crewTestInjectEvent(name, data)`. Fans out through the same
  handler map real SSE messages use.
- `packages/dashboard/src/main.tsx` — calls `exposeTestInjector()` only
  under `import.meta.env.DEV`; Vite tree-shakes the call out of prod
  builds.
- `packages/dashboard/src/components/AgentBody.tsx` — replaces the
  `agent-body-placeholder` div with `<Timeline>` (via the existing
  `useTimeline` hook), wraps the body in `data-testid="agent-body"`.
- `packages/dashboard/src/routes/AgentDrawer.test.tsx`,
  `packages/dashboard/src/routes/AgentFullPage.test.tsx` — mock
  `getTimeline` and assert the timeline renders inside the body slot
  instead of the now-removed placeholder.

## Decisions

- **`page.route` mocks for the timeline endpoint, not seeded JSONL.**
  Seeded agents have DB rows but no on-disk transcript; `TimelineService`
  resolves to `null` for them. Mocking at the browser-network boundary
  keeps the e2e deterministic without standing up filesystem fixtures
  inside the daemon container.
- **Wired `<Timeline>` into `AgentBody`, not `<StateHistoryBar>` or
  `<TokenTable>`.** Slice 1c built all three as standalone components
  (CREW-104) but never authored a composition task. CREW-109's ACs
  require timeline event-cards to exist in the DOM, so wiring Timeline
  is in scope; the other two are tracked as a followup
  (`docs/followups.md`).
- **`window.__crewTestInjectEvent` lives on the singleton, not on the
  test harness.** Real SSE handlers register against the same handler
  map; injecting through the dispatcher means the test hook exercises
  the same code path real events do.

## Notes

Verified:

- `npm run lint` — clean.
- `npm run typecheck` (all workspaces) — clean.
- `npm run test:run` (all workspaces) — 235 dashboard + 103 shared (and
  daemon/cli, both unchanged) — pass.
- `CREW_BRUNO_ENV=crew-crew-109 npm run bruno:smoke` — 8/8 requests pass.
- `npm run test:e2e` — 14/14 specs pass (5 new + 5 existing drawer-
  behavior + 4 dashboard shell).
- Manual: opened
  `http://localhost:32198/#/agent/CREW-101`, observed the drawer with
  Timeline empty state (no JSONL fixture for that agent), then
  confirmed the live badge flips from "Running" → "PR open" after
  invoking `window.__crewTestInjectEvent('agent.state_changed', …)` in
  the devtools console.
