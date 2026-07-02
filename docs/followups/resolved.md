# Followups — Resolved

> Items that were ticketed + shipped, or fixed inline. Kept for historical context. Index: [`../followups.md`](../followups.md).

## 2026-07-02 — Dispatch-gate preflight failures never reach the agent timeline (all-green timeline on an `error` run)

**What:** The KAN-48 dispatch died in the `excluded-commands` dispatch-preflight check ~700ms after `npm ci`. The agent settled to `error`, but its timeline showed every startup phase green then simply stopped — the diagnosis was only reachable via the (now-retired) Runner page. Three gaps: (1) the dispatch preflight + `installPlaywrightBrowsers` tail of `prepareAgentEnvironment` (plus the Bruno env write and skill/hook injection) were not wrapped in `bracketStartupPhase`, so a throw there emitted no `failed` phase; (2) `TimelineService.getTimeline` never merged the `runs` row's structured `failed-start` diagnosis, so the reason was captured but unreachable from the drawer; (3) `GET /api/agents/:key` 404'd for a zero-run agent (a pre-registration death, e.g. a worktree-phase failure), so the drawer couldn't even open.

**Why noticed:** The 2026-07-02 KAN-48 dispatch (recipes) and CREW-313's own failed dispatch (a stale host `.git/config.lock` worktree-phase death). This is the late-gate counterpart to CREW-308's early-gate visibility work — the Epic's "no startup failure is ever invisible" goal.

