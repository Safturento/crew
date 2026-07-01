# Runner Page Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the agent row at run initiation so no startup failure is ever invisible, retire the standalone Runner page into the Agents grid + a header-toggled supervisor drawer, and make a wedged run safely restartable from the dashboard.

**Architecture:** A daemon-owned idempotent agent-row upsert is called at the earliest point on each entry path (enqueue for dashboard, post-config-resolve for direct CLI). Two new lifecycle states (`queued`, `orphaned`) join the existing set; failed-start folds into `error`. The CLI's early preflight gate reports failures through the daemon instead of exiting silently, and the runner enriches its reap log with the startup-log reason. The dashboard folds the Runner page's sections into the Agents grid (rows directly actionable) plus a supervisor drawer (housekeeping roll-up), toggled from the header runner chip.

**Tech Stack:** Fastify + Zod + Kysely (`kysely-better-sqlite3`) + Awilix (daemon); Commander + execa + tsx (CLI); React + Vite + Tailwind + Vitest/RTL (dashboard). Numbered TS migrations. SSE event bus.

**Spec:** `docs/superpowers/specs/2026-06-30-runner-page-rework-design.md`. Read it first — this plan implements it section by section.

## Global Constraints

- **Never edit a shipped migration.** New schema change = new numbered file in `packages/daemon/src/migrations/`. One migration-adder per parallel batch (parallel-merge manifest-conflict rule).
- **Routes stay thin** — parse/validate (Zod) → call service → return. No business logic in `routes/`.
- **Best-effort daemon calls from the CLI never throw** — a down daemon degrades to "run not tracked", never breaks `crew run` (mirror existing `reportLaunching`/`reportFailedStart`).
- **Bruno parity** — any new/changed HTTP route adds/updates its `bruno/endpoints/<group>/<verb>-<name>.bru` in the same commit (`bruno-collection-maintenance` skill).
- **Agents-doc parity** — run the `agents-doc-parity-check` skill before completing; `.agents/dispatch.md` (`covers: packages/cli/src/lib/run/**`, `startup-events/**`), `.agents/architecture.md`, and `packages/*/AGENTS.md` are the likely-affected docs.
- **State names are `snake_case` in the derivation layer** (`pr_open`, `pr_merged`) but the dashboard AgentRow variant axis uses `pr-open` (hyphen). Keep both spellings straight: daemon `AgentState` = `queued`/`orphaned`; Figma/AgentRow variant = `queued`/`orphaned` (no hyphen needed).
- **No pre-commit hooks** — run lint/typecheck/test yourself: `npm run -w crew-daemon test`, `npm run -w crew-cli test`, `npm run -w crew-dashboard test`, `npm run lint`, `npm run typecheck`.

---

## File Structure

**Daemon (spine + drawer read surface):**
- `packages/daemon/src/services/AgentsService.ts` — `AgentState` union + `deriveState`; add `queued`/`orphaned`.
- `packages/daemon/src/services/state-derivation.ts` — `TransitionState`/`TransitionTarget`/`isTransitionTarget`; add the two states.
- `packages/daemon/src/services/state-reduce.ts` — reducer edges into `orphaned`.
- `packages/daemon/src/services/ActionService.ts` — `enqueue` creates the `queued` agent row + transition.
- `packages/daemon/src/services/RunFailureService.ts` — reuse `upsertAgent`; add `recordInitializing` (direct-CLI birth) + `recordEarlyFailure` (early-gate error).
- `packages/daemon/src/routes/runner.ts` + `routes/runs.ts` — birth + early-failure + reconcile endpoints.
- `packages/daemon/src/services/RunnerPageService.ts` — `reconcile` roll-up query (queued + orphaned across projects).

