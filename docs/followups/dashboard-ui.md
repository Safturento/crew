# Followups — Dashboard UI

> Part of the crew followups queue. Index + format: [`../followups.md`](../followups.md). Entry template, ticketing protocol, and the Active/Resolved/Abandoned lifecycle live in the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

(entries below, newest at top)


## 2026-07-02 — `useArchiveFailedStart` / `acknowledgeRun` orphaned by the Runner-page retirement

**What:** The Runner page's "Archive" control on the Failed-to-start section was
the sole consumer of `useArchiveFailedStart` (`data/runnerControls.ts`) and, via
it, the `acknowledgeRun` client method + `POST /api/runs/:key/acknowledge`
daemon route. CREW-312 deleted that section, so `useArchiveFailedStart` is now
referenced only by its own test, and `acknowledgeRun` is unreferenced on the
dashboard. Failed-start runs now surface as `error`-state agents in the grid
(Restart / Inspect), with no Archive verb anywhere in the UI.

**Why noticed:** CREW-312 (Runner rework F) — retiring the Runner page. Left the
hook + client method in place rather than expand the ticket's scope (it was
scoped to deleting the dead *reads*; `acknowledgeRun` is a write backed by a
live daemon endpoint). Flagged so the decommission is deliberate, not forgotten.

**Anchors:** `packages/dashboard/src/data/runnerControls.ts`
(`useArchiveFailedStart`), `packages/dashboard/src/data/runnerControls.test.tsx`,
`acknowledgeRun` on `DaemonClient`/`HttpDaemonClient`/`MockDaemonClient`, the
daemon `POST /api/runs/:key/acknowledge` route + its Bruno endpoint. Note:
`useArchiveFailedStart.onSuccess` now invalidates the `['runner-page']` query
key, which no longer exists after this PR removed `useRunnerPage` — a harmless
silent no-op that further confirms the hook is orphaned.

**What's been considered:** Two paths — (a) fully decommission: drop the hook,
the client method across all three surfaces + tests, and (if nothing else needs
it) the daemon route + Bruno endpoint; or (b) re-surface an Archive/acknowledge
affordance on `error` rows or in the supervisor drawer, if muting stale
failed-start noise is still wanted. Decide which before removing — the daemon
route may have non-dashboard callers.

**Shape of work:** Small — either a delete-only sweep across dashboard (+ maybe
daemon route/Bruno) or a tiny UI addition. Confirm no other `acknowledgeRun`
callers first.

**Open questions:** Is acknowledging failed-start rows still a wanted capability,
or is the grid's error-state surfacing sufficient?


## 2026-07-02 — Drawer-family e2e specs broken by Timeline live-mode auto-scroll

**What:** Three drawer e2e specs fail deterministically against the live worktree
stack — `agent-drawer.spec.ts:77` (Open as page: strict-mode violation, two
`drawer-header`s), `agent-drawer.spec.ts:118` (empty-filter: the
`open timeline filters` click times out), and `drawer-sticky-headers.spec.ts:86`
(condensed header present at rest, expected absent). Root cause for the latter
two: `Timeline.tsx`'s live-mode auto-scroll (`el.scrollTop = el.scrollHeight`
when `filteredEvents.length` grows under `liveMode`) fires on the *first* data
load of a `running` agent (ref seeds 0 → N), so the drawer opens pre-scrolled —
observed `scrollTop: 134` at rest on `/#/agent/CREW-101`. The condensed header
is then already mounted and the toolbar sits under it. The specs predate the
live-tail behavior. The `:77` dual-header case needs its own diagnosis (drawer
content lingering across the route change to the full page).

**Why noticed:** CREW-311's e2e verification. Confirmed pre-existing by
re-running the specs with `packages/dashboard/src` checked out at `origin/main`
(fbe2e1d) — same failures. Not a CREW-311 regression.

**Anchors:** `packages/dashboard/src/components/Timeline/Timeline.tsx:148-157`
(auto-scroll effect), `packages/dashboard/tests/e2e/agent-drawer.spec.ts`,
`packages/dashboard/tests/e2e/drawer-sticky-headers.spec.ts`, CREW-311 PR
description (Test Plan section).

**What's been considered:** (a) reset scroll in the specs before asserting —
papers over a possibly-unintended UX (should a *drawer open* really start at
the bottom?); (b) suppress the auto-scroll on the initial load (only tail on
*subsequent* growth) — likely the real fix if the design intent is "open at
top, tail once you're following"; (c) decide the design intent first, then fix
whichever side is wrong.

**Shape of work:** small — one guard in `Timeline.tsx` (skip the scroll when
`prev === 0`/first data) or spec updates; plus a separate look at the `:77`
dual-header strict violation.

**Open questions:** Is open-at-bottom intended for live agents? Does the `:77`
failure share the same root cause or is it a Radix presence/animation issue?


## 2026-06-25 — Supervisor Stop/Restart effect lags up to one action long-poll cycle

