# Dashboard polish batch

**Date:** 2026-06-05
**Status:** Spec — pending implementation plan
**Epic:** new Epic (to be created as `CREW-NNN`), "Dashboard polish batch".
**Related context:** five independently-noticed dashboard/daemon defects + small UX gaps, batched into one Epic because each is too small to plan alone but they share the dashboard/daemon surface. Surfaced in a 2026-06-05 working session reviewing the running dashboard. The larger sibling efforts from the same session — runner status/logs redesign, Button/Pill hover states, and the New-Run Jira ticket picker — are **out of scope** here and tracked separately (see "Out of scope").

> Convention note: blockquotes in this spec flag decisions still open at plan time. Everything outside a blockquote is settled.

## Context

The dashboard is a pure view over the daemon's REST/SSE API (`packages/dashboard/AGENTS.md`: "No business logic"). The daemon is a containerized Fastify process with read-only host mounts; the CLI is the only component that touches host git/worktrees/env materialization. These boundaries shape two of the five fixes (#4 APP_URL, #8 fix-pr state), which is why they are not pure dashboard changes.

Each item below is self-contained — different files, no shared logic — so they can be built in parallel and merged independently. The Epic exists for tracking, not because the items interlock.

## Scope

Five fixes:

1. **#5 — Timeline "starting"-section rows flicker open/closed** (dashboard only).
2. **#2 — "Skills" and "Tools › Skill" are double-classified** (dashboard only).
3. **#6 — Drawer filter/search settings are lost on close+reopen** (dashboard only), plus the filter-popover outside-click guard.
4. **#4 — The drawer's APP_URL pill shows the wrong/empty URL** (CLI + daemon + dashboard).
5. **#8 — Full ticket-lifecycle timeline + correct cross-run state** (daemon, dashboard, possibly CLI). Grew during review from a badge fix into showing every run's transcript across the ticket lifecycle, segmented — the substantial item of the batch.

## Out of scope (tracked elsewhere)

- **Runner status + logs redesign** — its own Epic; the current chip + raw-tail viewer is placeholder.
- **Button/Pill hover states** — DS work (Figma + `pill-variants`/`button.tsx`), handled in-session per the DS-in-Figma convention.
- **New-Run Jira ticket picker** (epic-grouped, dependency-aware runnability) — its own Epic; the biggest of the batch.

---

## #5 — Timeline startup-row flicker

### Symptom

Expanding a transcript row inside the **starting** section flickers open then immediately collapses; it never stays open. Other sections behave.

### Root cause

`Timeline.tsx` keys each `TranscriptRow` with `eventKey(event)`:

```ts
function eventKey(event: TranscriptEvent): string {
  const r = event as unknown as { uuid?: string; timestamp?: string };
  return r.uuid ?? r.timestamp ?? Math.random().toString(36).slice(2);
}
```

`crew_startup_*` events (CREW-201) carry `startedAt`, **not** `timestamp`, and have no `uuid`. So they fall through to `Math.random()` — a **new key on every render**. The active-section runtime ticker (`setNow(Date.now())` every 1 s while any section is open-ended) re-renders `Timeline` continuously, so the startup rows are unmounted + remounted each tick. `TranscriptRow`'s per-row `open` state (a `useState` in the inner `Row`) is wiped on remount → the click appears to "flicker."

### Fix

Make `eventKey` deterministic for every event shape:

1. Add `startedAt` to the fallback chain: `uuid ?? timestamp ?? startedAt ?? …`.
2. Replace the final `Math.random()` with a deterministic composite derived from event type + a stable index, so two distinct events never collide and the key is identical across renders.

> Plan-time detail: simplest deterministic last resort is to pass the array index into `eventKey` and compose `` `${type}:${index}` `` only when no id field exists. Index is stable here because `filteredEvents` order is stable across the 1 s ticks (it only changes when events actually arrive).

### Verification

Unit test: two renders of the same startup event array yield identical keys. Component/interaction test: expand a `crew_startup_*` row, advance the runtime ticker, assert the expanded body persists.