**CLI:**
- `packages/cli/src/commands/run.ts` — move birth call ahead of the gate; route `failStartupPhase` through the daemon.
- `packages/cli/src/lib/run/preflight-tracking.ts` — widen beyond `PreflightError`.
- `packages/cli/src/lib/run/reconcile-orphan-branch.ts` → add `reconcileOrphanWorktree`.
- `packages/cli/src/lib/runner/loop.ts` + `registry.ts` — enrich the reap line.
- `packages/cli/src/lib/daemon-client/index.ts` — `reportInitializing`, `reportEarlyFailure` clients.

**Dashboard:**
- `packages/dashboard/src/data/types.ts` + `data/state-meta.ts` — `queued`/`orphaned` in `AgentState` + `STATE_META`.
- `packages/dashboard/src/components/AgentRow.tsx` — Dequeue/Reap/Restart/Inspect actions.
- `packages/dashboard/src/components/TopNav.tsx` — remove Runner tab; runner chip toggles the drawer.
- `packages/dashboard/src/components/runner/SupervisorDrawer.tsx` — reconcile roll-up + controls.
- **Delete:** the standalone Runner page route + `runner/useRunnerPageData.ts`, `LiveProcessList.tsx`, `FailedToStartSection.tsx`, `QueuedActions.tsx`, `RecentlyEnded.tsx`, `UnmanagedRuns.tsx`, `Section.tsx` (runner-only), and their tests.

---

## Task 1: New lifecycle states `queued` + `orphaned` (daemon)

**Files:**
- Modify: `packages/daemon/src/services/state-derivation.ts` (`TransitionState`, `isTransitionTarget`)
- Modify: `packages/daemon/src/services/AgentsService.ts:12` (`AgentState` union)
- Test: `packages/daemon/src/services/state-derivation.test.ts`

**Interfaces:**
- Produces: `AgentState` now includes `'queued' | 'orphaned'`; `isTransitionTarget('queued') === true`, `isTransitionTarget('orphaned') === true`.

- [ ] **Step 1: Write the failing test**

```ts
// state-derivation.test.ts
import { isTransitionTarget } from './state-derivation.js';
it('recognizes queued and orphaned as transition targets', () => {
  expect(isTransitionTarget('queued')).toBe(true);
  expect(isTransitionTarget('orphaned')).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-daemon test -- state-derivation`
Expected: FAIL (`queued`/`orphaned` not in the target set).

- [ ] **Step 3: Add the states**

In `state-derivation.ts`, extend the union and the recognizer set:

```ts
export type TransitionState =
  | 'init' | 'queued' | 'running' | 'pr_open' | 'pr_merged'
  | 'finished' | 'error' | 'orphaned';
export type TransitionTarget = TransitionState | 'idle' | 'waiting';
// add 'queued' and 'orphaned' wherever the STATE_LABELS / TARGET set enumerates values
```

In `AgentsService.ts:12`, add `'queued'` and `'orphaned'` to the `AgentState` union.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run -w crew-daemon test -- state-derivation` → PASS. Then `npm run -w crew-daemon typecheck` — fix every non-exhaustive `switch`/`Record<AgentState, …>` the compiler now flags (they are the call sites Tasks 8–11 depend on).

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(daemon): add queued + orphaned lifecycle states"
```

## Task 2: Reducer edge into `orphaned`; `deriveState` honors pre-run states

**Files:**
- Modify: `packages/daemon/src/services/state-reduce.ts`
- Modify: `packages/daemon/src/services/AgentsService.ts` (`deriveState`)
- Test: `packages/daemon/src/services/state-reduce.test.ts`, `AgentsService.test.ts`

**Interfaces:**
- Consumes: `AgentState` from Task 1.
- Produces: an agent whose latest transition is `queued`/`orphaned` and whose run has not completed derives to that state (not collapsed to `init`/`idle`).

- [ ] **Step 1: Write the failing test** — a `queued` transition with no run row stays `queued`; a `run_orphaned` event moves `running`→`orphaned`.