**What:** CREW-293 wired the SupervisorCard Stop/Restart to the `runner_commands` reverse-queue. The command is _applied_ + reported quickly (the command-drain runs on its own ~2s timer), but the actual effect — the worker process exiting so the supervisor stops (exit 0) or respawns (non-zero) — is gated on the worker's **main loop** noticing the abort, which only happens after the in-flight `claimPendingAction` long-poll returns (up to a full poll cycle, ~25s). So the dashboard can show the command `applied` well before the supervisor actually goes down / comes back. Functionally correct, just laggy.

**Why noticed:** CREW-293 self-review (code-reviewer subagent). The `supervisorControl` boundary calls `controller.abort()`, but `runLoop`'s `while (!signal.aborted)` re-checks only between `runOnce` iterations, and `claimPendingAction(timeoutMs)` isn't passed the abort signal. This is **pre-existing** loop behavior — `crew runner stop` (SIGTERM → same abort) lags identically — surfaced now because the dashboard makes it operator-visible.

**Anchors:** `packages/cli/src/lib/runner/loop.ts` (`runOnce` long-poll, `runLoop` while-loop, `startCommandDrain` 2s timer); `packages/cli/src/commands/runner.ts` (`workerAction` abort + exit code); `packages/cli/src/lib/daemon-client` (`claimPendingAction` — would need to accept an `AbortSignal`).

**Shape of work:** small — thread the worker's `AbortSignal` into `claimPendingAction` (abort the fetch) so an aborted loop unwinds immediately instead of waiting out the long-poll. Touches the daemon client + `runOnce`. Verify a queued `supervisor_stop` brings the runner down within ~2s.

**Open questions:** does aborting the long-poll fetch race with a just-claimed action (claimed server-side but never received client-side → orphan)? May need the claim to be idempotent/re-pollable, or only abort between polls.

## 2026-06-19 — Runner page: Failed-to-start / Queued / Recently-ended need read endpoints; supervisor controls unwired

**What:** The Runner page (CREW-245) ships with three of its six sections live-wired to the merged daemon (Supervisor + Live processes from `GET /api/runner/status`; Unmanaged derived client-side as running-agents-minus-snapshot). The other three — **Failed to start**, **Queued actions**, **Recently ended** — have their components fully built + fixture-tested, but `useRunnerPageData` feeds them `[]` because the merged daemon has no read endpoint for them: failed-start runs aren't "agents" (different `status` enum), `GET /api/actions/pending` _claims_ rows (can't list), and there's no recently-ended-runs query. So in production those sections stay hidden / show their empty state. Separately, the **SupervisorCard Restart/Stop/Start** buttons render (to match Figma) but are disabled — supervisor lifecycle is a `crew runner` CLI op with no daemon control route.

**Why noticed:** CREW-245 scope decision (Task 8 of Epic CREW-235). The plan scoped Task 8 dashboard-only consuming `/api/runner/status`, and the dispatch run couldn't add+serve new daemon routes (the live stack runs the merged binary). The spec repeatedly defers the richer per-entity surfaces to **CREW-249** (per-entity log drawers), which reads the same captured-per-run data. Full context: `docs/tickets/CREW-245.md` (Decisions / Ruled out) + the spec `docs/superpowers/specs/2026-06-16-crew-235-runner-control-design.md`.

**Anchors:** `packages/dashboard/src/components/runner/useRunnerPageData.ts` (the `failedToStart: []`, `queued: []`, `recentlyEnded: []` stubs + the doc comment); `packages/dashboard/src/components/runner/{FailedToStartSection,QueuedActions,RecentlyEnded}.tsx` (the built-but-unfed components); `packages/dashboard/src/components/runner/SupervisorCard.tsx` (the `onRestart`/`onStop`/`onStart` optional handlers — pass them once a control route exists). Daemon side: `packages/daemon/src/services/RunFailureService.ts` (already stores failed-start rows + `acknowledge`), `packages/daemon/src/routes/runs.ts`, `packages/daemon/src/routes/actions.ts`.

**What's been considered:** A single daemon read endpoint (e.g. `GET /api/runner/page` or `GET /api/runner/recent-runs` + a read-only `GET /api/actions`) returning `{ failedToStart, queued, recentlyEnded }` from `runs` + `action_requests`, then a one-line swap of each `[]` in `useRunnerPageData` for the fetched data. Likely folds into **CREW-249** rather than a standalone ticket (same per-run captured data, same drawer destination). Supervisor controls would need new `crew runner` control routes (restart/stop/start) — a separate, larger concern (the daemon is containerized and can't signal the host runner directly; it would route through the same `runner_commands` reverse-queue or a new mechanism).

**Shape of work:** likely one read-endpoint ticket (or fold into CREW-249) for the three sections; a separate, larger one for supervisor lifecycle control from the UI. Both gated on whether CREW-249 absorbs them.

**Open questions:** Should the three history sections wait for CREW-249's per-entity surfaces, or get a thin interim read endpoint sooner? Is UI-driven supervisor restart/stop wanted at all, or is the `crew runner` CLI the intended control surface (in which case the buttons should be dropped, not wired)?

## 2026-06-08 — Filters popover open inside the agent drawer makes the drawer click-dead (trigger/outside click dismisses the drawer)