### Size

XS. One function + tests.

---

## #2 — Coalesce "Skill" tool-use into the "Skills" category

### Symptom

A skill shows up in two visually inconsistent ways: when the agent calls the `Skill` *tool*, the row is tagged `Skill` with the **Tools** palette and counts under the **Tools** filter; the `skill_listing` / `invoked_skills` *attachments* are tagged differently and count under the **Skills** filter. They should read as one thing.

### Root cause

Two classifiers, built at different times, disagree:

- **`eventClassification.ts`** (`eventCategories`): the filter-category source of truth. Skill attachments → `'skills'`; an `assistant.tool_use` block → always `'tools'` regardless of tool name.
- **`TranscriptRow.tsx`**: a separate `RowSpec.category` enum (the older Slim-5 `'hooks-and-skills'`) drives per-row tag label + color. A `Skill` tool_use is tagged via `toolAlias()` + tool palette; skill attachments via `labelForAttachment()`.

### Decision

**The `Skill` tool invocation joins the Skills lens.** (Chosen over "show under both" and "fold Skills into Tools".)

### Fix

1. **`eventClassification.ts`:**
   - In `eventCategories`, when an `assistant.tool_use` block (or `user.tool_result` resolved via `toolNameById`) has tool name `Skill`, classify it as `'skills'` instead of `'tools'`.
   - In `eventToolAliases` (which feeds the Tools tool-name filter list), exclude `Skill` so it doesn't appear as a selectable tool under Tools.
2. **`TranscriptRow.tsx`:** render a `Skill` tool_use/result block with the same tag label + palette used for skill attachments, so the row reads identically whether it originated as a tool call or an attachment.

> Plan-time detail: confirm the exact tool name string. The alias layer (`toolAlias`) may normalize it; the classifier should match on the normalized alias to stay consistent with the filter list. A mixed-content assistant turn (text + `Skill` tool_use + another tool) should land in **both** `skills` and `tools` — the per-block loop already supports multi-category, so this is additive, not a reassignment of the whole event.

### Verification

Unit tests on `eventCategories` (a `Skill` tool_use → `{skills}`, a `Bash` tool_use → `{tools}`, a mixed turn → both), and on `eventToolAliases` (excludes `Skill`). Component test: a `Skill` tool row and a skill attachment row render the same tag label + color.

### Size

S–M. Two files + tests; care needed around the alias normalization and multi-category turns.

---

## #6 — Persist drawer filters; guard the filter popover

### Symptom

Filter + search settings reset every time the drawer is closed and reopened. Made worse because clicking *outside the open Filters popover* (to dismiss it) often lands on the drawer backdrop and closes the whole drawer — silently discarding the filter work.

### Root cause

Filter state lives in `Timeline` as component-local `useState` (`filterState`, `searchInput`; also `liveMode`, `collapsed`). `AgentDrawer` unmounts the entire subtree on `navigate('/')`, so `Timeline` and its state are destroyed; reopening remounts fresh defaults.

### Decision

**Per-agent persistence in `sessionStorage`** (chosen over global-in-memory and URL-hash). Survives close/reopen and reload; scoped per agent key; cleared on tab close. **The popover outside-click guard is folded into this ticket.**

### Fix

1. **Persistence:** a small typed helper (e.g. `useTimelineFilterPersistence(agentKey)`) that reads the persisted `{ categories, tools, search }` for the key on mount (seeding the `useState` initializers) and writes through on change. Key shape: `crew:timeline-filters:<agentKey>`. Serialize the `Set`-typed fields to arrays.
   - In scope to persist: category visibility, per-tool visibility, search text.
   - Out of scope to persist: `liveMode` (already has a sensible per-state default) and `collapsed` section state.
2. **Popover guard:** while the Filters popover is open, an outside-click should dismiss the popover and **not** propagate to the drawer backdrop. Implement at the popover layer (it already manages open/close), stopping propagation / consuming the first outside-click rather than weakening the backdrop's click-to-close.