```ts
// AgentsService.test.ts
it('keeps a queued agent queued until it launches', async () => {
  await seedTransition(db, { key: 'HA-1', to: 'queued' });
  const agent = (await service.list()).find(a => a.key === 'HA-1');
  expect(agent?.state).toBe('queued');
});
```

- [ ] **Step 2: Run to verify it fails** — `npm run -w crew-daemon test -- AgentsService` → FAIL (derives `init`).

- [ ] **Step 3: Implement** — in `deriveState`, when `completedAt === null` and `currentState` is `queued` or `orphaned`, return `currentState` unchanged (place before the `initializing` tool-call branch). In `state-reduce.ts`, add a `run_orphaned` case: `current === 'running' ? 'orphaned' : null`.

- [ ] **Step 4: Run to verify it passes** — `npm run -w crew-daemon test -- AgentsService state-reduce` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(daemon): reduce/derive queued + orphaned agent states"`

## Task 3: `enqueue` births the agent row as `queued` (dashboard path)

**Files:**
- Modify: `packages/daemon/src/services/ActionService.ts` (`enqueue`)
- Modify: `packages/daemon/src/container.ts` (inject `RunFailureService`/writer into `ActionService` if not already present)
- Test: `packages/daemon/src/services/ActionService.test.ts`

**Interfaces:**
- Consumes: `RunFailureService.upsertAgent` (make it callable — either widen to a small injected `AgentWriter` or add a public `birthQueued(input)` method), the transition writer used by `IngestService.writeTransitionRow`.
- Produces: after `enqueue({kind:'run', ticketKey, project, ...})`, an `agents` row exists and its latest transition is `queued`.

- [ ] **Step 1: Write the failing test**

```ts
// ActionService.test.ts
it('creates a queued agent row when a run is enqueued', async () => {
  await service.enqueue({ kind: 'run', ticketKey: 'HA-9', project: 'home-assistant',
    worktreePath: '/w/home-assistant-HA-9', branch: 'HA-9' });
  const agent = await agents.getByKey('HA-9');
  expect(agent.state).toBe('queued');
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (no agent row).

- [ ] **Step 3: Implement** — add a `RunFailureService.birthQueued({key, projectName, worktreePath, branch, appUrl})` that calls `upsertAgent` then writes a `queued` transition (reuse the same transition-write + `announceTransition` path `recordError` uses, factored to a shared helper if needed). Call it from `enqueue` for `kind === 'run'` only (not `fix-pr`/`finish`, which target an existing agent). Derive `worktreePath` via `worktreePathFor(repoPath, ticketKey)` if the enqueue payload lacks it — the dashboard passes project; the daemon resolves the repo path from `ProjectsService`.

- [ ] **Step 4: Run to verify it passes** — PASS. Add a second test: enqueuing `fix-pr` does **not** create/overwrite a `queued` row.

- [ ] **Step 5: Commit** — `git commit -am "feat(daemon): enqueue births a queued agent row (dashboard path)"`

## Task 4: Direct-CLI birth endpoint (`initializing`) + client

**Files:**
- Modify: `packages/daemon/src/services/RunFailureService.ts` (`recordInitializing`)
- Modify: `packages/daemon/src/routes/runner.ts` (`POST /api/runner/initializing`)
- Create: `bruno/endpoints/runner/post-initializing.bru`
- Modify: `packages/cli/src/lib/daemon-client/index.ts` (`reportInitializing`)
- Test: `packages/daemon/src/routes/runner.test.ts`, `packages/cli/src/lib/daemon-client/index.test.ts`

**Interfaces:**
- Produces: `POST /api/runner/initializing { key, projectName, worktreePath, branch, appUrl? }` → 204; upserts the agent row + writes an `initializing` transition (idempotent — safe when a `queued` row already exists, i.e. the dashboard path). `CrewDaemonClient.reportInitializing(input): Promise<void>` (best-effort, never throws).

- [ ] **Step 1: Write the failing test** — POST births an `initializing` agent when none exists; and transitions an existing `queued` agent to `initializing` (idempotent upsert).

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — `recordInitializing` = `upsertAgent` + write `initializing` transition (no-op if already past `initializing`, mirroring `recordError`'s `previous`-guard). Thin route (Zod body = the CREW-244 `RegisterRunBody` minus `sessionId`/`command`/`startedAt`). `reportInitializing` mirrors `reportLaunching` (fetch, swallow errors).

- [ ] **Step 4: Run to verify it passes.** Add the Bruno endpoint mirroring `post-launching.bru`.

- [ ] **Step 5: Commit** — `git commit -am "feat(daemon): direct-CLI initializing birth endpoint + client"`

## Task 5: CLI calls the birth endpoint right after config-resolve

**Files:**
- Modify: `packages/cli/src/commands/run.ts` (after `discoverProjectConfig`, before tool preflight)
- Test: `packages/cli/src/commands/run.test.ts` (or the closest existing run-orchestration test)

**Interfaces:**
- Consumes: `reportInitializing` (Task 4), `worktreePathFor`.
- Produces: `crew run` posts `initializing` before the tool/gh-auth/worktree gate runs.

- [ ] **Step 1: Write the failing test** — with a fake daemon client, `runCommand` calls `reportInitializing({key, projectName, worktreePath, branch})` before `preflightTools`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — construct `daemonClient` at the top of `run.ts` (it already gets created at step 7 for `reportLaunching`; hoist that construction up). Immediately after `discoverProjectConfig` resolves `config`, compute `worktree = worktreePathFor(config.repo_path, key)` and `await daemonClient.reportInitializing({...})`. Keep the existing `runTrackedPreflight`/`reportLaunching` at step 7 — `recordLaunching` already upserts, so it's a harmless idempotent update of the now-existing row.

- [ ] **Step 4: Run to verify it passes** — `npm run -w crew-cli test -- run` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(cli): birth the agent row right after config-resolve"`