**What:** The Filters popover is already `modal` (`Filters.tsx:62`, intentional — see `.agents/design-system.md` §Drawer), which is correct for the click-outside case. But modality has a side effect: while the popover is open, Radix's `react-dismissable-layer` sets inline `pointer-events: none` on `document.body` **and on the drawer's `Dialog.Content`** (only the top layer — the popover content — gets `pointer-events: auto`). So the Filters **trigger**, which lives inside the drawer content, also computes `pointer-events: none` while its own popover is open — `document.elementFromPoint` at the trigger's centre returns the `drawer-backdrop`, not the trigger. The whole drawer body (e.g. the empty-state "Show all" CTA) is likewise click-dead until the popover closes. A real user's physical click at the trigger still reaches the backdrop, and the **modal** popover absorbs that as an outside-pointerdown — closing the popover while leaving the drawer open (verified: a single synthesized backdrop click took `dialogCount` 2→1 with the drawer header still mounted). So real-user impact is limited; the sharp edge is that you can't "click the trigger again" as a toggle-to-close, and automated drivers can't either.

**Why noticed:** CREW-237 (adopt `tw-animate-css`). The e2e test `agent-drawer.spec.ts > "empty filter state — show empty copy + Show all link, then recover"` fails in the crew worktree container: it opens Filters, toggles every category off, then `click()`s the trigger to close the popover. Playwright's strict actionability refuses to click the trigger (it's `pointer-events: none`; the backdrop "intercepts pointer events"), so it retries for 30s and the test times out — and the captured page snapshot shows the drawer dismissed by then. Confirmed **pre-existing and animation-independent**: reproduces identically against the pre-CREW-237 source (popover animations inert, custom drawer keyframes), because the `pointer-events: none` is set by Radix JS, not by any CSS animation class. It is timing-sensitive — a probe-delayed reproduction of the same steps keeps the drawer open and passes — which is why it slips through in faster/slower environments and hadn't been caught (e2e is not run in CI; only `npm run test:e2e` locally / under crew).

**Anchors:** `packages/dashboard/src/components/Timeline/Filters.tsx:62` (`<Popover ... modal>` + the load-bearing comment); `packages/dashboard/src/components/Drawer.tsx` (modal `Dialog.Content` + `drawer-backdrop` overlay); `packages/dashboard/tests/e2e/agent-drawer.spec.ts:118` (the failing test); `radix-ui` `react-dismissable-layer` branch-pointer-events logic. Repro: open `#/agent/<key>`, open Filters, then in devtools `document.elementFromPoint(<trigger cx>, <trigger cy>)` → the `drawer-backdrop` element.

**What's been considered:** The popover is already modal, so "make it modal" is **not** the fix (that's the current, correct state). Directions: (a) **test-side** — close the popover deterministically without depending on the trigger being actionable: press `Escape` (Radix routes Escape to the top layer = the popover, not the drawer — needs verifying it doesn't also close the drawer) or click a neutral in-popover dismiss affordance, then assert the empty state; (b) **product** — if "click the trigger again to close" is a UX we want to guarantee, the trigger needs to stay interactive while its own modal popover is open (Radix doesn't exempt the anchor for modal popovers by default — would need an `onPointerDownOutside` carve-out or rendering the trigger outside the dimmed branch). (a) is low-risk and removes the flake; (b) is the real-affordance fix and broader.

**Shape of work:** small — likely just hardening the `agent-drawer.spec.ts` empty-state test to close the popover via a Playwright-actionable path (option a), optionally plus a small trigger-interactivity affordance (option b). Worth a dedicated ticket; out of scope for the animation ticket.

**Open questions:** Does `Escape` inside the open Filters popover close only the popover or also the drawer (Radix top-layer routing)? Is "click the trigger again to close" a UX guarantee we want (option b), or is Escape / outside-click sufficient? Do other in-drawer popovers/menus (if any) share the same trigger-not-clickable-while-open edge?

## 2026-06-05 — Drawer `liveMode` + section-collapse leak across an in-place agent switch

**What:** `AgentDrawer` is rendered without a React `key` (`packages/dashboard/src/App.tsx:130`: `{route.kind === 'agent-drawer' && <AgentDrawer agentKey={route.key} />}`), so navigating from one agent route to another (browser back/forward between two `#/agent/:key` URLs, or any future "next agent" affordance) reuses the same `Timeline` instance — the `agentKey` prop changes but the component is not remounted. CREW-232 fixed this for the persisted filter + search state by re-seeding during render, but `liveMode` (seeded from `agentState` per the `isLiveByDefault` default) and the section-collapse `Record` still keep the _previous_ agent's values across such a switch. So back/forward between a finished agent and a running one can show the wrong live-mode default, and collapsed sections from agent A bleed into agent B.

**Why noticed:** 2026-06-05 CREW-232 implementation. Verifying filter persistence in the running app via SPA hash navigation (not `page.goto`, which full-reloads and hides the reuse) surfaced that the unkeyed drawer reuses `Timeline`. The filter/search half was in scope and got the render-time re-seed; `liveMode`/collapse were left as-is because they aren't persisted and the dominant UX path (close drawer → `#/` unmounts → open another) remounts cleanly. The gap only bites the direct agent→agent navigation paths.