**Anchors:** `packages/cli/src/lib/run/agent-environment.ts` (dispatch preflight + playwright install tail); `packages/cli/src/commands/run.ts` (Bruno env write, skill/hook injection); `packages/daemon/src/services/TimelineService.ts`; `packages/daemon/src/services/AgentsService.ts` (`getByKey`); `packages/shared/src/transcripts/schemas.ts`; the Timeline dashboard components. Originated as the crew PR [#450](https://github.com/Safturento/crew/pull/450) followup entry.

**Resolved 2026-07-02:** Shipped in CREW-313. Bracketed the pre-spawn tail (new `crew_startup_dispatch_preflight` / `crew_startup_playwright_install` / `crew_startup_bruno_env` / `crew_startup_skill_injection` phases); added a synthetic `crew_failed_start` event that `TimelineService` merges from the latest `failed-start` run's `failure_*` columns; and made `getByKey` return an agents-row-backed detail (state from the transition log, null run-derived fields) for a zero-run agent so the drawer opens on a pre-registration death. The original Active entry lived in the still-unmerged PR #450, so it was recorded directly here on resolution rather than cut from a topic file.

## 2026-06-05 — Dashboard has no cancel action; CLI kill never notifies the daemon

**What:** There is no way to stop an in-flight `crew run` from the dashboard, and stopping one from a separate shell (`kill`, killing the container, deleting the worktree) never tells the daemon the run ended. `crew run` only POSTs `…/runs/:id/complete` on a clean exit of the foreground process — claude exits normally, or a foreground Ctrl+C that the `sigintHandler` forwards to claude before falling through to the `completeRun` call. An out-of-band kill skips that path entirely, so the run row keeps `completed_at = null` and the agent shows "running" forever (the orphaned-run symptom). The dashboard's action surface (the CREW-208 lineage: New Run / Fix PR / Finish) has no Cancel verb, so the operator's only recourse is a CLI kill — which is exactly what orphans the run.

**Why noticed:** 2026-06-05 session. After hard-resetting the four Dashboard-polish runs (CREW-231–234) from the command line — there's no dashboard control for it — all four kept showing "running" on the dashboard. Tracing it: the kill bypassed `completeRun`, leaving the run rows in-flight. The display self-corrects on re-dispatch (state derivation keys off the latest run by id), but the orphaned rows persist underneath, and there's no graceful way to end a run from the UI in the first place.

**Anchors:** `packages/cli/src/commands/run.ts` ~`:587`–`:657` (the abort controller, `sigintHandler`, and the `completeRun` call reached only on the clean path); `packages/daemon/src/routes/runs.ts` (the `:runId/complete` endpoint a Cancel action would land); `packages/cli/src/lib/runner/` + `packages/daemon/src/routes/runner.ts` (the host runner that executes dispatched verbs — a Cancel would need it to signal the spawned process); the CREW-208 dashboard-actions lineage. Pairs with the 2026-05-18 reaper followup below.

**What's been considered:** Two complementary angles, both wanted — (1) a **dashboard Cancel/Abort action** routed through the action queue + runner (signal the spawned `crew run` process) so it lands a clean `completeRun`, mirroring how New Run / Fix PR / Finish already flow; (2) a **daemon-side reaper** (the 2026-05-18 followup) as the backstop for kills that bypass _any_ graceful path (SIGKILL, container death). The action handles the intentional case cleanly; the reaper catches the rest. The terminal-state question is shared with the reaper: a cancelled/reaped run probably wants a distinct `cancelled`/`abandoned` state rather than `error`.

**Shape of work:** Belongs to the not-yet-planned runner-status/logs epic (item #3 of the 2026-06-05 dashboard worklist) or a dedicated run-lifecycle-control slice — not its own ticket until that epic is brainstormed. Medium: a daemon action verb + route, runner support for signalling a tracked child process, a dashboard button on active agents, and the terminal-state decision.

**Open questions:**

- Does the runner currently track the PID of each `crew run` it spawns well enough to signal it cleanly? (Check `packages/cli/src/lib/runner/`.)
- New terminal state (`cancelled`) vs reusing `error`? Resolve together with the reaper followup, which raises the same question.

**Resolved 2026-06-28:** Closed by Epic [CREW-235](https://safturento.atlassian.net/browse/CREW-235) — the dashboard Cancel action shipped: drawer-header cancel ([CREW-246](https://safturento.atlassian.net/browse/CREW-246)) and Runner-page soft→hard cancel escalation ([CREW-245](https://safturento.atlassian.net/browse/CREW-245)), routing through the `runner_commands` reverse queue so the signalled process lands a clean `completeRun`. The **backstop half** (a daemon auto-reaper for fully-`running` orphans that bypass _any_ graceful path — SIGKILL, container death) was deliberately NOT covered here; it is carved out to standalone ticket [CREW-305](https://safturento.atlassian.net/browse/CREW-305), tracked by the still-Active "2026-05-18 — Daemon has no reaper for orphaned runs stuck in `running`" entry.

## 2026-06-04 — New Run modal step 2 is a text entry, not the Figma open-ticket picker

**What:** CREW-218's New Run modal ships step 2 ("Pick a ticket") as a single `FormField` where the operator types a ticket key, and step 3 ("Confirm") omits the Figma's "Title" summary row. The Figma frames (`1:3418`, `9:2`) instead show a searchable list of the project's **open Jira tickets** (rows like `KAN-31 · Drag-and-drop reordering…` with a priority badge + a "Filter open tickets…" search input) and a ticket _title_ on the confirm step. Both gaps have the same root cause: no daemon endpoint serves open tickets or a ticket summary to the dashboard — `DaemonClient` exposes only `listProjects` / `listAgents` / `enqueueAction` / `getRunnerStatus`. The plan (T6 step 2) explicitly deferred live ticket fetching ("otherwise skip in v1").

**Why noticed:** Implementing CREW-218. Step 1 (project picker) maps cleanly to `listProjects()`, but steps 2–3 need data the dashboard can't fetch yet, so the modal degrades to a typed key. Surfaced during the visual-fidelity pass as the largest code↔Figma divergence (medium, intentional).

**Anchors:**

- `packages/dashboard/src/components/NewRunModal.tsx` — step 2 `FormField`; step 3 `SummaryRow`s (no Title).
- Figma `1:3418` (Select Ticket), `9:2` (Confirm) + composites `362:2212` / `362:2213` in `.crew/figma-snapshot/`.
- `packages/dashboard/src/data/DaemonClient.ts` — the missing `listOpenTickets(project)` / `getTicket(key)` surface.
- `packages/shared/src/jira` — the Jira client the daemon would call.
- Sibling followup directly above: "CREW-137 modal composites unverified" — CREW-218 is the wiring ticket it anticipated; its Modal/Stepper/ModalSelectionRow/FormField fidelity is now verified (AlertModal still unwired).

**What's been considered:** A `GET /api/projects/:slug/tickets` (open issues via the project's Jira board) + `GET /api/tickets/:key` (summary) would let step 2 become the real picker and step 3 show the title. Out of scope for T6 (dashboard-only); needs a daemon route + Jira-client call + Bruno coverage. Also open: should the New Run modal's "Spawn agent" respect runner-online status (like T5's QuickAction degradation), or is queuing-while-offline acceptable since the daemon holds the pending action until a runner connects? Today it always enqueues.

**Shape of work:** One daemon ticket (open-tickets + ticket-summary routes + Jira client + Bruno) blocking one dashboard ticket (swap step 2's FormField for a `ModalSelectionRow` list with the search `Input`, add the Title row to step 3). The runner-gating question is a small separate decision, possibly just a disabled-state on Spawn.

**Open questions:**

- [ ] Source of "open tickets" — the project's Jira board/JQL, or only tickets with no existing agent yet?
- [ ] Should Spawn be disabled / warn when no runner is online?

**Resolved 2026-06-28:** Closed by Epic [CREW-276](https://safturento.atlassian.net/browse/CREW-276) — step 2 is now the searchable, epic-grouped, dependency-aware ticket picker (shared Jira client + search [CREW-277](https://safturento.atlassian.net/browse/CREW-277); daemon `GET /api/projects/:slug/tickets` [CREW-278](https://safturento.atlassian.net/browse/CREW-278); dashboard picker UI [CREW-279](https://safturento.atlassian.net/browse/CREW-279)), step 3 shows the ticket title, and it degrades to manual key entry when the daemon has no Jira creds. The two-row TicketRow redesign + interactive-label gating followed in Epic [CREW-284](https://safturento.atlassian.net/browse/CREW-284). The Spawn-while-runner-offline open question was left as accepted behavior — the daemon holds the pending action until a runner connects.

## 2026-06-19 — Pause/resume/message build is gated on a host-only confirmation spike (CREW-248)

**Update 2026-06-19:** Gate **closed GREEN** on a host (un-sandboxed) confirmation run — `claude --resume` tolerates a transcript ending on a dangling `tool_use` (Claude Code's resume reconstruction sanitizes the trailing turn before re-sending to the API), so the apply path needs **no** transcript-sanitization branch. The build is now ticketed (CREW-272/273/274, all _Ready for Development_) — no longer deferred. The original blocked-in-sandbox framing below is retained for history.

**What:** The pause/resume/message apply paths (`packages/cli/src/lib/runner/commands.ts`) + dashboard controls are designed-for in the v1 data model but gated behind a feasibility spike (cleanly interrupt a detached headless `claude` mid-turn + resume via `spawnClaudeResume` without a dangling-`tool_use` corrupting state). The spike's empirical leg **could not run in the `crew run` dispatch sandbox** — `~/.claude/projects` + `~/.claude/session-env` are mounted read-only, so a nested `claude` persists no transcript/session and `--resume` has nothing to resume (the Bash tool also can't run). The gate was therefore confirmed on the host instead (see Update above).

**Why noticed:** Ran the CREW-248 spike under `crew run` dispatch; hit the read-only `~/.claude` substrate. See the full writeup + the reproducible host-confirmation script.

**Anchors:**

- `docs/tickets/CREW-248.md` — full spike outcome, the host-confirmation script, the implementation design, and the cross-layer `paused` run-state wrinkle.
- `packages/cli/src/lib/runner/commands.ts` (`applyCommand`) — `pause`/`resume`/`message` return `failed: not yet supported` today.
- `packages/cli/src/commands/resume.ts`, `packages/cli/src/lib/claude/spawn.ts` (`spawnClaudeResume`) — the resume mechanism the build reuses.

**What's been considered:** Design settled in `docs/tickets/CREW-248.md` — `pause` = SIGTERM the group + `registry.setState(paused)` (keep tracking); `resume`/`message` = re-dispatch `crew resume <key> [-m message]` via a new injected boundary on `ApplyCommandDeps`. Key wrinkle: `crew run` lands a _terminal_ `completeRun` on any SIGTERM exit (reduces to `error`), so a _non-terminal_ resumable `paused` run-state needs `crew run`/daemon pause-awareness — `paused` is a `LiveProcessState` only today.

**Shape of work:** Now three CREW-235 children — (1) `commands.ts` apply mapping + injected `resume` boundary = CREW-272; (2) non-terminal `paused` run-state in `crew run` + daemon = CREW-273; (3) dashboard Pause/Resume controls = CREW-274. CREW-272 ∥ CREW-273 (parallel — different code seams), both block CREW-274.

**Open questions:** Gate question (does `claude --resume` repair or reject a dangling `tool_use`?) **resolved 2026-06-19 — it repairs/tolerates it.** Remaining build-design choice carried into CREW-273: how to represent a non-terminal `paused` run — sentinel/suppress `completeRun`, distinct signal, or new daemon state?

**Resolved 2026-06-28:** Closed by Epic [CREW-235](https://safturento.atlassian.net/browse/CREW-235) — the three build children shipped: apply paths in `commands.ts` + the injected resume boundary ([CREW-272](https://safturento.atlassian.net/browse/CREW-272)), the non-terminal `paused` run-state in `crew run` + daemon ([CREW-273](https://safturento.atlassian.net/browse/CREW-273)), and the dashboard Pause/Resume controls ([CREW-274](https://safturento.atlassian.net/browse/CREW-274)). The gating spike CREW-248 had already confirmed (host run, GREEN) that `claude --resume` tolerates a transcript ending on a dangling `tool_use`, so no transcript-sanitization branch was needed.

## 2026-06-19 — `PrTransitionService.markMerged` check-then-insert isn't transaction-guarded against a true concurrent race

**What:** `markMerged` reads the latest `state_transitions` row (`latestState`) and, if it's `pr_open`, inserts a `pr_merged` row — without wrapping the read+insert in a transaction (`packages/daemon/src/services/PrTransitionService.ts`, `markMerged` + `latestState`). The `latest === 'pr_open'` precondition collapses _sequential_ re-delivery (double webhook, webhook-after-poll) to one transition perfectly, but two callers that both pass the precondition read _before_ either inserts will both insert — yielding two `pr_merged` rows. The plan's stated constraint is "double-delivery and webhook-vs-poll races must collapse to one transition"; the precondition satisfies the sequential half, not a true concurrent race.

**Why noticed:** Code review of CREW-268 (the extraction ticket). Surfaced as a Minor finding explicitly scoped to the future webhook child — for CREW-268 it is moot because `PrPoller` is the single, single-threaded caller. It becomes live the moment the webhook (`GithubWebhookService`, child C) can fire `markMerged` concurrently with a poll round.

**Anchors:** `packages/daemon/src/services/PrTransitionService.ts` (`markMerged`, `latestState`); `packages/daemon/src/services/PrPoller.ts` (current sole caller); plan `docs/superpowers/plans/2026-06-19-github-webhook-pr-merge.md` (idempotency constraint + Task 8 webhook service); ticket `docs/tickets/CREW-268.md`.

**What's been considered:** Two viable resolutions in child C — (a) wrap the check+insert in a Kysely transaction (SQLite serializes writes, so a `BEGIN IMMEDIATE` + re-read closes the window), or (b) deliberately accept the duplicate row as harmless, since `AgentsService.deriveState` projects from the _latest_ transition and two identical `pr_merged` rows render identically. Option (b) is likely fine at crew's scale and write pattern; the point is to make it a conscious decision rather than an accidental gap. A unique-ish guard (partial index on `agent_key` where `to_state='pr_merged'`) is a third option but heavier than warranted.

**Shape of work:** one-line-ish decision + optional small transaction wrapper in child C; add a concurrent-race test if option (a) is taken.

**Open questions:** Does the webhook actually run on a separate event-loop turn from the poll round such that a race is reachable in practice (both are in-process on one Node daemon)? If `markMerged` calls are never truly interleaved (single-threaded JS, no `await` between the read and insert in the same microtask)… but there _is_ an `await` between `latestState` and the insert, so interleaving is reachable. Confirm in child C.

**Resolved 2026-06-28:** Resolved as **option (b) — accept the duplicate as harmless** — at the close of Epic [CREW-267](https://safturento.atlassian.net/browse/CREW-267). Verified against HEAD: `PrTransitionService.markMerged` still performs an unguarded check-then-insert (an `await` separates the `latestState` read from the insert), so a genuine concurrent webhook-vs-poll race could write two `pr_merged` rows. This is intentionally tolerated — `AgentsService.deriveState` projects from the _latest_ transition and two identical `pr_merged` rows render identically, so the duplicate is inert at crew's scale and single-daemon write pattern. If exactly-once transitions are ever needed, wrap the check+insert in a `BEGIN IMMEDIATE` Kysely transaction (option a).

## 2026-06-25 — Runner never reaps dead processes: phantom "running" entries linger, and early-death runs never settle to error

**Resolved 2026-06-25:** Liveness-sweep half closed by [CREW-288](https://safturento.atlassian.net/browse/CREW-288). The runner heartbeat (`packages/cli/src/lib/runner/loop.ts` → `startHeartbeat`) now runs `registry.reapDead(isAlive)` before each `toSnapshot()`: every tracked pid is probed with the `process.kill(pid, 0)` liveness check (factored into `packages/cli/src/lib/runner/liveness.ts` and injected through `worker.ts`) and the dead ones are dropped — so a `crew run` child that ended without a terminal `remove` (early death, crash, OOM-kill) no longer lingers as a phantom **running**, and a reap is logged. Reap is purely on `isAlive` with no grace period (the registry only holds an entry once the child has actually spawned, so a just-spawned pid already probes alive). Unit tests cover reaped-dead / retained-live at both the `Registry.reapDead` and `runLoop` heartbeat layers. **The surfacing half — recording an early-death run as an `error` state (daemon run-failure record + per-entity drawer) — was deliberately left to CREW-249;** the reap stops the snapshot from lying, but a run that dies before registering still has no `runs` row for the daemon to settle.

**What:** The host runner's live-process `Registry` (`packages/cli/src/lib/runner/registry.ts`) had **no liveness reaping**. `toSnapshot()` returned every tracked process verbatim; an entry was dropped only when something _explicitly_ called `remove()` — a `cancel_hard`/`reap` runner command, or a daemon-driven settle. A `process.kill(pid, 0)` `isAlive` probe already existed but was wired only to supervise the _worker_ process (`supervisor.ts`), never to reap dead _agent_ processes. So any `crew run` child that ended **without** reaching a terminal state that triggers a `remove` — an early death (e.g. the worktree-creation failure above), a crash, an OOM-kill — stayed in the heartbeat snapshot as a phantom **running** forever (until the runner restarts, which clears the in-memory map). Compounding: a run that dies before registering with the daemon has no `runs` row, so the daemon has nothing to move to **error** — the phantom registry entry is the only trace, and it lies.

**Why noticed:** 2026-06-25 session — the Runner tab showed a "running" CREW-270 (which never actually launched — see the worktree followup below) plus several stale "running" processes that should have ended. Root-caused to the missing liveness sweep + the no-daemon-trace early-death path.

**Anchors:** `packages/cli/src/lib/runner/registry.ts` (now `reapDead`); `packages/cli/src/lib/runner/liveness.ts` (the factored `isProcessAlive` probe); `packages/cli/src/lib/runner/loop.ts` (heartbeat sweep); daemon side `GET /api/runner/status`, `RunFailureService`. Trigger sibling: [[#2026-06-25--crew-run-worktree-creation-is-non-idempotent-an-orphan-branch-silently-wedges-every-future-run-of-a-ticket]]. Surfacing destination: CREW-249 (runner per-entity drawers) + the 2026-06-19 Runner-page-read-endpoints followup.

## 2026-06-25 — `crew run` worktree creation is non-idempotent: an orphan branch silently wedges every future run of a ticket

**Resolved 2026-06-25:** Closed by [CREW-287](https://safturento.atlassian.net/browse/CREW-287). Added `reconcileOrphanBranch` (`packages/cli/src/lib/run/reconcile-orphan-branch.ts`), called in `run.ts` after `git fetch` and before `git worktree add -b <KEY>`: a **safe orphan** (`<KEY>` branch with zero commits beyond `origin/<default>`) is deleted so the add recreates it cleanly; a branch with **unique commits** (or one whose commit count can't be computed) throws an actionable error (`git log origin/<default>..<KEY>` to inspect, `git branch -D <KEY>` to discard) instead of the raw git fatal. The worktree `bracketStartupPhase` is now wrapped so any throw records the `crew_startup_worktree` **failed** event and exits 1 cleanly — covering the cheap part of the "record the failure" half (the dashboard sees a failed phase, not a silent "launched"). The larger pre-registration daemon-trace half (b) was deliberately left to the runner-observability work / CREW-249. Unit tests cover absent / safe-orphan / unique-commits / uncomputable-count / delete-failure / cwd.

**What:** `crew run <KEY>` creates its worktree with `git worktree add -b <KEY> <worktree> origin/<default_branch>` (`packages/cli/src/commands/run.ts:301-314`). The `-b <KEY>` **creates a new branch**, so if a `<KEY>` branch already exists the command hard-fails with `fatal: a branch named '<KEY>' already exists`. A run that gets interrupted _after_ its branch is created but _before_ it completes (crash, kill, a later-step failure, manual worktree cleanup with `git worktree remove` which leaves the branch) orphans the branch — and then **every** subsequent `crew run <KEY>` dies at worktree creation. Two compounding failures make it invisible: (1) the host runner stamps the action `launched` when the child process _spawns_, not when it succeeds, so the dashboard/queue shows `launched`; (2) the failure happens before the run registers with the daemon, so there is **no `runs` row** — not even a failure row (migration 0010's failure fields only populate once a run registers). Net: the operator sees "launched", no agent ever appears, the ticket never moves to an error state, and nothing explains why.

**Why noticed:** 2026-06-25 debugging session. The user picked CREW-270 in the New Run dialog; it showed 270 on confirm but no agent appeared, while a CREW-286 agent ran. Full trace: the picker→enqueue→runner→`crew run` path was all correct (no mapping bug); CREW-270 had an orphan local branch at main's HEAD (no worktree) left by an earlier interrupted run, so `git worktree add -b CREW-270` failed for actions 96/101/102/104 — each `launched`, none registered. Immediate unblock: `git branch -D CREW-270` then re-run.

**Anchors:** `packages/cli/src/commands/run.ts:288-322` (the `fetch` + `git worktree add -b` block); the host runner stamps `launched` in `packages/cli/src/lib/runner/executor.ts` / `loop.ts`; run registration + failure fields in `packages/daemon/src/migrations/0010_run_failure_fields.ts` and `RunFailureService`. Sibling lifecycle gap: [[#2026-06-25--runner-never-reaps-dead-processes-phantom-running-entries-linger-and-early-death-runs-never-settle-to-error]].

**What's been considered:** (a) Make worktree setup idempotent/resilient — before `git worktree add -b`, check `git show-ref --verify --quiet refs/heads/<KEY>`; if the branch exists with no worktree and no unique commits vs `origin/<default_branch>`, delete + recreate (or `git worktree add` onto the existing branch and reset it); if it has unique commits, fail loudly with a clear, actionable message rather than the raw git fatal. (b) Record the worktree-creation failure even though the run hasn't registered — write a failed-start row (or surface via the runner snapshot) so it's visible and the ticket can show error, not silent nothing. (b) overlaps the runner-reaping/visibility followup and CREW-249's "Failed to start" surface. _Resolution took (a) in full; (b) only partially — the worktree phase now records a `failed` startup event, but the pre-registration daemon `runs`-row trace stays with the runner-observability work._

**Shape of work:** Small-to-medium. Core fix is a pre-flight branch guard in `run.ts` worktree setup (CLI git lib) + a test. The "record the failure" half is larger (daemon run-failure record before registration) and may fold into the runner-observability work.

**Open questions:** When an orphan branch _does_ have unique commits (a partially-done interrupted run), reuse it (resume-like) or refuse + tell the operator to clean up manually? Lean: refuse with a clear message — silent reuse risks running on unexpected state. _Resolved: refuse with the actionable message._

## 2026-06-19 — `AgentsService.deriveState` terminal guards silently revert a state override out of `finished`/`error`/`pr_merged`

**Resolved 2026-06-19:** Closed by [CREW-264](https://safturento.atlassian.net/browse/CREW-264) (the same PR that fixed the coupled `finished`-fallthrough footgun). `deriveState` now takes a `latestIsOverride` flag — true when the agent's latest transition (the row that already feeds `currentState`) carries `source='override'` (CREW-259's provenance column). When set, the override target wins over the `finishCompletedOk`/`exitCode`/`prMerged` terminal guards, so an override OUT of `finished`/`error`/`pr_merged` survives the list + detail re-derive instead of reverting after the optimistic SSE flip. The gate is `source='override'` specifically — answering the open question in favor of the safer option — so any newer automatic event (which writes a non-override row) re-takes precedence and legacy/backfilled agents keep the guards. `list()` surfaces the latest row's `source` via a correlated subquery; `getByKey` selects it alongside `to_state`. Unit tests cover an override out of each terminal state surviving a re-derive plus the non-override-defers-to-guard case.

**What:** CREW-259 (Epic CREW-258) ships `recordStateOverride` + `POST /api/agents/:key/state` as the operator escape hatch whose stated core behavior is moving an agent **out of** a terminal state (`finished`/`pr_merged`). The override correctly writes a `state_transitions` row (`source='override'`), advances the in-memory cache, and publishes `agent.state_changed`. **But the dashboard's displayed badge comes from `AgentsService.deriveState`** (GET `/api/agents` list + GET `/api/agents/:key` detail), whose terminal guards take precedence over the latest transition: `finishCompletedOk` → forces `finished`; `exitCode !== 0` → forces `error`; `prMerged` (any `pr_merged` row ever written for the agent) → forces `pr_merged`. So an override _out of_ one of those three states is honored on the optimistic SSE flip but **silently reverts on the next list/detail refetch** — defeating the Epic's goal for exactly the terminal states the escape hatch most needs to leave. Overrides _into_ any state, and overrides between non-terminal states (or while the latest run is still open, `completed_at IS NULL`), are unaffected.

**Why noticed:** Self-review of CREW-259 (daemon ticket). The plan (`docs/superpowers/plans/2026-06-19-state-override-control.md`) scoped Ticket 1 to the migration + service + route + Bruno and deliberately did not touch `AgentsService`; its Self-Review claimed the service-level test (asserting the latest `pr_merged → pr_open` transition row) proves the behavior — true at the log/cache layer, but the read-path projection was not accounted for. Shipping Ticket 1 as specified; flagging rather than autonomously expanding into the risky terminal-guard logic.

**Anchors:**

- `packages/daemon/src/services/AgentsService.ts` — `deriveState` (the `finishCompletedOk` / `exitCode` / `prMerged` precedence ladder); `list()` computes `prMerged` as `MAX(CASE WHEN st.to_state = 'pr_merged' …)` and `finishCompletedOk` from a clean finish run; `getByKey` mirrors it.
- `packages/daemon/src/services/IngestService.ts` — `recordStateOverride` (writes the override transition + cache + SSE).
- `docs/superpowers/plans/2026-06-19-state-override-control.md` — Ticket 1 scope + Self-Review.
- Epic [CREW-258](https://safturento.atlassian.net/browse/CREW-258); ticket CREW-259.

**What's been considered:** The terminal guards are a legacy compatibility layer ("the CREW-96 backfill never wrote `finished`/`error`/`pr_merged` for historical agents"). Post-CREW-252/257 concrete events _do_ write terminal transitions, so the guards increasingly duplicate the log. Two directions: (a) make `deriveState` honor the latest transition when it is strictly newer than the terminal signal (e.g. compare the override row's `ts`/`id` against the `pr_merged`/finish signal — the `source='override'` stamp this ticket adds is a natural discriminator); or (b) have the override actively neutralize the competing terminal signal (it can't delete the old `pr_merged` row without rewriting history, and `finishCompletedOk` derives from the runs table, not transitions — so (a) is cleaner). Either way it's an `AgentsService`-layer change, properly its own unit of work. _Resolution took direction (a), keyed on `source='override'`._

## 2026-06-03 — `deriveState` falls through to `finished` when PR-create isn't detected

**Resolved 2026-06-19 (read-path half — CREW-264):** The cutover note below describes the _write-path_ (`reduceState`/`IngestService`) twin, but `AgentsService.deriveState` — the read-path projection that actually drives the displayed badge — still ended with a literal `return 'finished'` fallthrough until [CREW-264](https://safturento.atlassian.net/browse/CREW-264) changed it to `return 'idle'`. So a completed exit-0 run with an empty/non-terminal transition log now renders `idle` on the list + detail endpoints (matching the write-path), and `finished` is produced only by the `finishCompletedOk` guard. The footgun is closed end-to-end. (CREW-264 also fixed the coupled override-revert defect — see its own Resolved entry below.)

**Resolved 2026-06-19:** Closed by the concrete-state-triggers cutover (Epic [CREW-252](https://safturento.atlassian.net/browse/CREW-252), final task [CREW-257](https://safturento.atlassian.net/browse/CREW-257)). The inferred PR-create detection is gone entirely — agent state is now driven only by concrete lifecycle events, so a "completed run, no PR observed" no longer needs a heuristic terminal-state guess. A clean `run_exited` with no PR now lands the agent in the (newly reachable) `idle` state, and a non-zero `*_exited` routes to `error`; neither masquerades as `finished`. The `computeNextState`/`deriveState` cross-path inconsistency is moot because `computeNextState` was deleted. The `&&`-chained matcher edge survives only on the `pr_created` hook regex — tracked separately in the 2026-06-19 "`pr_created` hook regex misses env-var/command-prefixed `gh pr create`" entry.

**What:** `AgentsService.deriveState` ends with `return 'finished'` (`packages/daemon/src/services/AgentsService.ts`) as the catch-all after `completedAt != null`, `exitCode == 0`, `!prMerged`, `!hasPrCreate`. So _any_ cleanly-completed run whose PR-create signal was missed renders as **finished** — a state that otherwise means "PR merged and cleaned up via `crew finish`". It silently masquerades a detection miss (or a genuinely PR-less run) as a successful close-out, with no visible distinction from a real finish. This is the second half of the 2026-06-03 status bug (CREW-31/32/174 showed `finished` instead of `pr_open`); the immediate fix only hardened the `hasPrCreate` matcher, leaving the fallthrough as a latent footgun for any other reason detection could miss.

**Why noticed:** Root-cause investigation of "three agents marked finished instead of pr_open" (this session). The matcher fix (broadening prefix-match → per-line "starts with `gh pr create`", shared helper `hasPrCreateInvocation` in crew-shared) addressed the reported incident. When asked whether to also harden the fallthrough, user chose "matcher only" — so this is the explicitly-deferred half.

**Anchors:** `packages/daemon/src/services/AgentsService.ts` `deriveState()` (the `return 'finished'` at the end); `crew-shared` `hasPrCreateInvocation`; the live transition twin in `IngestService.ts` `computeNextState` (where a completed-but-undetected run just stays `running`, _disagreeing_ with the list/getByKey display that shows `finished`). Branch `fix/pr-create-detection-cd-prefix`.

**What's been considered:**

- A completed `run`/`fix-pr` with no detected PR and no `finish` run is arguably `error` (it was supposed to open a PR and the signal we have says it didn't), or a distinct "completed, no PR" state — not `finished`.
- Note the cross-path inconsistency: the SQL-derived display (`AgentsService`) calls it `finished`, while the live tool-call machine (`computeNextState`) leaves it `running`. Whatever the resolution, these two should agree.
- Residual matcher gap (same area, cheap to fold in): `hasPrCreateInvocation` is per-line/start-anchored, so a _single-line_ `git push && gh pr create …` (no newline) still won't match. The dispatch prompt puts them on separate lines, so this isn't the observed failure, but it's the next brittle edge.

**Shape of work:** small, contained — decide the right terminal state for "completed, PR-create not observed", make `deriveState` + `computeNextState` agree on it, add the `&&`-chained matcher case. One ticket. Needs a design call on the state name before coding.

**Open questions:** Is "completed, no PR detected" really an error, or a legitimate no-op outcome (epic-guard exit, ticket already shipped — the prompt's `→ no-pr:` path)? If legitimate, `finished` may be defensible and the real fix is just surfacing _why_ (a distinct label/tooltip) rather than changing the state.

## 2026-05-11 — `idle` and `waiting` agent states not reachable from daemon fixtures

**Resolved 2026-06-19:** Closed by the concrete-state-triggers cutover (Epic [CREW-252](https://safturento.atlassian.net/browse/CREW-252), final task [CREW-257](https://safturento.atlassian.net/browse/CREW-257)). `idle` is now a real, reachable _current_ state (a clean `run_exited` with no PR; `reduceState`), and both `idle` and `waiting` project to their own badge via `TRANSITION_TO_AGENT_STATE` instead of collapsing to `running`. The daemon's `AgentState` union + the `/api/agents` `AgentStateEnum` gained `idle`/`waiting`; the dashboard already styled all states (`state-meta.ts`, `AgentRow`), so the badges are now exercised end-to-end rather than only via code paths. (Answer to the open question: `idle`/`waiting` _are_ expected as current states visible in the agents list, not just intermediate transitions.)

**What:** The dashboard's `AgentState` union has 7 values; `StateBadge` + `STATE_CLASSES` cover all 7. But the daemon's `deriveState` only produces 5 of them (`initializing`, `running`, `pr_open`, `error`, `finished`) from runs + tool_calls. `idle` and `waiting` come from explicit `state_transitions` rows that the dev seed never writes. Result: those two badges are typed and styled but can't be visually exercised in dev.

**Why noticed:** During the 2026-05-11 state-color migration verification. The dashboard renders 5 states cleanly; the migration's correctness for `idle`/`waiting` is verified only via code paths, not visually.

**Anchors:** `packages/daemon/src/services/AgentsService.ts:328-336` (`deriveState`); `packages/daemon/src/services/AgentsService.ts:45-52` (`StateTransitionState`); `packages/dashboard/src/data/state-meta.ts` (`STATE_CLASSES`); `packages/dashboard/src/components/StateBadge.tsx`.

**What's been considered:** Two paths — (a) Showcase route `#/dev/badges` renders all 21 StateBadge variants × intensities + CountBadge × 7 + AgentRow attention-tint examples statically. Independent of daemon state, ~30 min. (b) Seed-level fix — extend `dev.ts` to insert agents whose state arrives via `state_transitions` rows. Needs daemon-side understanding of when `idle`/`waiting` are emitted in prod. Larger scope.

**Shape of work:** Either ~30 lines for the showcase route, OR a daemon-side investigation + seed extension.

**Open questions:** Are `idle` and `waiting` ever expected to be the _current_ state of an agent (visible in the agents list) or only intermediate transitions visible in `StateHistoryBar`? If only transitions, the showcase route is sufficient.

## 2026-05-10 — Wire dashboard QuickAction buttons (Resume / Finish / Inspect / Provide input) to daemon endpoints

**Resolved 2026-06-16:** Shipped under Epic [CREW-208](https://safturento.atlassian.net/browse/CREW-208). The dashboard action layer (CREW-217) mounts `onAgentAction` in `App.tsx` and dispatches each kind through TanStack mutations; the host runner (CREW-216) executes the bounded verb set; New Run / Fix PR / Finish surfaces landed in CREW-218/219/220. Quick-action clicks are now wired end-to-end rather than no-oping.

**What:** CREW-119 landed the v2 quick-action buttons in the agents list (`Resume + Finish` for `idle`, `Provide input` for `waiting`, `View PR + Finish` for `pr_open`, `Inspect` for `error`). The buttons fire an `onAction(kind, agent)` callback up through `AgentRow → ProjectSection → AgentsList`, but `App.tsx` currently does **not** mount a handler — clicks no-op. The visual contract is shipped; the functional contract is not. Each action needs a daemon endpoint and a mutation hook that the App-level handler dispatches.

**Why noticed:** CREW-119 autonomous run on 2026-05-10. The original CREW-119 ticket scope was "visual fidelity sweep" — landing functional behavior for brand-new actions like `Resume` was out of scope (the daemon has no resume endpoint today), but landing the buttons visually wasn't.

**Anchors:**

- `packages/dashboard/src/components/AgentRow.tsx` — exports `QuickActionKind` (`resume | finish | view-pr | provide-input | inspect`)
- `packages/dashboard/src/App.tsx` — `<AgentsList … />` mount; add an `onAgentAction` prop
- `packages/daemon/src/routes/` — needs new endpoints (`POST /agents/:key/resume`, `/finish`, `/inspect`, `/answer`)
- `bruno/endpoints/agents/` — would gain four new `.bru` files

**What's been considered:**

- **Wire up incrementally as endpoints land.** Start with `finish` (closest to existing transcript completion), then `provide-input` (already partially supported), then `resume` and `inspect`.
- **Single `POST /agents/:key/action { kind }` endpoint** vs verb-per-action. Verb-per-action mirrors REST norms; single dispatcher centralizes permissions but loses semantic clarity.
- **Route through `useMutation` from TanStack Query** so optimistic updates + invalidation are uniform with the existing list query.

**Visual styling consistency note (added 2026-05-10):** the `Inspect` button on the latency row in frame `1:2` currently renders as solid red bg with dark text — drifted from the canonical pill pattern. When this ticket lands the dashboard handler, also pick a button styling pattern consistent with the StateBadge tinted-bg approach OR explicitly decide it should be a solid destructive shadcn `Button` variant.

**Shape of work:** Likely two tickets — one daemon-side (add four endpoints + matching `.bru` files) and one dashboard-side (mount `onAgentAction` in `App.tsx`, wire each kind through TanStack `useMutation`, surface success/error toasts). Both can run in parallel after the endpoint contracts are settled.

**Open questions:**

- [ ] Does `inspect` need its own daemon-side action or is "open the agent drawer focused on the error transcript" enough?
- [ ] Should `resume` from `idle` reuse the `crew run` codepath or be a separate "rehydrate" verb?

## 2026-05-08 — Surface `crew finish` step results in the dashboard

**Resolved 2026-06-16:** Shipped under Epic [CREW-208](https://safturento.atlassian.net/browse/CREW-208). Finish-step contracts landed in CREW-213 (shared `finish-step` types/schemas), daemon intake in CREW-215 (finish-step HTTP path → EventBus → SSE), and emission + the drawer step checklist in CREW-220 — `finish.ts`'s `step()` helper now flows per-step ok/skip/error results through to the drawer.

**What:** `crew finish` from the CLI prints a structured checklist as it runs — `step()` (`packages/cli/src/commands/finish.ts:120-132`) wraps each cleanup operation and emits a green ✓ on success or yellow ! on skip/warn. None of this flows to the daemon. Once finish lands, the dashboard's only signal is the agent's terminal state — there's no record of which steps succeeded, which were skipped, or what failed and why. The drawer should expose a per-step checklist with the same success/skip/error semantics.

**Why noticed:** 2026-05-08 conversation triaging finish-related bugs in CREW-94. While walking through "finish runs have no transcript by design", the user pointed out that finish _does_ have an observable surface — the CLI's structured output — it just isn't piped through the daemon.

**Anchors:**

- `packages/cli/src/commands/finish.ts:120-132` — `step()` helper, the natural emit point for per-step events
- `packages/cli/src/commands/finish.ts:226-235, 301-315` — current daemon parity (registerRun + completeRun only)
- `packages/daemon/src/services/EventBus.ts` — natural place to publish per-step events on the SSE firehose
- `packages/dashboard/src/components/AgentBody.tsx` — where step results would render
- `packages/shared/src/transcripts/` — schema would land here if finish steps are modeled as a new event type
- [CREW-116](https://safturento.atlassian.net/browse/CREW-116) — prerequisite bug-fix ticket

**What's been considered:**

- **Per-step SSE events.** New `finish-step` event type in `crew-shared` with `{ runId, step, status, message? }`. CLI emits via existing daemon HTTP client; daemon publishes to EventBus → dashboard subscribes via slice-1c's `CrewEventStream`. Live-updating checklist. Most consistent with slice 1c.
- **Per-step rows in a new `finish_steps` table.** CLI POSTs each step result; daemon writes a row; drawer queries at open time. Simpler. Doesn't stream live, but finish completes in tens of seconds.
- **Bundled completion payload.** CLI accumulates results, sends all at once. Cheapest. If finish hangs mid-step, dashboard sees nothing until completion or timeout.

The SSE shape feels right — matches slice 1c's "live updates" feel.

**Shape of work:** One ticket, depends on CREW-116 so finish runs are correctly modeled before adding more surface. Author the new event type in `crew-shared`, add a daemon endpoint, emit from `finish.ts`'s `step()` helper, render in the drawer alongside the timeline.

**Open questions:**

- Drawer layout: inline (between StateHistoryBar and Timeline) vs dedicated panel?
- Pre-existing finish runs in the DB will have no step data. Drawer should render nothing rather than an empty state.
- Distinguish skip vs error in the schema (CLI uses `warn()` for both). Schema should have three states (success/skip/error).

## 2026-06-08 — Hook command paths in settings.json were relative, breaking on cwd drift

**Resolved 2026-06-08:** Changed both `PreToolUse` hook commands in `.claude/settings.json` from `./packages/cli/scripts/hooks/<name>.sh` to `$CLAUDE_PROJECT_DIR/packages/cli/scripts/hooks/<name>.sh`, and documented the absolute-path convention in `.agents/dispatch.md` (§Verification gates) so future hook registrations follow it. Shipped in this same PR. (#351)

**What:** Both crew `PreToolUse` hooks — `visual-fidelity-pr-gate.sh` (matcher `Bash`) and `update-config-reminder.sh` (matcher `Edit|Write`) — were registered with `./`-relative command paths. Claude Code resolves a hook `command` against the shell's _current working directory_, not the project root, so the moment a session's cwd drifts out of the worktree root the path stops resolving: `/bin/sh: 1: ./packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh: not found` (exit 127, non-blocking). The gate silently no-ops — i.e. the visual-fidelity PR gate is _disabled_ exactly when cwd has wandered. The script's own header comment already flagged the subdir-failure case; this makes the registration robust to it.

**Why noticed:** A `gh pr create` for an unrelated `~/dotfiles` change surfaced a `PreToolUse:Bash hook error` line in chat. The session's Bash cwd had drifted to `~/dotfiles` (a persistent `cd` earlier in the session), so crew's relative-path gate resolved against dotfiles and 127'd. Ironically the non-blocking failure let the dotfiles PR through unchecked; with cwd at the crew root the same gate would have fired (and correctly blocked, since no `visual-fidelity-check` ran). Confirmed the cause empirically: `pwd` returned `/home/safturento/dotfiles` mid-session.

**Anchors:** `.claude/settings.json` (PreToolUse hooks); `packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh` + `update-config-reminder.sh`; `.agents/dispatch.md` §Verification gates; Claude Code hook env var `$CLAUDE_PROJECT_DIR`. Sibling resolved entry: "2026-06-05 — Global doc-parity hook double-warns in crew".

## 2026-05-24 — `CREW_STARTUP_EVENTS_DIR` bypasses `DaemonConfig` and reads `process.env` directly inside `app.ts`

**Resolved 2026-06-08:** Folded `startupEventsDir` into `DaemonConfig` (CREW-236). `config.ts` now carries `CREW_STARTUP_EVENTS_DIR` in the zod schema (default `process.env.CREW_STARTUP_EVENTS_DIR ?? join(homedir(), '.crew', 'startup')`) and exposes it as `config.startupEventsDir`; `app.ts` onReady reads `config.startupEventsDir` instead of `process.env`. `config.test.ts` covers the new field (default + override); `events.test.ts`'s manual env-var dance is gone (it now passes the dir through `parseDaemonConfig({ CREW_STARTUP_EVENTS_DIR: ... })`); the package-level `src/test/setup.ts` pin stays as the blanket safety net (the schema default consults `process.env` so it still flows through for tests that build config from a partial env object). (#350)

**What:** The onReady hook in `packages/daemon/src/app.ts:112` reads `process.env.CREW_STARTUP_EVENTS_DIR ?? join(homedir(), '.crew', 'startup')` directly, instead of going through `parseDaemonConfig` like `CREW_CONFIG_DIR` and `CREW_DB_FILE` do. Every test that builds the app via `buildApp` has to either (a) accept that the chokidar watcher will scan the developer's real `~/.crew/startup` and replay historical startup events into the EventBus, or (b) set the env var manually around its `setupApp`. The route-level `events.test.ts` was hit by (a) until 2026-05-24 — a fresh subscriber received a leaked startup event instead of the one the test had just published (UUID mismatch). Worked around in-test; the architectural fix is to fold `startupEventsDir` into `DaemonConfig` so `parseDaemonConfig({ CREW_STARTUP_EVENTS_DIR: ... })` is the single source of truth and tests just override it the way they already override config/db paths.

**2026-06-06 update:** the _test-side symptom_ is now handled package-wide — PR #343 added a daemon `vitest.config.ts` whose setup file pins `CREW_STARTUP_EVENTS_DIR` at a fresh empty temp dir, so no test scans the developer's real `~/.crew/startup`. This entry stays open for the **architectural** fix it actually describes: folding `startupEventsDir` into `DaemonConfig` (the setup file is a harness workaround, not the single-source-of-truth wiring). The "Daemon test suite flakes under full-parallel `test:run`" followup — the runtime symptom of this same gap — is now Resolved by #343.

**Why noticed:** Debugging the pre-existing `events.test.ts > streams a published event with correct id/event/data framing` failure during a "address the test failures agents keep mentioning in PRs" sweep. Conversation 2026-05-24; the test fix landed in `fix/daemon-events-test-isolation`, but the root cause is that one env var escaped the config layer.

**Anchors:** `packages/daemon/src/app.ts:105-118` (onReady hook), `packages/daemon/src/config.ts` (`parseDaemonConfig` — needs the new field), `packages/daemon/src/services/IngestService.ts` (`watchStartupEvents` consumer), `packages/daemon/src/routes/events.test.ts` (current workaround at `setupApp`).

## 2026-06-06 — `dialog` / `popover` animation classes are inert (no tailwindcss-animate plugin)

**Resolved 2026-06-08:** Adopted `tw-animate-css` (the Tailwind v4 successor to `tailwindcss-animate`) — added the dep to `packages/dashboard` and `@import 'tw-animate-css';` after the Tailwind import in `index.css`, lighting up every existing `animate-in` / `fade-in-0` / `zoom-in-95` / `slide-*` class at once. Dialog, popover, and alert-dialog now visibly animate (verified the utilities emit into the built CSS — they were dead no-ops before). `Drawer.tsx` migrated off its bespoke `animate-drawer-*` / `animate-overlay-*` classes onto the standard `slide-in-from-right` / `slide-out-to-right` (panel) + `fade-in-0` / `fade-out-0` (overlay), preserving the prior 300ms-in / 200ms-out timing and decelerating easing; the custom `drawer-*` / `overlay-*` keyframes + `--animate-*` vars were removed from `index.css` (`att-pulse` kept). (CREW-237)

**What:** `packages/dashboard/src/components/ui/dialog.tsx` and `popover.tsx` carry `data-[state=open]:animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`, etc. — the standard shadcn animation classes. But the project has **no** `tailwindcss-animate` (Tailwind v3) or `tw-animate-css` (Tailwind v4) plugin installed and no `@plugin`/`@import` for one in `index.css`, so those utilities don't exist and the classes are dead no-ops. The Modal/AlertModal/Popover surfaces currently pop in/out with no animation.

**Why noticed:** Building the CREW-232 `Drawer` composite (PR for the Radix-Dialog drawer migration), I went to reuse `slide-in-from-right` for the drawer's enter/exit and found the utility undefined. Worked around it by defining custom `drawer-in`/`drawer-out`/`overlay-in`/`overlay-out` keyframes + `--animate-*` theme vars in `index.css` (matching the existing `att-pulse` pattern) — so the drawer animates, but the broader dead-class problem remains for the other overlays.

**Anchors:** `packages/dashboard/src/components/ui/dialog.tsx`, `packages/dashboard/src/components/ui/popover.tsx`, `packages/dashboard/src/index.css` (`@theme` `--animate-*`, `@keyframes`), `packages/dashboard/package.json` (no animate dep).

**What's been considered:** Two clean directions — (a) adopt `tw-animate-css` (the Tailwind v4 successor) via `@import 'tw-animate-css'` in `index.css`, which lights up every existing `animate-in`/`slide-*` class at once (so all modals/popovers start animating — a visual change to audit); or (b) strip the dead classes and define only the handful of custom keyframes actually wanted, per-surface (the path the Drawer took). (a) is less code but a broader behavior change; (b) is explicit but more verbose.

**Shape of work:** small — one decision (adopt-plugin vs strip-and-define) plus the follow-through. If (a), audit the now-live modal/popover animations for jank. Out of scope for the drawer PR, which only needed its own keyframes.

## 2026-06-05 — Preflight fail-fast order surfaces `bruno-skeleton` before `excluded-commands` (red test on main)

**Resolved 2026-06-06:** The merge resolution was correct — `registry.ts`'s `ALL` order is intentional (`brunoSkeleton` is grouped with the scaffold checks, ahead of the CREW-226 P2 `excludedCommands`). The drift lived only in the test: it enables `bruno_smoke` against an empty worktree (so `excluded-commands` has a required entry to miss), which now also trips `bruno-skeleton` first. Fixed by scaffolding a `bruno/bruno.json` in the test worktree so `bruno-skeleton` passes and `excluded-commands` is again the asserted first fail. No product change. (#342)

**What:** `packages/cli/src/lib/preflight/run-preflight.test.ts` > "drives the real registry by default: a missing settings.json fails excluded-commands" is **failing on `main`** (verified at base commit `7ca8d32`, independent of CREW-228). The test builds a config with `bruno_smoke` enabled and neither a `bruno/` skeleton nor a `.claude/settings.json`, then asserts `runPreflight` throws `PreflightError(checkName: 'excluded-commands')`. But `registry.ts`'s `ALL` array now orders `brunoSkeleton` (index 3) ahead of `excludedCommands` (index 8), and the fail-fast adapter throws on the _first_ fail — so it throws `bruno-skeleton` instead. Either the registry order or the test's expectation drifted when T3 (CREW-226) and T4 (CREW-227) merged their registry entries in different orders.

**Why noticed:** Running the cleanliness sweep (`npm run test:run`) during CREW-228 (the `crew doctor` command, which doesn't touch `registry.ts` or preflight). The failure reproduces at the base commit before any CREW-228 work, confirming it is pre-existing and out of this ticket's scope. (Independently re-confirmed during CREW-229 / T6 `crew init` — same single failure, touching none of `preflight/`, `registry.ts`, or this test.)

**Anchors:** `packages/cli/src/lib/health/registry.ts` (the `ALL` order); `packages/cli/src/lib/preflight/run-preflight.test.ts:82`; `packages/cli/src/lib/health/checks/bruno-skeleton.ts` (fails when `bruno_smoke.enabled` and no skeleton present); CREW-226 (T3, preflight adapter), CREW-227 (T4, the six checks). `git checkout 7ca8d32 -- … && npx vitest run preflight/run-preflight` reproduces.

## 2026-06-04 — Daemon test suite flakes under full-parallel `test:run`

**Resolved 2026-06-06:** Root cause was **not** the speculated SQLite-tmpdir/port fixture race below. The full-app route tests build the app via `buildApp`, whose `onReady` hook starts a chokidar watcher on the startup-event dir; with `CREW_STARTUP_EVENTS_DIR` unset it defaulted to the developer's real `~/.crew/startup`, and chokidar's initial scan (`ignoreInitial:false`) replayed every historical `<key>.jsonl` through `IngestService` — a burst of synchronous better-sqlite3 writes that starved later `app.inject` calls and tripped the 5s timeout (deterministic on any machine whose `~/.crew/startup` is non-empty; CI's is empty, hence green there). Fixed package-wide by a daemon-local `vitest.config.ts` whose setup file pins `CREW_STARTUP_EVENTS_DIR` at a fresh empty temp dir. (#343) The deeper architectural fix — folding `startupEventsDir` into `DaemonConfig` — stays tracked in the open "`CREW_STARTUP_EVENTS_DIR` bypasses `DaemonConfig`…" followup.

**What:** Running the daemon vitest suite at full parallelism (35 files at once, as `npm run test:run` does) produces non-deterministic failures: across consecutive runs I saw `routes/runner.test.ts > tails the last N lines` fail alone, then it + `routes/runs.test.ts > returns 409 when already completed`, then a single failure again — while every one of those tests passes 3/3 in isolation. The failing _set_ changes run-to-run with no code change, and the slow case clocked ~7.7s for a normally-instant route test, pointing at resource/timing contention rather than a logic bug.

**Why noticed:** During CREW-222 verification (a CLI-only change touching zero daemon files), `npm run test:run` went red on daemon route tests. Investigation (systematic-debugging) proved the diff touches only `packages/cli`, the daemon binary is byte-identical to origin/main, the tests pass in isolation, and the failing set is non-deterministic — i.e. pre-existing environmental flakiness, not a regression from CREW-222.

**Anchors:** `packages/daemon/src/routes/runner.test.ts`, `packages/daemon/src/routes/runs.test.ts`; root `package.json` `test:run` (cross-workspace vitest). Repro: `cd packages/daemon && npx vitest run` a few times on WSL.

## 2026-06-05 — Global doc-parity hook double-warns in crew (two parity warnings per commit)

**Resolved 2026-06-05:** Removed crew's repo-local `doc-parity-gate.sh` registration from `crew/.claude/settings.json` in favour of the global hook. Diffing the two confirmed the global hook (`~/.claude/hooks/doc-parity-gate.sh`, tracked in dotfiles) is a **strict superset** — identical `.agents/` `covers:` parity logic, plus a README-freshness nudge and extra merge-base fallbacks — so crew loses nothing and gains the README check. The repo-local script + its test stay in-repo (now unregistered) as a portable, re-registerable fallback.

**What:** The user-level `~/.claude/hooks/doc-parity-gate.sh` fired on every `git commit` / `gh pr create` in every repo — including crew, which already wired its own repo-local `doc-parity-gate.sh` via `crew/.claude/settings.json` — so crew commits triggered two soft doc-parity warnings, one from each hook.

**Anchors:** `~/.claude/hooks/doc-parity-gate.sh` (global, from `~/dotfiles/claude/hooks/`); `packages/cli/scripts/hooks/doc-parity-gate.sh` + `.test.sh` (crew repo-local, CREW-163, now unregistered); `crew/.claude/settings.json` PreToolUse Bash hooks.

## 2026-06-03 — Wire CREW-136 `Switch` into the Timeline live toggle

**Resolved 2026-06-03:** Shipped under [CREW-212](https://safturento.atlassian.net/browse/CREW-212). `LiveModeToggle.tsx` now renders the DS `Switch` (`ui/switch.tsx`) + a "Live" label associated via `htmlFor`, replacing the bespoke `<button role="switch">` with hand-rolled emerald styling. Behaviour is preserved (Radix `Switch.Root` exposes `role=switch` / `aria-checked`; the existing toggle tests pass) and a new test asserts `[data-slot="switch"]`. The custom emerald active styling was dropped in favour of the DS Switch's on-state colour (option (a) — swap the whole control for `<Switch>` + label).

**What:** CREW-136 added a shadcn `Switch` primitive to the dashboard but wired it to no caller. The Timeline's "Live" toggle is the intended consumer — today it's a bespoke `<button role="switch">` in `LiveModeToggle.tsx` with hand-rolled emerald styling + a CSS status dot, predating the Switch component. Replace it with the DS `Switch` so the live toggle stops hand-rolling its own switch UI.

**Why noticed:** Verifying the Batch B PRs before merge. CREW-136's Switch landed (PR #305) with no live caller; the obvious home is the Timeline live toggle, which still rolls its own.

**Anchors:** `packages/dashboard/src/components/Timeline/LiveModeToggle.tsx` (bespoke `role="switch"` button to replace); `packages/dashboard/src/components/ui/switch.tsx` (the CREW-136 Switch, now on main); `Timeline.tsx:349` (`<LiveModeToggle active={liveMode} onChange={onLiveModeChange} />`); CREW-136.

**What's been considered:** The existing control carries a "Live" text label + status dot, not a bare switch. Decide whether to (a) swap the whole control for `<Switch>` + a "Live" label, matching the Figma form-switch, or (b) keep the labelled-pill affordance but build it on the Switch primitive. The emerald active styling is custom — reconcile against the DS Switch on-state colour.

**Shape of work:** Small — one component swap in `LiveModeToggle.tsx` + its test, plus a visual-fidelity pass against the Figma Switch. Likely folds into one "Timeline toolbar polish" ticket with the sticky-overlap fix below.

**Open questions:** Does the Figma DS define a labelled "Live" switch variant, or just the bare Switch? If bare, the "Live" label + dot composition stays a caller-side decision.

## 2026-06-03 — Sticky Timeline toolbar overlaps the minimap stripe + scrollbar

**Resolved 2026-06-03:** Shipped under [CREW-212](https://safturento.atlassian.net/browse/CREW-212). The toolbar was lifted out of the scroll viewport (option (b)): it now renders as a non-sticky `shrink-0` flex child above the scroll `div`, and the scroll `div` + `MinimapStripe` are wrapped in their own `relative flex min-h-0 flex-1 flex-col` box so the minimap and native scrollbar span only the event list. `onSectionJump` was simplified to `target.offsetTop` now that no sticky header sits inside the viewport. The two `Timeline.test.tsx` toolbar tests were updated to assert the toolbar is outside the (single) `overflow-y-auto` viewport and not sticky.

**What:** When the Timeline toolbar was refactored to `sticky top-0` (so it pins while the event list scrolls), it began overlapping two full-height siblings: the `MinimapStripe` (right-edge section-nav stripe) and the scroll container's native scrollbar (gutter `stable`). Both run from y=0 of the scroll area, so their top region renders under the pinned toolbar instead of starting below it.

**Why noticed:** Manual verification of the Batch B Timeline work before merge — the sticky toolbar visibly collides with the minimap stripe + scrollbar at the top of the drawer / agent-page timeline.

**Anchors:** `Timeline.tsx:198-260` — outer `relative flex h-full` wraps the scroll `div` (`ref=scrollRef`, `overflow-y-auto`, `scrollbarGutter: 'stable'`, lines 201-202), the `sticky top-0 z-10` `TimelineToolbar` (lines 204-206), and the `MinimapStripe` sibling (lines 254-260); `packages/dashboard/src/components/Timeline/MinimapStripe.tsx` (`SCROLLBAR_GUTTER = 14`, positioning).

**What's been considered:** Candidate fixes — (a) offset `MinimapStripe`'s top by the toolbar height so it starts below the pinned toolbar; (b) move the toolbar out of the scroll container (sibling above it) so the scrollbar + minimap span only the event list — changes the sticky semantics but is the cleanest structurally; (c) opaque toolbar background masking the overlap (partial — doesn't fix the native scrollbar). Leaning (b).

**Shape of work:** Small-to-medium layout fix in `Timeline.tsx` + `MinimapStripe.tsx`; verify sticky behaviour still works and the minimap still aligns to sections. Pairs with the Switch-wiring followup above as "Timeline toolbar polish."

**Open questions:** Should the toolbar stay inside the scroll container (sticky) or move above it (scroll area then covers only the list)? That decides whether the minimap/scrollbar need a top offset or naturally clear the toolbar.

## 2026-05-19 — `crew figma-snapshot` has no per-node refresh

**Resolved 2026-06-03:** Shipped. `crew figma-snapshot` now has a `--node-id <id>[,<id>...]` flag for selective per-node refresh (option (a) from "What's been considered") — see `packages/cli/src/commands/figma-snapshot.ts` (the `--node-id` option, mutually exclusive with `--check`). The auto-detecting `--changed-since` variant (option (b)) was not built; the related "`--check` reports false STALE on whole-file churn" concern is now tracked separately by [CREW-174](https://safturento.atlassian.net/browse/CREW-174) (content-scoped freshness). The disproportionate full-export cost for the common single-node case is resolved.

**In-session blocker:** scoped for in-session brainstorm + implementation immediately after the AgentRow card-redesign spec lands. Hard prereq before the AgentRow `crew run` dispatches.

**What:** `crew figma-snapshot` only supports `--check` (boolean staleness) and a full page-walk export. A one-component Figma edit invalidates the committed snapshot in exactly one place but forces a full export + per-node enrichment-batch dance through `figma-use` to re-land it. Most refreshes in practice are single-node touch-ups; the full-document cost is disproportionate.

**Why noticed:** Mid-session, refreshing the committed snapshot after a small AgentRow Figma edit. Paused from AgentRow card-redesign brainstorming to handle the refresh and noticed the lack of selective export. Tooling cost compounds as the DS grows.

**Anchors:** `packages/cli/src/commands/figma-snapshot.ts` (CLI flag handling — only `--check` today); `packages/cli/src/lib/figma-snapshot/emit.ts` (page-level walk in `emitSnapshot`); `.claude/skills/figma-snapshot-refresh/` (skill procedure that batches `use_figma` enrichment).

**What's been considered:** Two flag shapes. (a) `--node-id <id>[,<id>...]` — explicit per-node refresh; caller has to know what changed but it's mechanical. (b) `--changed-since` — compares live Figma file's per-node `lastModified` against committed `meta.json` and re-exports only nodes that moved; auto-detecting. Both touch the same code paths.

**Shape of work:** Single ticket. CLI flag plumbing + emit-side node filter + skill-procedure update + at least one test fixture for the partial-refresh case. Probably half a day.

**Open questions:** Does the Figma REST API surface per-node `lastModified` reliably for every node type? If not, `--changed-since` degrades into a manifest-diff approach.

## 2026-05-13 — visual-fidelity-check accuracy: snapshot lacks `componentProperties` (REST API limit) + calibration pattern≠specific finding pattern

**Resolved 2026-06-03:** Epic [CREW-148](https://safturento.atlassian.net/browse/CREW-148) (render-frame-as-canonical-truth) shipped Done — children CREW-149 (skill moved to `.claude/skills/`), CREW-150 (enrichment captures nested-instance overrides incl. `componentProperties`/variant data), CREW-151 (skill content: render-frame Step 4 + live-DOM Step 5), CREW-152 (DS fixture refresh + gate validation vs PR #193). The structural data gap is closed by the enrichment pass; the LLM-hedge / specifically-wrong-fix pattern is addressed by the render-frame canonical-truth model + the chrome live-DOM Step 5 (CREW-146 / CREW-184). Both calibration findings resolved.

**What:** Two coupled gaps in the `visual-fidelity-check` workflow, both Epic CREW-148-tracked.

1. **Structural data gap.** The REST `/v1/files/{key}` endpoint returns the node tree but **does not expose `componentProperties` on `INSTANCE` nodes** (the props that tell you which variant the instance is using — e.g. `intensity: "mid"` on a Pill instance, `color: "waiting"`). Variable bindings on paint properties are similarly absent. That data is only available via the Figma Plugin API. The per-screen `<id>.json` emitted by the snapshot tells you "there's a Pill instance here" but not "it's the `mid/waiting` variant" — the caller-check step has to fall back to text-narrative inference instead of mechanical comparison.
2. **Calibration finding.** Two calibration runs of the skill against the CREW-135 fixture revealed a consistent pattern: the skill catches the _type_ of every visual regression but produces _specifically wrong_ fixes when the snapshot lacks per-instance `componentProperties`. Examples: skill recommended `lucide/arrow-up-right` for View PR (real Figma instance was `lucide/git-pull-request`); flagged New Run button as helper-level "wrong shade" when real bug was caller-side wrong color enum; twice downgraded a CSS-span-vs-lucide-circle mismatch to a "judgment call" despite iterated "icon findings are NEVER judgment calls" rule.

The first two examples resolve once the structural fix lands. The third is a skill-prompt + visual-diff capability question — even with perfect snapshot data, an LLM reading "code uses CSS span, Figma uses lucide/circle" without seeing the rendered result will likely keep hedging.

**Why noticed:** First calibration of the `visual-fidelity-check` skill against the CREW-135 fixture (run: `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/runs/2026-05-12-run-01.md`) — verification gap surfaced. After CREW-139 merged with REST-based JSON emission, the JSON exists but lacks the field that would close the gap. Subsequent run-02/run-03 + user-in-the-loop review confirmed the pattern: type-correct findings, specifically-wrong fixes.

**Anchors:**

- `packages/cli/src/lib/figma-snapshot/emit.ts` — REST-based emitter
- `packages/cli/src/lib/figma-snapshot/client.ts` — REST client (file + images endpoints only)
- `~/.claude/skills/visual-fidelity-check/{SKILL.md,workflow.md,examples/}`
- `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/` — fixture with corrected ground truth
- [PR #180](https://github.com/Safturento/crew/pull/180) — CREW-139 merge
- `docs/superpowers/specs/2026-05-12-agent-visual-verification-design.md` — "Dependency on Figma access" section
- Figma REST API docs: [files endpoint](https://www.figma.com/developers/api#get-files-endpoint) — `componentProperties` documented as Plugin-API-only

**What's been considered:**

- **Plugin-API-based emitter via Claude Code MCP bridge.** Shell out from `crew figma-snapshot` to a one-shot `claude` invocation that runs the Figma Plugin API. Adds process-orchestration but gives full data fidelity — `componentProperties`, `boundVariables`, computed paint resolution.
- **Hybrid: REST for screenshots + simple data, Plugin API for instance-level enrichment.** Two-stage. Smaller blast radius, more code paths.
- **Re-iterate the skill once Plugin-API snapshot lands.** Re-run calibration against the CREW-135 fixture (updated with ground truth). Verify specifics now resolve correctly.
- **Screenshot-vs-Figma ultimate test.** Calibration where the skill receives multiple screenshots of the CREW-135 rendered dashboard + the corresponding Figma references and enumerates **every** visible difference. Exercises Step 5 (visual check). Sharpening the visual-check section to a rigorous enumeration with vision-LLM-style observation listing. May surface gaps the structural+caller checks can't catch.

**Shape of work:** Three threads — (1) Plugin-API snapshot implementation (~1-day, decide full-replacement vs hybrid). (2) Re-iterate the skill once Plugin-API snapshot lands. (3) Author the screenshot-vs-Figma ultimate-test calibration once (1) lands. Update per-component JSON shape: add `instanceProperties` to instance nodes, add `tokenAlias` to paint entries.

**Open questions:**

- How aggressive should the LLM-hedge counter be in the skill prompt? May need automated visual-diff backing rather than prompt-only enforcement.
- Should the ultimate test fixture include rendered HTML/CSS in addition to screenshots, so structural assertions can be machine-verified alongside the visual enumeration?
- Is the Plugin-API path reliable enough to make default, or should it remain opt-in?
- Could we cache Plugin-API enrichment data (file-version keyed) to avoid the Claude shell-out on every dispatch?

## 2026-05-11 — Crew DS is partial vs Dashboard Screens; Timeline container + Bash event tags missing

**Resolved 2026-06-01:** Verified shipped. The Timeline-container composites this entry's open scope called for now exist in both Figma and code — `TimelineSection`, `TranscriptRow`, `TokenBarRow`, `TokensByTool`, and `DrawerHeader` (built in the 2026-05-21 drawer redesign) all have `.figma.tsx` Code Connect files, and the Screens drawer (`1:378`) + AgentPage (`1:1900`) were migrated to `AgentBody` instances under Epic **[CREW-177](https://safturento.atlassian.net/browse/CREW-177)**. The components this entry named were superseded by that redesign: `EventCard` → `TranscriptRow`, `FilterChips` → the Filters dropdown ([CREW-187](https://safturento.atlassian.net/browse/CREW-187) / [CREW-203](https://safturento.atlassian.net/browse/CREW-203)). The broader "Crew DS components are skeletons vs Screens" concern is likewise closed — `AgentRow` ([CREW-176](https://safturento.atlassian.net/browse/CREW-176)), `TopNav`, `ProjectRow`, `ProjectSection`, `ProjectHeader`, and `AgentBody` all now have real composites + `.figma.tsx`. The per-tool-color piece shipped earlier via CREW-192 (closed Epic CREW-189). Only sliver left — no standalone `.figma.tsx` for the `TimelineToolbar` sub-parts (Search / Live toggle / Filters) — is trivial Code-Connect housekeeping, not Epic-worthy.

**Original context:** Crew Dashboard Screens had an "agent activity timeline" composition (collapsible state-header + list of tool-call events) with no Crew DS counterpart; more broadly, several Crew DS components were simpler skeletons than the rich Screens equivalents (agent rows, top-nav, project rows). The leaf event-tag pills (`TimelineTag`, 7 tool variants) were realized 2026-05-12, before the 2026-05-21 redesign delivered the container composites.

## 2026-05-23 — TokensByTool Figma component lacks the Cost column shipped in CREW-195

**Resolved 2026-06-01:** Added the Cost column to the Crew DS `TokensByTool` component (`577:643`) and its `TokenBarRow` child (`555:449`) in Figma file `9FeJPriqdsdA4n9R5Xsrr8` — a new `cost` TEXT property + right-aligned per-row cost cell (Fira Code, foreground token), a `COST` header label, and a `totalCost` grand-total cell in the footer. The reference is now the 5-column layout matching CREW-195's shipped code (Tool / Tokens / Bar / Share / Cost). Committed snapshot `.crew/figma-snapshot/composites/577-643.{json,png}` + `555-449.{json,png}` refreshed in the same PR. Done in-session as part of the CREW-189 Epic close-out.

**What:** CREW-195 added a Cost column + grand-total cost cell to `TokensByTool`; the Figma reference at node `577:643` was still the 4-column pre-CREW-195 design (Tool / Tokens / Bar / Share), flagged by `visual-fidelity-check` as a verification gap (not a regression).

**Anchors:** `.crew/figma-snapshot/composites/577-643.{json,png}`, `packages/dashboard/src/components/TokensByTool.tsx`, `packages/dashboard/src/components/TokenBarRow.tsx`, `docs/visual-fidelity-reports/CREW-195.md`.

## 2026-05-23 — Drawer Timeline still rendering EventCard, not Figma-spec TranscriptRow

**What:** CREW-187 (PR #264) shipped the Timeline UX expansion (Filters dropdown, tool aliasing, Slim 5 categories) but explicitly left the per-event renderer alone — the drawer Timeline still rendered events via the old `EventCard` + `renderers/*Card` tree, which didn't match the Figma `2026-05-21` drawer redesign (one horizontal Tag · text · meta row per content block at node `553:445`).

**Why noticed:** Post-merge review of PR #264 on 2026-05-22 against Figma `220:246` (AgentBody) and `553:445` (TranscriptRow). The visible mismatch: EventCard's two-line stacked layout with its own pad+border framing vs. Figma's single-row Tag + truncated text + right-aligned meta. Ticketed as CREW-188 the same day.

**Anchors:**

- `packages/dashboard/src/components/Timeline/Timeline.tsx` — call site that swapped `<EventCard>` for `<TranscriptRow>`
- `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` — new composite (created in this PR)
- Figma node `553:445` (TranscriptRow), captured in `.crew/figma-snapshot/composites/553-445.{json,png}`
- Predecessor: CREW-187 / PR #264 / commit `6a88075`

**Resolved 2026-05-23:** TranscriptRow composite shipped, drawer Timeline now matches Figma 553:445 spec. The old `EventCard` + `renderers/` directory was deleted wholesale — only call site was `Timeline.tsx`. Per-block iteration preserved (an assistant turn carrying text + thinking + tool_use still renders as three rows). Slim 5 categories drive Tag colour (conversation→running, tools→waiting, thinking→pr_open, hooks-and-skills→initializing, system→idle); error tones override on `tool_result.is_error`, `system/api_error`, and `hook_non_blocking_error`. Note: the original CREW-188 ticket cited `318:230` and `558:477` as the TranscriptRow / drawer node IDs — those actually point at `Input` and `TimelineToolbar`. Real node IDs are `553:445` (TranscriptRow) and `594:803` (DrawerHeader). Ticket body kept the misleading IDs; the implementation followed the snapshot.

## 2026-05-13 — Agent drawer / agent page search input missing leading magnifying-glass icon

**What:** The search input above the event timeline on Agent Drawer (`1:756`) + Agent full page (`1:1900`) Figma frames has a `Has Icon=true, Icon=lucide/search` leading-icon configuration. The dashboard code (`components/Timeline/SearchBar.tsx`) renders the same input as a bare `<input type="search">` with placeholder text only — no leading icon SVG. Once CREW-136 (T2 Form composites) lands the `leadingIcon` prop on `Input`, the caller needs to be updated to pass `leadingIcon={<Search />}`.

**Why noticed:** 2026-05-13 ultimate-test visual comparison. Verified 2026-05-21: `Timeline/SearchBar.tsx` is bare `<input>`, no icon.

**Anchors:**

- `packages/dashboard/src/components/Timeline/SearchBar.tsx` — current bare-input implementation
- CREW-136 (T2 Form composites) — adds the `leadingIcon` prop to `Input`
- Figma instance: search input field on agent drawer + agent page screens

**Resolved 2026-05-22:** CREW-187 added a `leadingIcon?: ReactNode` prop to the DS `Input` primitive (`packages/dashboard/src/components/ui/input.tsx`) and refactored `Timeline/SearchBar.tsx` onto it with `leadingIcon={<Search aria-hidden />}` — search input now matches Figma `558:477` / `318:230`.

## 2026-05-13 — Agent drawer Close button uses Unicode "✕" glyph instead of `lucide/x` SVG

**What:** The Close button at the top-right of the Agent Drawer declares `Icon=lucide/x` in its componentProperties — the polish-pass session on 2026-05-12 migrated the Figma side to use the proper SVG. The dashboard's drawer code (`routes/AgentDrawer.tsx:42`) still renders `Close ✕` (Unicode glyph) inline, not the lucide SVG. Same class of bug as the View PR / Open as page Unicode-arrow issue caught in CREW-135 F5, but on a different button.

**Why noticed:** 2026-05-13 ultimate-test visual comparison (screen 2 — agent drawer header). Verified 2026-05-21: `routes/AgentDrawer.tsx:42` still has `Close ✕`. Skill's calibration runs never surfaced this because the drawer Close button isn't in CREW-135's diff.

**Anchors:**

- `packages/dashboard/src/routes/AgentDrawer.tsx:42` — `Close ✕`
- Figma instance: `387:2566` on the agent-drawer screen — `componentProperties: { type: "button-icon-sm", color: "running", intensity: "ghost", Icon: { name: "lucide/x" } }`
- Polish-pass conversion: 2026-05-12 Figma DS polish session

**Shape of work:** Small — one or two file edits. Replace the inline `Close ✕` with `<X aria-hidden />` from `lucide-react`. The Button base class already sizes child SVGs to `size-4` for normal buttons / `size-3` for xs sizes.

**Open questions:** None. Drop-in fix.

**Resolved 2026-05-22:** Close moved into `DrawerHeader`'s `lucide/x` pill in CREW-179; the standalone `Close ✕` Unicode button on `AgentDrawer.tsx` was deleted as part of the drawer code migration Epic (CREW-177). E2e coverage on the new X pill ships in CREW-182's `agent-drawer-redesign.spec.ts`.

## 2026-05-08 — Wire `StateHistoryBar`, `TokenTable`, and Token-usage section into `AgentBody`

**What:** CREW-109 wired `<Timeline>` into `packages/dashboard/src/components/AgentBody.tsx` (replacing the `agent-body-placeholder` div) so the e2e timeline scenarios could pass. The original placeholder copy promised "Timeline, state history, and token table" — the latter two (`<StateHistoryBar>`, `<TokenTable>`) ship in CREW-104 but are still unmounted. The drawer is functional; the spec §5a/§5b composition isn't complete.

**2026-05-13 visual evidence (folded in from duplicate followup):** The Figma `1:1900` Agent full page reference shows a `Token usage` section between the page header and the event timeline — a table listing per-tool token consumption (Read 22.4k, Bash 5.1k, etc.). The rendered agent page does not display this section at all. Two possibilities: (a) hidden when empty but not reappearing when data is present — bug; (b) planned-but-not-yet-built. `TokenTable.tsx` exists (CREW-104), so the question is whether it's wired into AgentFullPage.tsx + AgentDrawer.tsx and what governs its visibility.

> **Update 2026-05-10:** CREW-117's ticket scope was expanded to a vertical-slice bundle (Crew DS composites + dashboard refactor + Figma frame migration + visual fidelity sweep). The Definition of Done no longer covers this composition — CREW-117 lands 4 Crew DS composites and the dashboard refactor, but does NOT mount StateHistoryBar/TokenTable in AgentBody (open questions still unresolved, and TokenTable's per-tool token data isn't exposed by the daemon today). Re-target this followup to a fresh ticket once open questions are settled.

**Why noticed:** While reading the slice 1c plan, noticed no plan task actually composes Tasks 20 (TokenTable) and 21 (StateHistoryBar) into AgentBody. The 2026-05-13 ultimate-test visual comparison surfaced the same gap from the user-facing side: Token usage section visibly missing.

**Anchors:**

- `packages/dashboard/src/components/AgentBody.tsx` — currently renders only `<Timeline>` under the header
- `packages/dashboard/src/components/StateHistoryBar.tsx`, `packages/dashboard/src/components/TokenTable.tsx` — built but unmounted
- `packages/dashboard/src/routes/AgentFullPage.tsx`, `routes/AgentDrawer.tsx` — host pages
- `docs/superpowers/specs/2026-05-05-slice-1c-agent-drawer-and-push-updates-design.md` §5a/§5b — composition contract
- Slice 1c Epic: [CREW-94](https://safturento.atlassian.net/browse/CREW-94)
- Figma reference: `1:1900` — Token usage section between header + event stream

**Shape of work:** One ticket under CREW-94. Expect two-pane layout (token-table sidebar + main timeline) plus a state-history strip above the timeline, with `StateHistoryBar.onScrollTo` wired into Timeline's virtualizer.

**Open questions:**

- Where does TokenTable sit on narrow drawer widths? (collapsible side panel vs always-stacked.)
- Does `onScrollTo(ts)` need new public Timeline API, or piggyback on an existing imperative handle?
- TokenTable's `rows: { tool, tokens }[]` data isn't exposed by the daemon — add a daemon endpoint or compute client-side from transcript events.
- Is the empty-state-hides-section behavior intentional UX, or accidental?

**Resolved 2026-05-22:** Resolved via the drawer code migration Epic (CREW-177). `StateHistoryBar` and `TokenTable` were both deleted in CREW-182. The Token-usage section now ships as the `TokensByTool` composite (CREW-180), wired into `AgentBody` between the header and Timeline (CREW-178 backend + CREW-180 frontend). State history is surfaced as state-grouped Timeline sections (CREW-181) instead of the standalone bar.