## Task 6: Early-gate failures report `error` through the daemon

**Files:**
- Modify: `packages/cli/src/commands/run.ts` (`failStartupPhase`)
- Modify: `packages/daemon/src/services/RunFailureService.ts` (`recordEarlyFailure`) + `routes/runner.ts` (`POST /api/runner/early-failure`)
- Create: `bruno/endpoints/runner/post-early-failure.bru`
- Modify: `packages/cli/src/lib/daemon-client/index.ts` (`reportEarlyFailure`)
- Test: `run.test.ts`, `runner.test.ts`

**Interfaces:**
- Produces: `POST /api/runner/early-failure { key, phase, summary }` → 204; upserts the agent (if a row exists or `key` resolves a project) and writes an `error` transition with `source:'startup-failure'`, carrying the phase/summary as the failure reason. `failStartupPhase` awaits `reportEarlyFailure` before `fail()`/exit.

- [ ] **Step 1: Write the failing test** — a worktree-exists failure (`failStartupPhase(key,'crew_startup_preflight',...)`) results in an `error`-state agent with the reason recorded; and the process still exits 1.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — make `failStartupPhase` `async` (or wrap its callers) so it can `await deps.daemonClient.reportEarlyFailure({key, phase: subtype, summary: message})` before `fail(message)`. Because the row was already birthed in Task 5, `recordEarlyFailure` is a transition write, not a create — but keep the `upsertAgent` fallback for the (rare) case the birth call was lost. Store the reason on the existing `startup_events` row (already written by `emitStartupEventSync`) so the drawer/Inspect can read it; the transition just carries the state.

- [ ] **Step 4: Run to verify it passes.** Add the Bruno endpoint.

- [ ] **Step 5: Commit** — `git commit -am "feat(cli): early-gate failures surface as error agents"`

## Task 7: Enrich the runner reap line with the startup-log reason