**Anchors:** `packages/dashboard/src/App.tsx:130` (the unkeyed `<AgentDrawer>`); `packages/dashboard/src/components/Timeline/Timeline.tsx` (the `seededFor !== agentKey` render-time re-seed added by CREW-232 — the pattern to extend; `liveMode` `useState(() => isLiveByDefault(agentState))` and `collapsed` `useState<Record<string, boolean>>({})` are the two that still don't reset).

**What's been considered:** Two clean options — (1) add `key={route.key}` to `<AgentDrawer>` in `App.tsx`, remounting the whole drawer subtree per agent so _all_ state resets for free (simplest; minor cost is a re-fetch/animation on each agent→agent nav, which is arguably desirable); or (2) extend the in-`Timeline` render-time re-seed to also reset `liveMode` and `collapsed` when `agentKey` changes (keeps the fix local, no remount). Option 1 is the holistic fix and also covers any other latent reuse-staleness in the drawer subtree; option 2 is narrower. Either is small.

**Shape of work:** XS — one-line `key` add, or a few lines extending the existing re-seed block, plus a Timeline rerender-without-remount test for `liveMode`/collapse (mirror the CREW-232 `re-seeds filters when the agent key changes without a remount` test).

## 2026-06-03 — CREW-137 modal composites unverified until wired into a screen

**What:** CREW-137 added the modal-family composites (Modal, AlertModal, ModalSelectionRow, Stepper) but wired none into a live screen, so their visual fidelity could not be verified at merge — the PR shipped on component-build correctness alone. When the first real consumer lands (e.g. the New Run modal), verify each composite against its Figma reference and adjust the composite where it diverges.

**Why noticed:** Merging Batch B (CREW-137). The modal composites have no caller site yet, so visual fidelity is unverifiable until one exists — flagged at merge time as deferred verification.

**Anchors:** the CREW-137 composites in `packages/dashboard/src/components/` (Modal, AlertModal, ModalSelectionRow, Stepper) + their `.figma.tsx`; CREW-137; the deferred modal screens (New Run / Register / Edit / Delete) marked out-of-scope in Epic CREW-134. Related: the 2026-05-09 "3 remaining ad-hoc modal frames need DS Modal swap" followup.

**What's been considered:** Visual fidelity here is deferred-by-construction (build-then-wire). The first wiring ticket (most likely the New Run modal) should bake in a `visual-fidelity-check` pass over the modal + any composite it uses, treating divergences as adjust-the-composite work rather than caller-only fixes.

**Shape of work:** No standalone ticket — fold a "verify modal composites against Figma" acceptance criterion into whichever ticket first wires a modal into a screen.

**Open questions:** Which screen wires the first modal — the New Run flow? That ticket owns the verification.

## 2026-05-22 — `${APP_URL}` template literal in DrawerHeader docker pill (backend bug)

**What:** The DrawerHeader's docker pill renders the literal string `${APP_URL}` for some agents in production (DOM `href` becomes `https://crew.tail82463c.ts.net/$%7BAPP_URL%7D` — the `${…}` is URL-encoded by the browser). The dashboard is showing exactly what the daemon returns; the bug is in `deriveAppUrl` in `packages/shared/src/config/derive-urls.ts` returning the project-config template verbatim without expanding `${CREW_VITE_PORT}` (or whichever env var the project's `app_url` template references) against the worktree's `env.toml`.

**Why noticed:** PR #262 review of CREW-185 (drawer visual fidelity). Reviewer caught it on the live production drawer using chrome MCP. Out of scope for CREW-185 because the ticket is "Frontend-only" and explicitly says "If a finding requires a new data field, surface as out-of-scope + file a followup" — the fix is in `shared/`, not the dashboard.

**Anchors:**

- `packages/shared/src/config/derive-urls.ts` — `deriveAppUrl` (where template expansion should happen)
- `packages/dashboard/src/components/DrawerHeader.tsx:101–113` — the consumer pill that surfaces whatever string it gets
- Project config `app_url` field — typically `"http://localhost:${CREW_VITE_PORT}"` or similar
- Worktree `env.toml` — where `CREW_VITE_PORT` (and similar per-worktree vars) get materialized
- CREW-185 PR #262 review comment (2026-05-23)

**What's been considered:**

- Expand against `process.env` directly in `deriveAppUrl` — simple but conflates daemon-process env with worktree env.
- Pass the worktree's resolved env into `deriveAppUrl` as a second arg — cleaner, matches how the rest of `shared/config/` handles per-worktree state.
- Render a friendlier error in the dashboard (e.g. "app URL not configured for this worktree") rather than the literal string — defensive, but masks the upstream bug.

**Shape of work:** Small. Locate `deriveAppUrl`, thread the worktree's resolved env vars in, substitute `${VAR}` tokens before returning. Add a unit test for the template-expansion path. ~30 min including tests.

**Open questions:**

- Should expansion fail loudly (throw) or silently (leave the token unexpanded) when a referenced var isn't set? Loud is better for catching misconfigured worktrees early.
- Is `${VAR}` the only template syntax to support, or also `$VAR` / `{{ VAR }}`? Existing `env.toml` usage will dictate this.

## 2026-05-22 — Layer-1 RunMetrics widget loses its drawer home in the redesign — find it a new one

