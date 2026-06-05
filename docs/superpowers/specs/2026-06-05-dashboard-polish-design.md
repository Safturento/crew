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
5. **#8 — `crew fix-pr` leaves the agent stuck on "PR Open" instead of "Running"** (CLI and/or daemon).

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

## #8 — `crew fix-pr` stuck on "PR Open"

### Symptom

Running `crew fix-pr <KEY>` on a `pr_open` agent doesn't flip the dashboard to "Running" while the fix-pr run is in flight; it stays "PR Open."

### Root cause

`deriveState` (`AgentsService.ts`) short-circuits to `running`/`initializing` **only when the latest run's `completed_at` is null**:

```ts
if (input.completedAt === null) {
  return input.latestHasToolCalls ? 'running' : 'initializing';
}
…
if (input.hasPrCreate) return 'pr_open';
```

`has_pr_create` is a `MAX(...)` across **all** runs, so it is permanently `1` once `gh pr create` ever ran. The in-flight branch is the only thing that can override it. Therefore: **if a `crew fix-pr` dispatch does not register an in-flight run row the daemon can see** (a `runs` row with `command='fix-pr'`, `completed_at=null`, picked up by the `latest` subquery), the in-flight branch never fires and the agent stays `pr_open`.

> Plan-time investigation (do this first): confirm whether `crew fix-pr` opens a `runs` row at dispatch the way `crew run` does, and whether that row is what the `latest` subquery selects (it already filters `command IN ('run','fix-pr')`). The fix lands in whichever layer is missing the row.

### Fix

Make a `fix-pr` dispatch register an in-flight run row at start (mirroring `crew run`) so `deriveState`'s `completedAt === null` branch fires → **Running** while it runs, settling back to **PR Open** (or **PR Merged**, if `PrPoller` has seen a merge) on completion. No change to the `has_pr_create` semantics is required if the in-flight row exists.

> If investigation shows the row *is* registered but state still sticks, the alternative root cause is the `latest` subquery / `latestHasToolCalls` computation; re-scope the fix there. Either way the desired observable behavior is identical.

### Verification

Service/unit test: with an existing completed `run` (hasPrCreate) **plus** an in-flight `fix-pr` run (completed_at null), `deriveState` → `running`; after the fix-pr run completes with exit 0 and no merge, → `pr_open`. End-to-end sanity against a real fix-pr if feasible.

### Size

S, pending root-cause confirmation. Could be a CLI registration gap, a daemon derivation gap, or both.

---

## Cross-cutting notes

- **Parallelism / merge safety:** all five are disjoint in their primary files, but several touch known append-point files (per the parallel-merge convention). #2 and #5 both edit `Timeline`-area files; #4 and #8 both edit `AgentsService.ts`. Plan the Epic's children so the two pairs don't merge simultaneously, and let one migration-adder (#4, if path (a)) go per batch.
- **Doc parity:** #4/#8 touch daemon services + possibly a migration + CLI dispatch → check `.agents/architecture.md`, `.agents/dispatch.md`, `packages/daemon/AGENTS.md` `covers:` globs. #2/#5/#6 are dashboard-only → `.agents/design-system.md` / dashboard docs. Run `agents-doc-parity-check` before each child PR.
- **No new followups** are required for these five; the popover guard is folded into #6 rather than deferred.

## Open questions (carried into the plan)

1. #4 — mechanism (a)/(b)/(c) for sourcing the per-worktree URL. *Recommendation: (a).*
2. #8 — exact layer of the missing in-flight run row (CLI dispatch vs daemon derivation), pending the investigation step.
3. #2 — exact normalized tool-name string for `Skill` and whether `toolAlias` already normalizes it.