> Plan-time detail: confirm whether the Filters popover uses the shared `popover.tsx` (Radix) — if so, Radix already traps the dismiss click and the fix may reduce to ensuring the backdrop handler doesn't also fire (e.g. `onPointerDownOutside`/`stopPropagation`). Verify empirically against the running drawer before settling the mechanism.

### Verification

Unit test the persistence helper (round-trips Set↔array; isolates by key). Component tests: set filters → unmount → remount with same key → filters restored; different key → defaults. Interaction test: open Filters, click outside the popover, assert popover closed **and** drawer still open.

### Size

S. One helper + wiring + the popover guard, with tests.

---

## #4 — Per-worktree APP_URL on the drawer

### Symptom

The drawer's APP_URL pill is empty or shows a URL that doesn't reach the agent's actually-running app.

### Root cause(s)

`AgentsService.getByKey` derives the URL via `deriveAppUrl(cfg)`, which returns the **static** `playwright.app_url` / `bruno_smoke.base_url` from the project TOML — a single canonical port, not the per-worktree one the agent actually runs on. Worse, the config load is wrapped in a bare `try/catch {}` (`AgentsService.ts:~370`) that **silently swallows** any load failure, so a missing/invalid config yields a null pill with no diagnostic.

Per-worktree ports are real: `env.toml` declares `CREW_VITE_PORT = { kind = "port" }` and `APP_URL = http://localhost:${CREW_VITE_PORT}`, materialized deterministically per worktree into that worktree's `.env` at dispatch time.

### Decision

**Show the per-worktree materialized APP_URL** (chosen over the static config value).

### Fix

Two parts:

1. **Surface the real per-worktree URL.** Preferred mechanism: **the CLI passes the materialized `APP_URL` to the daemon at run/agent registration**, the daemon persists it on the agent (or latest run) row, and `getByKey` returns it directly. This honors the daemon's "never read host disk for what the CLI can pass" rule and avoids re-implementing the port allocator inside the daemon.
2. **Stop swallowing config errors.** Replace the bare `catch {}` with a logged warning (pino) so a genuine config problem is diagnosable. The pill still degrades to hidden on failure — behavior unchanged, observability gained.

> Plan-time decision (settle before implementation): pick the mechanism for part 1.
> - **(a) CLI-passes-it** — add `app_url` to the agent-registration payload + a column; daemon stores + returns it. *Recommended.* Cost: one migration, one CLI registration-site change, schema/route plumbing.
> - **(b) Daemon re-derives** — daemon re-runs the deterministic port allocation from `worktree_path`. Cost: pulls env-spec port logic into (or shared with) the daemon; risks drift from the CLI's allocation. Rejected unless (a) proves infeasible.
> - **(c) Daemon reads the worktree `.env`** — simplest but violates the no-host-disk-read rule and couples the daemon to worktree layout. Fallback only.
>
> Also confirm: for the canonical (non-worktree) `main` stack, the static value and the materialized value coincide, so existing behavior there is preserved.

### Verification

Unit: registration stores `app_url`; `getByKey` returns the per-worktree value. Service test: a swallowed-then-logged config error path. Bruno endpoint coverage for the agent-detail shape if the payload changes. Manual: open a worktree agent's drawer, click the pill, confirm it reaches that agent's app.

### Size

S–M. Bounded by the schema + CLI registration change if path (a) is chosen.

---

## #8 — Full ticket-lifecycle timeline + correct cross-run state

> This item grew during review from a one-line badge fix into the substantial member of the batch. Two coupled requirements: (a) the current-state badge must track the *whole* lifecycle correctly (it gets stuck on "PR Open"), and (b) the timeline must show **every run's transcript across the ticket** — original run → PR opened → `fix-pr` as a second "running" segment → … → done — not just the latest run. The implementation plan must spend real time root-causing the live behavior before committing to a mechanism; this section frames that investigation rather than asserting a single cause.

### Symptoms

1. **Badge stuck:** running `crew fix-pr <KEY>` on a `pr_open` agent doesn't flip the dashboard to "Running" while the fix-pr run is in flight; it stays "PR Open."
2. **Lifecycle not shown:** the timeline doesn't present the ticket's full history as distinct lifecycle segments across runs.