**Files:**
- Modify: `packages/cli/src/lib/runner/loop.ts:192-193`
- Modify: `packages/cli/src/lib/runner/registry.ts` (`reapDead` already returns keys)
- Create/Modify: `packages/cli/src/lib/runner/reap-reason.ts` (read the startup-log tail for a key)
- Test: `packages/cli/src/lib/runner/reap-reason.test.ts`, `loop.test.ts`

**Interfaces:**
- Consumes: `startupLogFilePath(key)` (`lib/startup-events/log-file.ts`), the `.jsonl` `failed`-phase reader.
- Produces: `reapReason(key): string | null` — the last `failed` startup phase's summary (or a tail line). The heartbeat logs `reaped <key> — startup failed: <reason>` when a reason exists, else the current bare form.

- [ ] **Step 1: Write the failing test** — given a `~/.crew/startup/<key>.jsonl` ending in a `crew_startup_preflight` `failed` event with summary "worktree already exists…", `reapReason(key)` returns that summary; given no failed event, returns `null`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `reapReason`, and in `loop.ts` map each reaped key through it: `log(reaped.map(k => { const r = reapReason(k); return r ? \`\${k} — startup failed: \${r}\` : k; }).join(', '))`, prefixed `reaped N dead process(es): `.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `git commit -am "feat(runner): enrich reap log with startup-failure reason"`

## Task 8: Safe orphan-worktree reclaim + `Restart` action

**Files:**
- Modify: `packages/cli/src/lib/run/reconcile-orphan-branch.ts` → add `reconcileOrphanWorktree`
- Modify: `packages/cli/src/commands/run.ts` (call it in preflight, before `requireWorktreeAvailable`)
- Modify: `packages/cli/src/lib/runner/commands.ts` (a `restart` command that reconciles then runs) + the daemon `runner_commands` enqueue path used by the dashboard
- Test: `reconcile-orphan-branch.test.ts` (new `reconcileOrphanWorktree` cases)