**Ticket:** [CREW-209](https://safturento.atlassian.net/browse/CREW-209) — parked in Backlog (needs planning); folds in the `parity_violations` efficacy check.

**What:** The 2026-05-21 drawer redesign (Figma `9FeJPriqdsdA4n9R5Xsrr8`, AgentBody `220:246`) does not include `RunMetrics` anywhere. The widget renders Layer-1 cohort metrics (`docLoadCoveragePct`, `cleanlinessPass`, `prClaimInputTokens`, `parityViolations`) and currently sits between AgentHeader and Timeline in `AgentBody.tsx:45`. The drawer code-migration plan (this session, 2026-05-22) drops it from drawer + AgentPage entirely. The component itself stays — `RunMetrics.tsx` is solid — but with no caller it'll be dead code until placed somewhere.

**Why noticed:** Drawer code-migration brainstorm 2026-05-22. The Figma redesign is intentionally focused on per-agent run state (DrawerHeader + TokensByTool + TimelineSection); cohort metrics are an orthogonal concern. Drop-and-revisit was the right call mid-brainstorm, but the widget shouldn't just evaporate — Layer-1 is the whole point of CREW-164.

**Anchors:**

- `packages/dashboard/src/components/RunMetrics.tsx` — the widget being dropped
- `packages/dashboard/src/components/MetricsTrendWidget.tsx` — sibling widget that may share the same fate / home
- `packages/dashboard/src/components/AgentBody.tsx:45` — current call-site, deleted by the drawer migration
- CREW-164 (Layer-1 metrics pipeline — what produces the data)
- Drawer migration spec: `docs/superpowers/specs/2026-05-22-drawer-code-migration-design.md` (to be written this session)

**What's been considered:**

- **Dedicated `/metrics` route.** RunMetrics + MetricsTrendWidget on their own screen. Clean separation between "what's happening with this run" (drawer) and "how are runs doing across cohorts" (metrics page). Largest scope.
- **Sidebar/footer on AgentPage.** Less disruptive but reintroduces the same "doesn't belong here" problem the drawer redesign solved.
- **Per-run drawer footer.** Show the _single run's_ metrics at the bottom of the drawer (small row of 4 values), distinct from the cohort aggregate. Requires deciding whether to keep `RunMetrics` (cohort-aware) or build a per-run variant.

**Shape of work:** Decision-first. Once placement is decided, implementation is small — re-render `RunMetrics` in a different location, or build a thin per-run variant if going that route. The blocker is product/design clarity on what the metrics are _for_ in this UI.

**Open questions:**

- What story do Layer-1 metrics tell, and to whom? (Cohort health snapshot for ops? Per-run quality gate for an author? Both?)
- Are `RunMetrics` (cohort) and `MetricsTrendWidget` two surfaces of the same idea or distinct? They share a backend (`/api/metrics`) but render differently.
- Does anyone actively look at these metrics today, or was the widget aspirational? If aspirational, deprecation is a third option.

## 2026-05-13 — TopNav BrandMark renders a different glyph than the Figma "crew" mark

**What:** The `BrandMark` component at the top-left of the TopNav renders a check-in-rounded-square SVG in code (two rounded rects + a checkmark path) while the Figma reference shows a squarish-dotted "crew" mark. Verified 2026-05-21 against `packages/dashboard/src/components/BrandMark.tsx`: current SVG is `<rect>... <path d="M7 12 L11 16 L17 8" .../>` — clearly checkbox-styled, not the Figma mark.

**Why noticed:** 2026-05-13 ultimate-test visual comparison. Visible on all 5 captured screens — the check-in-square glyph appears identically rendered in code, the squarish-dot mark appears identically in Figma.

**Anchors:**

- `packages/dashboard/src/components/BrandMark.tsx` — current implementation
- `packages/dashboard/src/components/BrandMark.figma.tsx` — Code Connect mapping
- Figma component: `220:211` (BrandMark on Composites page)
- Note: pre-existing drift, not a CREW-135 regression. The brand mark may have been redesigned in Figma after the initial dashboard implementation.

**Shape of work:** Small — refresh BrandMark.tsx's SVG path to match the Figma reference. Compare the Figma node's SVG content to the code's SVG, update path data accordingly.

**Open questions:** Is the Figma BrandMark the canonical brand intent, or did Figma drift from a previously-agreed mark? Confirm with design owner before changing.

## 2026-05-13 — "Hide finished" toggle on Agents List has no Figma reference (scope drift either way — reconcile)

**What:** The Agents List rendered output shows a `Hide finished` toggle (outlined pill, top-right of the agent list area). Verified 2026-05-21: `components/AgentsList.tsx:62` renders the toggle. No Figma frame captured during the 2026-05-13 ultimate test surfaces this control — the Figma `1:2` Agents List reference has no equivalent toggle. Either the Figma is stale (control was added in code post-Figma-design) or the code over-shipped.

**Why noticed:** 2026-05-13 ultimate-test visual comparison (screen 1 — Agents List).

**Anchors:**

- `packages/dashboard/src/components/AgentsList.tsx:62` — toggle implementation
- Source of the feature: CREW-107 (PR #142, "Hide finished toggle on AgentsList") — code-side feature that shipped without Figma alignment
- Figma reference: `1:2` — no Hide finished toggle visible

**What's been considered:**

- **Code-first feature:** real UX request shipped without going through Figma first. Solution: add it to the Figma design retroactively.
- **Over-shipped feature:** the toggle isn't actually wanted; remove from code.
- **Design owner unilaterally chose not to include it in Figma:** also requires reconciliation.

**Shape of work:** ~15min: confirm with design owner whether the toggle stays in code (add to Figma) or comes out of code (remove). Easy decision once asked.

**Open questions:** Which way does the user want to reconcile?

**2026-06-06 update — half reconciled:** decision is "keep it." The bespoke outlined-pill toggle (with its own `hover:opacity-80`) was replaced with the DS `Switch` component (`AgentsList.tsx`, mirrors `LiveModeToggle`) during the pill/button hover-states change. The control now has a DS basis that exists in Figma (`Switch` set `335:242`), resolving the "scope drift / no DS reference" half. **Remaining:** the Figma AgentsList _screen_ (`1:2`) still doesn't depict the toggle — add a `Switch` instance there for screen-level parity, then this can move to Resolved.

## 2026-05-10 — Polish the CREW-119/CREW-117 Crew DS composites (skeleton-fidelity → pixel-fidelity)

**What:** CREW-119 + CREW-117 built ten Crew DS composites on the Composites page at **skeleton fidelity** — names, semantic-token bindings, and slot structure correct, but visual treatment intentionally minimal. `BrandMark` and `StateBadge` are now pixel-fidel after the 2026-05-10 frame migration polish. The other composites are placeholder boxes with sample text. They need a designer pass — type ramps tightened, padding/gap bound to Core `tw/space`, hover/focus states added, variant axes grown (`AgentRow.state`, `TopNav.route`, `ProjectSection.expanded`).

**Specific known defect — AgentBody embeds a hardcoded state pill:** during the 2026-05-10 frame-migration session AgentBody (`24:2`) was found rendering its state pill as a solid color block. **Sub-issue resolved 2026-05-12:** verified during the in-session DS consolidation that AgentBody's metadata row's pill node (now `220:233` in `9FeJPriqdsdA4n9R5Xsrr8`) is a real `StateBadge` INSTANCE — broader composite polish (Timeline placeholder buildout, action-row buttons) remains active under this followup.

**Why noticed:** CREW-119 + CREW-117 autonomous runs on 2026-05-10 — Crew DS build-out was descoped from pixel-perfect to skeleton fidelity to keep run scopes reasonable.

**Anchors:**

- Crew DS (consolidated): `9FeJPriqdsdA4n9R5Xsrr8` Composites page
- Component node IDs in archived Crew DS file: `BrandMark=19:3`, `StateBadge=20:23`, `TopNav=21:2`, `AgentRow=21:9`, `ProjectSection=21:21`, `AgentsList=21:25`, `AgentBody=24:2`, `StateHistoryBar=25:4`, `TokenTable=26:4`, `ViewportFrame=27:4` (may have moved post-consolidation)
- Dashboard CVA configs: `packages/dashboard/src/components/{AgentRow,StateBadge,TopNav,ProjectSection,AgentBody,StateHistoryBar,TokenTable,ViewportFrame}.tsx`
- `docs/plans/design-system.md` — Component inventory + "StateBadge visual pattern (canonical)" section

**Shape of work:** Likely folded into individual fidelity tickets as they arise (e.g. a future "Projects List fidelity" ticket would polish `TopNav`). No standalone ticket needed unless the user wants to schedule a dedicated polish pass.

## 2026-05-08 — Tool-name filtering in the timeline Filters dropdown

**What:** Today's drawer timeline lets users filter by event _type_ (Tool calls / Assistant prose / Thinking / System / Hooks & skills / Other). It doesn't let them filter by _tool name_ (Bash / Read / Grep / Edit / etc.). Once a long-running agent racks up 800+ tool calls, "show me only the Bash invocations" becomes a useful triage gesture. Add a tool-name section inside the Filters dropdown built by CREW-118.

**Why noticed:** 2026-05-08 triage of the chip→dropdown redesign. We agreed to keep the initial dropdown scoped to event-type filtering only — tool-name filtering has its own UX problems (long, dynamic list per agent; ordering / search inside the popover; user might want "fewest" vs "most" used) that deserve a designer pass.

**Anchors:**

- [CREW-118](https://safturento.atlassian.net/browse/CREW-118) — the dropdown ticket this would extend
- `docs/designs/design_handoff_crew_dashboard/` — design hand-off; would need an additional update
- `packages/dashboard/src/components/FilterChips.tsx` (today) / Filters dropdown (post-CREW-118) — host component
- The set of tool names is dynamic — read from the timeline event stream rather than a hardcoded list

**What's been considered:**

- **Sub-section in the same dropdown.** Type checkboxes on top, tool-name checkboxes below, separated by a divider. Risk: long tool lists make the popover scroll.
- **Separate "Tools" dropdown.** Two buttons in the row. Cleaner per-section UX, but eats more horizontal space.
- **Search-inside-the-popover.** Type checkboxes always visible at top; tool-name section below with a small filter input. Scales to long lists.

Lean toward search-inside-popover when this iteration ships.

**Shape of work:** One ticket, dependent on CREW-118 landing first. Designer hand-off update for the new section, then implementation extends the dropdown's checkbox model with a tool-name list source (derived from the agent's timeline events).

**Open questions:**

- Tool-name filters compose with type filters (AND), or alternative axis (OR)? Probably AND.
- Tool aliases worth normalizing (e.g. `mcp__atlassian__jira_get_issue` → `Jira: get_issue`)? Raw is simplest.
- Count next to each tool name live-updating or fixed at popover-open time? Fixed is much cheaper.

## 2026-05-05 — Dashboard silently drops agents whose project isn't in `/api/projects`

**What:** `packages/dashboard/src/components/AgentsList.tsx:21-22` filters projects by `byProject.has(p.name)` and only renders sections for projects returned by `/api/projects`. An agent whose `projectName` field doesn't match any registered project disappears from the UI entirely — no warning, no fallback bucket. The companion compose-mount bug (the daemon container had no bind-mount for `~/.config/crew/projects/`, so `/api/projects` returned `[]`) made this manifest as "every agent is invisible." That mount is fixed, but the silent-drop UX is still wrong.

**Why noticed:** User dispatched `crew run CREW-95`, agent registered fine but the dashboard at `localhost:5173` was empty. Even after fixing the mount, any project name mismatch (typo in TOML, project deregistered while agents are still active) re-creates the same silent failure.

**Anchors:**

- `packages/dashboard/src/components/AgentsList.tsx:21-22` — the filter that drops everything
- `packages/dashboard/src/data/types.ts` — `Agent.projectName` field shape
- `packages/daemon/src/services/ProjectsService.ts:28` — silently returns `[]` when configDir is missing
- `docker-compose.yml` — daemon volume list

**What's been considered:**

- Render orphan agents under a synthetic `Unregistered` section with a banner "this agent's project isn't registered — register it via `crew register`."
- Daemon-side: include orphan agents in `/api/agents` with a synthetic project entry.
- Show a top-level toast when `/api/agents` has rows that no `/api/projects` row matches.

The "synthetic Unregistered section" feels right — single render path, no extra API surface.

**Shape of work:** Single small dashboard PR. Add an `Unregistered` group key when an agent's projectName has no match in `projects[]`. Update `AgentsList.test.tsx` to cover the orphan path. ~30 min.

**Open questions:**

- Should the `Unregistered` section sort first (most urgent) or last? Lean first.
- Does the slice 1c "Hide finished" toggle interact with this? Probably independent.

## 2026-04-29 — Slice 1c agents continuation work

**Ticket:** [CREW-94](https://safturento.atlassian.net/browse/CREW-94) (Epic) — resolution gated on Epic completion per the user-level CLAUDE.md "Epic exception" convention.

**What:** Slice 1b (CREW-47) deliberately punted seven concerns into a future "slice 1c":

1. **SSE / `GET /events`** — push-based dashboard updates.
2. **`crew finish` daemon integration** — register a "finish" run on the daemon.
3. **`idle` / `waiting` state derivation** — needs explicit signaling or a heuristic.
4. **`GET /api/agents/:key`** — single agent + transcript. Drawer prerequisite.
5. **`GET /api/agents/:key/state-history`** — state transitions.
6. **Drawer/timeline endpoints** — whatever else the agent-detail drawer needs.
7. **PR URL extraction from JSONL** — `runs.pr_url` column stays NULL.

**Why noticed:** [CREW-47](https://safturento.atlassian.net/browse/CREW-47) "Out of scope" list and [CREW-49](https://safturento.atlassian.net/browse/CREW-49) "Out of scope" (mentions slice 1c will likely add a `state_transitions` table).

**Anchors:** [CREW-47](https://safturento.atlassian.net/browse/CREW-47); `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md`; `packages/daemon/src/migrations/0001_agents_runs_tool_calls.ts` — `pr_url` column declared, NULL in slice 1b; `packages/daemon/src/services/IngestService.*` — adds PR URL extraction in 1c.

**Shape of work:** Becomes a new Epic ("Slice 1c: agents drawer + push updates") with child tickets — `state_transitions` migration; single-agent + state-history endpoints; SSE endpoint + dashboard subscription; agent detail drawer; `crew finish` daemon registration; idle/waiting heuristic.

## 2026-04-29 — CREW-25 cva-refactor cleanup leftovers

**What:** Three small TD items surfaced in CREW-25's PR description as "Follow-ups (not in this PR)":

1. **`STATE_META.colorVar` is unused.** `STATE_CLASSES` is single source of truth. Verified: `colorVar` still defined for all 7 states in `state-meta.ts:5,11–22` but no production code reads it.
2. **`@source inline(...)` directives are redundant.** All state classes are now literal in source. Verified: 6 `@source inline(` directives still in `index.css:79,82,85,88,91,94`.
3. **`ALL_STATES` and `ACTIVE_STATES` are duplicated across files.** Lift to `state-meta.ts`.

**Why noticed:** [PR #35](https://github.com/Safturento/crew/pull/35) (CREW-25) description.

**Anchors:** `packages/dashboard/src/data/state-meta.ts:5,11–22`; `packages/dashboard/src/index.css:79–94`; `packages/dashboard/src/components/StateBadge.tsx:15,80`, `packages/dashboard/src/components/AgentRow.tsx:16`; `packages/dashboard/src/data/state-meta.test.ts:56`.

**Shape of work:** One small cleanup ticket touching 5 files. Drop `colorVar`, drop `@source inline` directives (verify build-output), lift the two `Set<AgentState>` constants. Bundle into the next dashboard refactor that touches these files.

## 2026-04-28 — Dashboard write/action endpoint surfaces

**What:** §10 of the dashboard UI design lists daemon API additions the UI depends on for write/action surfaces. None exist yet:

- `POST /jobs/run` — start `crew run` (project + ticket key)
- `POST /jobs/fix-pr` — start `crew fix-pr`
- `POST /jobs/finish` — start `crew finish`
- `GET /jira/:project/tickets` — proxy to Jira (cached)
- `POST /projects` / `PATCH /projects/:name` / `DELETE /projects/:name` — projects CRUD writing TOML files
- `POST /attention/clear` — clear all sticky favicon badges

**Why noticed:** `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §10. Prerequisite for the New Run modal, Projects route, cross-tab clear-attention surface.

**Anchors:** `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §10; `packages/daemon/src/routes/` — destination; `packages/cli/src/commands/run.ts`, `fix-pr.ts`, `finish.ts` — endpoints have to dispatch to same code paths; `packages/shared/src/config/loader.ts` — projects CRUD writes TOML files.

**Shape of work:** Probably its own Epic ("Daemon write surfaces"), parallel-able with Slice 1c. Each `POST /jobs/*` endpoint spawns the same orchestration the CLI does — argues for hoisting `runRun`/`runFixPr`/`runFinish` into a callable library. Projects CRUD touches the TOML loader's write-path (doesn't exist today).

**Open questions:**

- Authentication: localhost-only, but accidental `POST /jobs/run` could spawn an agent against the wrong ticket. Probably needs a confirmation token or idempotency key.
- `/jobs/` endpoints sync (return when agent exits) or async (return immediately, observe via SSE)? Async fits long-lived runs.

## 2026-04-28 — Dashboard agent detail drawer + full-page route

**Ticket:** [CREW-94](https://safturento.atlassian.net/browse/CREW-94) (Epic) — folded into the Slice 1c Epic alongside the agents-continuation followup above.

**What:** The `AgentDetailPlaceholder` component currently renders "The agent detail drawer ships in a follow-up plan." That follow-up plan does not exist yet. The drawer is the dashboard's primary drill-down surface — without it, `/agents/:key` is a dead end. The full-page variant (`/agent/:key/full`) is also unbuilt.

**Why noticed:** [PR #20](https://github.com/Safturento/crew/pull/20) (CREW-17) called the drawer "future epic" in non-goals. The dashboard foundation plan listed it under "Out of scope (will be subsequent plans)."

**Anchors:** `packages/dashboard/src/components/AgentDetailPlaceholder.tsx`; `packages/dashboard/src/App.tsx`; `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §5; Slice 1c read endpoints — backend prerequisites.

**Shape of work:** Becomes a child of the slice-1c epic since it depends on `GET /api/agents/:key` and state-history. Phase A: drawer component + route wiring against fixtures. Phase B: wire to real endpoints. Phase C: full-page variant.

## 2026-04-28 — Dashboard New Run modal + projects route view

**What:** Two more frontend surfaces deferred from the foundation plan:

1. **New Run modal** — project picker → ticket picker → confirm. Exposed by the top nav's `+ New Run` button (currently a no-op). Depends on `POST /jobs/run` and `GET /jira/:project/tickets`.
2. **Projects route view** — list of registered projects, TOML viewer, edit/register form. Currently `#/projects` renders a placeholder. Depends on projects CRUD endpoints.

**Why noticed:** Dashboard foundation plan explicitly listed both under "Out of scope."

**Anchors:** `packages/dashboard/src/App.tsx`; `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §6 (New Run modal), §7 (Projects route); `docs/superpowers/plans/2026-04-26-dashboard-foundation-and-agents-list.md` Out-of-scope list.

**Shape of work:** Frontend tickets paired with the dashboard write-endpoint epic above. Projects route also needs a TOML formatter for display — pairs with per-config-block reference docs.

## 2026-04-28 — `useAttention.clear()` snapshot semantic isn't directly tested

**What:** `useAttention.clear()` is documented in the foundation plan as having a "snapshot" semantic — calling clear adds _currently-attention_ keys to `dismissed`, but newly-attention agents that arrive later still bubble up. The behavior is exercised through `App.test.tsx`'s end-to-end flow but not directly unit-tested.

**Why noticed:** [PR #20](https://github.com/Safturento/crew/pull/20) (CREW-17) "Known coverage gaps" section.

**Anchors:** `packages/dashboard/src/attention/useAttention.ts`; `packages/dashboard/src/attention/attention.test.ts` — no `clear()` cases; `packages/dashboard/src/App.test.tsx:60` — only existing test that hits `clear()` indirectly.

**Shape of work:** Tiny cleanup. Add 2–3 RTL test cases. Bundle into the cva-cleanup ticket above or stand alone.