### What's established (from code reading)

- **`fix-pr` *does* register + complete a run.** `fix-pr.ts` calls `daemonClient.registerRun(...)` (`:299`) and `completeRun(...)` (`:347`). So "fix-pr never opens a run row" is **not** the cause.
- **`fix-pr` resumes the *same* session id.** It uses `spawnClaudeResume({ sessionId: session.sessionId, … })` (`:271`/`:305`), so its events **append to the original run's JSONL** rather than creating a new transcript file.
- **The timeline only ever loads one transcript.** `resolveJsonlPathForAgent` selects the latest `run`/`fix-pr` session with `ORDER BY runs.id DESC LIMIT 1`; `TimelineService.getTimeline` reads exactly that file (plus startup rows). If a run ever *did* get a distinct session id, its transcript would be dropped from the view.
- **State transitions are already logged per run.** `IngestService` writes `state_transitions` rows on each derived flip during tool-call replay (`:263/:364/:404/:559`); `PrPoller` writes `pr_merged` (`:113`). `getStateHistory` reads this ordered log. `groupEventsByState` (dashboard) already segments the timeline by these transitions — so a correct transition log is what drives the lifecycle segmentation the user wants.
- **The badge ignores that log.** `deriveState` recomputes from a `has_pr_create` `MAX(...)` flag (permanently `1` once `gh pr create` ran) plus the latest run's `completed_at`/`exit_code`. Its only override to `running` is the `completed_at === null` in-flight branch.

### Hypotheses to confirm in the plan (root-cause first)

> **Badge stuck — candidate causes** (resolve empirically against a live `fix-pr`, inspecting `runs`, `state_transitions`, and the JSONL):
> - **(H1)** The fix-pr run's `completed_at` is set quickly / already set by the time the dashboard renders, so `deriveState` skips the in-flight branch and falls through to `hasPrCreate → pr_open`. (i.e. the in-flight window is real but invisible.)
> - **(H2)** Resuming the *same* session id confuses the `latest` subquery or `latestHasToolCalls` (tool calls attributed across two run rows sharing one session), so the in-flight branch doesn't fire as expected.
> - **(H3)** `registerRun` for fix-pr isn't actually reached in the user's flow (env/daemon-client guard), despite the code path existing.
>
> **Lifecycle segmentation — candidate causes:**
> - **(L1)** Because fix-pr appends to the same JSONL, the events *are* present, but the transition log isn't re-flipping `pr_open → running → pr_open` on resume (so `groupEventsByState` shows one merged span instead of distinct run/fix-pr segments).
> - **(L2)** Some runs *do* get distinct session ids (or distinct worktrees), and `resolveJsonlPathForAgent`'s `LIMIT 1` silently drops them.

### Design direction (settle in the plan)

The user has explicitly authorized refactoring state derivation if that's the clean fix. Leading direction:

1. **Make the badge transition-log-driven.** Derive the current state from the **last `state_transitions` row** (the same source `getStateHistory` already exposes) rather than recomputing from the forever-true `has_pr_create` flag. This makes the badge a pure projection of the logged lifecycle, so "running again during fix-pr" falls out for free *provided* IngestService writes the flip. Keep `finished`/`pr_merged` precedence. Migrate the `list()` + `getByKey()` derivation onto this single source.
   > Open: does every transition that should exist actually get written today (esp. `pr_open → running` when a resume begins)? If not, the IngestService replay needs to emit it. This is the core of the refactor.