**Interfaces:**
- Produces: `reconcileOrphanWorktree({ repoPath, key, defaultBranch }): Promise<'reclaimed' | 'absent'>` — deletes a leftover worktree dir whose branch has zero commits beyond `origin/<default>`; throws an actionable error when the branch carries unique commits (mirror `reconcileOrphanBranch`'s safe/unsafe split). A `Restart` runner command reclaims then re-enqueues a `run`.

- [ ] **Step 1: Write the failing test** — safe orphan worktree (branch == `origin/main`) → `git worktree remove` + reclaimed; worktree with unique commits → throws with `git log origin/<default>..<key>` guidance; absent → `'absent'`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `reconcileOrphanWorktree` (reuse the commit-count check from `reconcileOrphanBranch`; `git worktree remove --force` on the safe path). Call it in the `crew_startup_worktree` bracket before creating the worktree, so a re-run self-heals. Add the `restart` runner command (dashboard `Restart` → enqueue).

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `git commit -am "feat(cli): safe orphan-worktree reclaim + dashboard restart"`

## Task 9: Reconcile roll-up read surface (daemon)

**Files:**
- Modify: `packages/daemon/src/services/RunnerPageService.ts` (`reconcile()`)
- Modify: `packages/daemon/src/routes/runner.ts` (`GET /api/runner/reconcile`)
- Create: `bruno/endpoints/runner/get-reconcile.bru`
- Test: `RunnerPageService.test.ts`, `runner.test.ts`

**Interfaces:**
- Produces: `GET /api/runner/reconcile` → `{ queued: RunRef[], orphaned: RunRef[] }` where `RunRef = { key, projectName, state, since }` — every agent whose derived state is `queued` or `orphaned`, across all projects.

- [ ] **Step 1: Write the failing test** — with one `queued` and one `orphaned` agent seeded, the endpoint returns both in their buckets; a `running` agent is excluded.

- [ ] **Step 2–5:** implement the query (reuse `AgentsService.list()` filtered by state, like `activeTicketKeys`), thin route, Bruno endpoint, test green, commit `feat(daemon): reconcile roll-up read surface`.

## Task 10: `queued` + `orphaned` in the dashboard grid + row actions

**Files:**
- Modify: `packages/dashboard/src/data/types.ts` (`AgentState`), `data/state-meta.ts` (`STATE_META`)
- Modify: `packages/dashboard/src/components/AgentRow.tsx` (action `switch`)
- Test: `AgentRow.test.tsx`, `state-meta.test.ts` (if present)

**Interfaces:**
- Consumes: daemon `AgentState` now includes `queued`/`orphaned` (Task 1) surfaced via `/api/agents`.
- Produces: `STATE_META.queued` (idle color, non-attention) + `STATE_META.orphaned` (waiting color, `attention: true`); `AgentRow` renders **Dequeue** for `queued`, **Reap** for `orphaned`, **Restart + Inspect** for `error`.

- [ ] **Step 1: Write the failing test**

```tsx
// AgentRow.test.tsx
it('shows Dequeue on a queued row and Reap on an orphaned row', () => {
  render(<AgentRow agent={agentFixture({ state: 'queued' })} onAction={onAction} />);
  fireEvent.click(screen.getByRole('button', { name: /dequeue/i }));
  expect(onAction).toHaveBeenCalledWith('dequeue');
});
```

- [ ] **Step 2: Run to verify it fails** — `npm run -w crew-dashboard test -- AgentRow` → FAIL.

- [ ] **Step 3: Implement** — add `queued`/`orphaned` to `AgentState` in `data/types.ts`; add their `STATE_META` entries (`queued`: `{ color:'idle', label:'Queued', attention:false }`; `orphaned`: `{ color:'waiting', label:'Orphaned', attention:true }`). In `AgentRow.tsx`'s `switch`, add `case 'queued'` → a single ghost `Dequeue` button firing `'dequeue'`; `case 'orphaned'` → a `Reap` button firing `'reap'`; extend the existing `case 'error'` to also offer `Restart` (fires `'restart'`) alongside `Inspect`.

- [ ] **Step 4: Run to verify it passes** — PASS; `npm run -w crew-dashboard typecheck`.

- [ ] **Step 5: Commit** — `git commit -am "feat(dashboard): queued/orphaned states + inline row actions"`

## Task 11: Remove the Runner tab; runner chip toggles the supervisor drawer

**Files:**
- Modify: `packages/dashboard/src/components/TopNav.tsx`, `RunnerStatusChip.tsx`
- Modify: `packages/dashboard/src/routing/parseRoute.ts` (drop the `runner` route or repoint it)
- Modify: the app shell that renders the drawer (wherever `SupervisorDrawer` mounts)
- Test: `TopNav.test.tsx`

**Interfaces:**
- Consumes: `GET /api/runner/reconcile` count for the chip badge.
- Produces: no `Runner` nav tab; clicking `RunnerStatusChip` opens `SupervisorDrawer`; the chip shows an `orphaned`-count badge when > 0.

- [ ] **Step 1: Write the failing test** — `TopNav` renders `Agents` + `Projects` only (no `Runner`), and the runner chip has an `onClick` that fires the drawer-open handler.

- [ ] **Step 2–5:** implement (remove the `NavTab href="#/runner"`; make `RunnerStatusChip` a button calling `onOpenSupervisor`; badge from the reconcile count), test green, `npm run lint`, commit `feat(dashboard): runner chip opens supervisor drawer, drop Runner tab`.

## Task 12: Supervisor drawer = controls + reconcile roll-up + enriched log; delete the Runner page

**Files:**
- Modify: `packages/dashboard/src/components/runner/SupervisorDrawer.tsx` (add Controls + Reconcile group)
- Delete: `runner/useRunnerPageData.ts`, `LiveProcessList.tsx`, `FailedToStartSection.tsx`, `QueuedActions.tsx`, `RecentlyEnded.tsx`, `UnmanagedRuns.tsx`, the runner page route + component, and their `.test.tsx`
- Modify: `packages/dashboard/src/data/HttpDaemonClient.ts` (drop dead runner-page reads; add `reconcile()` + `dequeue`/`reap`/`restart` command senders if not already covered by the `runner_commands` enum)
- Test: `SupervisorDrawer.test.tsx`

**Interfaces:**
- Consumes: `GET /api/runner/reconcile` (Task 9); the `runner_commands` reverse-queue for `dequeue`/`reap`/`restart`.
- Produces: the drawer shows Start/Stop/Restart, a **Reconcile** group listing queued (`Dequeue`) + orphaned (`Reap`) across projects, and the management log (already tailing the enriched reap lines from Task 7).

- [ ] **Step 1: Write the failing test** — the drawer renders a `Reconcile` section with a `Dequeue` for a queued ref and a `Reap` for an orphaned ref from a mocked `reconcile` payload.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** the Reconcile group + Controls; then delete the Runner page route/component and the now-unused sections + their tests. Grep for dangling imports (`rg "useRunnerPageData|LiveProcessList|FailedToStartSection|QueuedActions|RecentlyEnded|UnmanagedRuns"`) and remove references.

- [ ] **Step 4: Run to verify it passes** — `npm run -w crew-dashboard test`, `npm run -w crew-dashboard typecheck`, `npm run lint` all green with no dead-import errors.

- [ ] **Step 5: Commit** — `git commit -am "feat(dashboard): supervisor drawer reconcile roll-up; retire Runner page"`

---

## Self-Review

**Spec coverage:**
- §1 row-at-initiation → Tasks 3 (enqueue/`queued`), 4–5 (direct-CLI `initializing`). ✓
- §2 state model (`queued`/`orphaned`, failed-start→`error`, `Starting`=initializing) → Tasks 1, 2, 10. ✓ (`Starting` is the existing `initializing` state relabeled in `STATE_META` — fold that label into Task 10.)
- §3 no-silent-failure (row / enriched reap / terminal) → Tasks 6 (error rows), 7 (enriched reap). ✓
- §4 retire Runner page → Tasks 11, 12. ✓
- §5 inline row actions → Task 10. ✓
- §6 supervisor drawer overview → Tasks 9, 12. ✓
- §7 safe dashboard restart → Task 8. ✓

**Placeholder scan:** representative test code shown per novel task; mechanical dashboard/Bruno steps reference the exact sibling file to mirror (`post-launching.bru`, existing `AgentRow` action cases). No `TBD`/"handle edge cases".

**Type consistency:** `AgentState` extended once (Task 1) and consumed by name in Tasks 2, 9, 10; `reportInitializing`/`reportEarlyFailure`/`reconcile()`/`reconcileOrphanWorktree` names are used consistently across producing/consuming tasks.

**Gap fixed during review:** added the `STATE_META` "Starting" relabel of `initializing` into Task 10's scope (was implicit in the spec, unowned in the first draft).

## Ticket grouping (for the Epic)

- **A — daemon spine:** Tasks 1, 2, 3, 4 (states + reducer/derive + enqueue birth + initializing endpoint). Blocks everything.
- **B — CLI early-gate visibility:** Tasks 5, 6, 7. Depends on A.
- **C — safe reclaim + restart:** Task 8. Depends on A.
- **D — reconcile read surface:** Task 9. Depends on A.
- **E — dashboard grid + states:** Tasks 10, 11. Depends on A (states) + D (chip badge count).
- **F — supervisor drawer + retire page:** Task 12. Depends on D + E.

Parallel after A lands: **B ∥ C ∥ D**. Then **E** (needs D), then **F** (needs D+E). One migration-adder per batch — none of these need a schema migration (states live in `state_transitions.to_state` text; no enum constraint), so that constraint is slack here.