2. **Aggregate all runs into one lifecycle timeline.** Replace the single-path resolver with a resolver that returns **every** `run`/`fix-pr` transcript for the agent in order, and have `TimelineService` read+parse each, **tagging every event with its originating run** (run id + command + ordinal). Two cases to handle uniformly:
   - Same-session resume (today's fix-pr): one growing JSONL — segment by the `state_transitions` flips.
   - Distinct sessions (if/when they occur): concatenate multiple files in run order.
   `finish` runs have no JSONL and contribute only their step events (already handled elsewhere).

3. **Segment the timeline UI by lifecycle phase.** `groupEventsByState` already groups by state; ensure a `pr_open → running` flip starts a fresh "running" section so the fix-pr work reads as its own segment. Add a per-segment affordance making the run/phase boundary legible ("Run 1", "PR opened", "Fix-pr", …). This is where #5's stable-key work matters most: with multiple segments, key rows by `runId + uuid/startedAt + index` so nothing remounts across the 1 s ticker.

### Scope boundary

In scope: the badge correctness, the multi-run aggregation, the lifecycle segmentation, and whatever transition-write gaps the investigation surfaces. **Out of scope:** changing how `fix-pr` resumes (same-session resume stays); streaming; server-side pagination of very long aggregated timelines (note it as a future optimization if aggregation makes timelines large).

### Verification

- Service/unit: with a completed `run` (hasPrCreate) **plus** an in-flight `fix-pr` run, derived current state → `running`; after fix-pr completes (exit 0, no merge) → `pr_open`; after `PrPoller` sees merge → `pr_merged`; after `finish` ok → `finished`.
- Aggregation: an agent with a `run` + a `fix-pr` yields a timeline containing **both** segments' events, each tagged with its run, ordered correctly.
- Segmentation/UI: the rendered timeline shows distinct running segments either side of the `pr_open` flip; expanding a row in any segment persists across the runtime ticker.
- Manual: reproduce a real `run → fix-pr` cycle and confirm badge + segmented timeline match the lifecycle.

### Size

M (the heavyweight of this batch). Plausibly splits into child tickets: **8a** state-derivation refactor (transition-log-driven badge + any missing transition writes), **8b** multi-run transcript aggregation (resolver + TimelineService + run tagging), **8c** lifecycle segmentation UI (segment headers, folding in #5's keys). Final split decided in the plan after the root-cause step.

---

## Cross-cutting notes

- **#5 is now folded into #8c.** The stable-`eventKey` fix is a prerequisite for the lifecycle segmentation UI (multiple segments make remount-on-tick far more visible). It can still ship first as a standalone XS fix, but its final home is alongside #8c — the plan decides whether to land it early or bundle it.
- **Parallelism / merge safety:** the items are largely disjoint, but several touch known append-point files (per the parallel-merge convention). #2 and #5/#8c all edit `Timeline`-area files; #4 and #8a both edit `AgentsService.ts` (state derivation) — sequence these so they don't merge simultaneously. #4 and #8b may both add migrations — **one migration-adder per merge batch**; rebase the second.
- **#8 ordering:** the root-cause investigation step gates 8a/8b/8c. 8a (state derivation) and 8b (aggregation resolver) can proceed in parallel after it; 8c (UI) depends on 8b's run-tagged events and ideally 8a's segment-correct transitions.
- **Doc parity:** #4/#8 touch daemon services + likely a migration + CLI dispatch → check `.agents/architecture.md`, `.agents/dispatch.md`, `packages/daemon/AGENTS.md` `covers:` globs. #2/#5/#6/#8c are dashboard-only → `.agents/design-system.md` / dashboard docs. Run `agents-doc-parity-check` before each child PR.
- **No new followups** are required for these items; the popover guard is folded into #6, #5 into #8c.

## Open questions (carried into the plan)

1. #4 — mechanism (a)/(b)/(c) for sourcing the per-worktree URL. *Recommendation: (a).*
2. #8 — **root-cause first.** Which of H1/H2/H3 explains the stuck badge, and which of L1/L2 explains the missing segmentation (resolve empirically against a live `run → fix-pr` cycle before committing the fix).
3. #8 — does the transition log already record every flip needed for segmentation (esp. `pr_open → running` on resume)? If not, where does IngestService's replay need to emit it?
4. #8 — final child-ticket split (8a/8b/8c vs fewer), decided after the root-cause step.
5. #2 — exact normalized tool-name string for `Skill` and whether `toolAlias` already normalizes it.
