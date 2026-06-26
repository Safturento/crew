# Runner per-entity drawers + supervisor controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture and serve every run's raw startup console log, surface failed/queued/recently-ended runs and per-entity log drawers on the Runner page, and wire the supervisor Stop/Restart controls.

**Architecture:** Capture → serve → consume. The runner file-redirects each `crew run` child's stdio to `~/.crew/startup/<key>.log`; the daemon mounts that dir read-only and serves it (+ page-data + supervisor-log) over HTTP/SSE; the dashboard turns run rows into a run drawer and the SupervisorCard into a supervisor drawer + Stop/Restart controls via the `runner_commands` reverse-queue.

**Tech Stack:** Node child_process (CLI runner), Fastify + Zod + Kysely/SQLite (daemon), React + TanStack Query + Vitest/RTL (dashboard), Bruno (HTTP smoke), SSE for tails.

**Spec:** `docs/superpowers/specs/2026-06-25-runner-drawers-design.md`.

## Global Constraints

- Log files live at `~/.crew/startup/<key>.log` — sibling to the existing `~/.crew/startup/<key>.jsonl` startup-events (`packages/cli/src/lib/startup-events/writer.ts` `startupEventsFilePath`). Reuse that root.
- The daemon is containerized; host dirs reach it only via read-only bind mounts in `docker-compose.yml`. It must never assume write access to host log files.
- Routes stay thin (parse+validate+call service); business logic in services. New routes get Bruno coverage (`bruno-collection-maintenance` skill).
- Correlation key throughout is `agentKey` (the ticket key).
- Capture the **whole `crew run` lifetime** to the log file (not bounded at registerRun).
- Supervisor cold-Start is **not** wired — the Start button shows a `crew runner start` hint; only Stop/Restart are enqueued.

---

## Task T1: Startup-log capture (CLI runner)

**Files:**
- Create: `packages/cli/src/lib/startup-events/log-file.ts` (path + open helper)
- Modify: `packages/cli/src/lib/runner/executor.ts` (redirect child stdio to the log file)
- Test: `packages/cli/src/lib/startup-events/log-file.test.ts`, `packages/cli/src/lib/runner/executor.test.ts`

**Interfaces:**
- Produces: `startupLogFilePath(key: string, home?: string): string` → `~/.crew/startup/<key>.log`. The runner opens it append-mode and passes the fd as the child's stdout+stderr. Consumed by T2's serving endpoint (same path, read-only mount).

- [ ] **Step 1: Write the failing path test**

In `log-file.test.ts`:

```ts
import { startupLogFilePath } from './log-file.js';
it('resolves <home>/.crew/startup/<key>.log', () => {
  expect(startupLogFilePath('CREW-1', '/home/u')).toBe('/home/u/.crew/startup/CREW-1.log');
});
```

- [ ] **Step 2: Run it — expect FAIL (module missing)**

Run: `npm test --workspace=crew-cli -- log-file`
Expected: FAIL — `Cannot find module './log-file.js'`.

- [ ] **Step 3: Implement `log-file.ts`**

Mirror `startupEventsFilePath` but `.log`:

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startupEventsRootForHome } from './writer.js';

export function startupLogFilePath(key: string, home: string = homedir()): string {
  return join(startupEventsRootForHome(home), `${key}.log`);
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npm test --workspace=crew-cli -- log-file`
Expected: PASS.

- [ ] **Step 5: Write the failing executor capture test**

In `executor.test.ts`, assert that launching a `run` action opens the log file and the child's stdout/stderr are directed to it. Use the existing executor test harness (it injects `launch`); assert `launch` receives stdio targeting `startupLogFilePath(action.ticketKey)`. Match the file's existing mock style:

```ts
it('directs the spawned run stdio to the per-key startup log', async () => {
  const launch = vi.fn().mockResolvedValue({ pid: 10, pgid: 10 });
  await executeAction(runAction('CREW-9'), { ...deps, launch });
  const opts = launch.mock.calls[0][2];
  expect(opts.stdoutPath ?? opts.logFile).toContain('/.crew/startup/CREW-9.log');
});
```

(Adapt the assertion to the actual `launch` signature — see Step 7 for the option shape.)

- [ ] **Step 6: Run it — expect FAIL**

Run: `npm test --workspace=crew-cli -- executor`
Expected: FAIL — no log path passed yet.

- [ ] **Step 7: Redirect the child stdio in `executor.ts`**

In the `run` (and `fix-pr`/`resume`) launch path, compute `const logPath = startupLogFilePath(action.ticketKey)`, ensure its dir exists (`mkdirSync(dirname(logPath), { recursive: true })`), and pass it through `launch` so the real launcher opens it append-mode (`openSync(logPath, 'a')`) and sets the detached child's `stdio: ['ignore', fd, fd]`. Thread a `logFile?: string` option through `LaunchDeps.launch`. Keep the daemon `register` flow unchanged.

- [ ] **Step 8: Run executor tests — expect PASS**

Run: `npm test --workspace=crew-cli -- executor`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/lib/startup-events/log-file.ts packages/cli/src/lib/startup-events/log-file.test.ts packages/cli/src/lib/runner/executor.ts packages/cli/src/lib/runner/executor.test.ts
git commit -m "feat(runner): capture crew run startup stdio to ~/.crew/startup/<key>.log (T1)"
```

---

## Task T2: Daemon read + log-serving surfaces

**Depends on T1** (the startup-log endpoint serves the files T1 writes).

**Files:**
- Create: `packages/daemon/src/services/RunnerPageService.ts` (read queries) + test
- Modify: `packages/daemon/src/routes/runner.ts` (new routes) ; `docker-compose.yml` (mount `~/.crew/startup` read-only) ; `packages/daemon/src/container.ts` (register the service)
- Create: `bruno/endpoints/runner/get-page.bru`, `get-startup-log.bru`, `get-supervisor-log.bru`
- Test: route tests under `packages/daemon/src/routes/` per the existing pattern

**Interfaces:**
- Produces:
  - `GET /api/runner/page` → `{ failedToStart: FailedStartView[], queued: QueuedActionView[], recentlyEnded: EndedRunView[] }` (shapes already defined in `packages/dashboard/src/components/runner/types.ts` — mirror them in `crew-shared`).
  - `GET /api/runs/:key/startup-log` → `text/plain` body for ended runs; `text/event-stream` tail when `?follow=1`.
  - `GET /api/runner/supervisor-log` → tail of the supervisor management lines.
- Consumes: `RunFailureService` (failed-start rows), `runs`/`action_requests` tables, `startupLogFilePath` (path shape from T1).

- [ ] **Step 1: Write the failing RunnerPageService test**

```ts
it('returns failed-start, queued, and recently-ended from the db', async () => {
  // seed: a runs row status='failed-start' (unacked), an action_requests pending row, a runs row status='finished'
  const page = await service.getPage();
  expect(page.failedToStart.map(r => r.agentKey)).toContain('CREW-A');
  expect(page.queued.map(q => q.ticketKey)).toContain('CREW-B');
  expect(page.recentlyEnded.map(r => r.agentKey)).toContain('CREW-C');
});
```

- [ ] **Step 2: Run it — expect FAIL** — `npm test --workspace=crew-daemon -- RunnerPageService` → FAIL (service missing).

- [ ] **Step 3: Implement `RunnerPageService.getPage()`**

Three Kysely reads: `runs` where `status='failed-start'` and `acknowledged=0` (map to `FailedStartView` using `failure_*` columns); `action_requests` where `status='pending'` (map to `QueuedActionView`); `runs` where `status in ('finished','error','pr_merged','abandoned','cancelled')` order by `completed_at desc` limit 50 (map to `EndedRunView`). Mirror existing service/DI patterns (`RunFailureService`).

- [ ] **Step 4: Run it — expect PASS** — same command → PASS.

- [ ] **Step 5: Register service + add `GET /api/runner/page` route; write a route test**

Thin handler calls `runnerPageService.getPage()`. Route test asserts 200 + the three keys. Run the daemon route test → PASS.

- [ ] **Step 6: Add the startup-log route (static + SSE) + test**

`GET /api/runs/:key/startup-log`: read `startupLogFilePath(key)` (the daemon's mounted view, e.g. `/root/.crew/startup/<key>.log`); 404 when absent; stream the body; when `?follow=1`, `text/event-stream` tailing appended lines (reuse the chokidar/tail approach the runner-logs route uses). Test: seed a temp log file, assert body; assert 404 for a missing key.

- [ ] **Step 7: Add the supervisor-log route + test**

`GET /api/runner/supervisor-log`: tail `runner.log` (already mounted at `/root/.crew/runner`), filtered to management lines (spawn/respawn/heartbeat/reap). If `runner.log` lines aren't tagged enough to filter reliably, serve the raw tail and note the filtering refinement (spec open question). Test the static read.

- [ ] **Step 8: Mount the startup dir + Bruno**

In `docker-compose.yml` daemon `volumes:`, add `- ${HOME}/.crew/startup:/root/.crew/startup:ro` (next to the state-events mount). Add the three Bruno endpoints. Run: `npm run bruno:smoke` → PASS (or the routes respond).

- [ ] **Step 9: Commit**

```bash
git add packages/daemon/src/services/RunnerPageService.ts packages/daemon/src/services/RunnerPageService.test.ts packages/daemon/src/routes/runner.ts packages/daemon/src/container.ts docker-compose.yml bruno/endpoints/runner/ packages/shared/
git commit -m "feat(daemon): runner page-data + startup-log + supervisor-log read surfaces (T2)"
```

---

## Task T3: Run drawer (dashboard)

**Depends on T2.**

**Files:**
- Create: `packages/dashboard/src/components/runner/RunDrawer.tsx` + test
- Modify: `packages/dashboard/src/components/runner/useRunnerPageData.ts` (consume `/api/runner/page`); `ProcessRow.tsx` / `FailedToStartSection.tsx` / `RecentlyEnded.tsx` (row → open drawer); `packages/dashboard/src/data/HttpDaemonClient.ts` + `DaemonClient.ts` (add `getRunnerPage`, `getStartupLog`)
- Test: `RunDrawer.test.tsx`, update `useRunnerPageData` / section tests

**Interfaces:**
- Consumes: `getRunnerPage(): Promise<RunnerPageData>`, `getStartupLog(key, {follow}): ...` from the client; the `FailedStartView`/`EndedRunView`/`LiveProcess` row types.
- Produces: `<RunDrawer runKey ... onClose />` — reuses the existing drawer shell (the agent drawer's `Drawer`/`DrawerHeader`).

- [ ] **Step 1: Write the failing RunDrawer test** — renders header (agentKey, command, state), failed-start diagnosis (check/headline/remediation), and a console-log region fed by `getStartupLog`. Assert the diagnosis text and that the startup log lines render.

- [ ] **Step 2: Run it — expect FAIL** — `npm test --workspace=crew-dashboard -- RunDrawer` → FAIL.

- [ ] **Step 3: Implement `RunDrawer.tsx`** — reuse the drawer shell; sections: header, meta (PID/PGID/project/timestamps), diagnosis (failed-start only — move the `ViewOutputModal` content here), console log (TanStack Query against `getStartupLog`, SSE tail when the run is in-flight). Delete/redirect `ViewOutputModal` usage.

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Wire `useRunnerPageData` + rows to the drawer; write the failing integration test** — assert the three sections render data from a mocked `getRunnerPage`, and clicking a failed-start row opens the drawer.

- [ ] **Step 6: Run it — expect FAIL** (stubs still `[]`).

- [ ] **Step 7: Replace the `[]` stubs** in `useRunnerPageData` with the fetched `failedToStart`/`recentlyEnded` (queued handled in T6); add the client methods; make rows clickable → `RunDrawer`.

- [ ] **Step 8: Lint + typecheck + dashboard tests** — `npm run lint && npm run typecheck && npm test --workspace=crew-dashboard` → PASS.

- [ ] **Step 9: Visual fidelity** — run `visual-fidelity-check` against the run drawer once its Figma source exists (interactive build — see T-Figma).

- [ ] **Step 10: Commit** — `git commit -m "feat(dashboard): run drawer + failed/recently-ended sections wired (T3)"`.

---

## Task T4: Supervisor drawer (dashboard)

**Depends on T2.**

**Files:** Create `packages/dashboard/src/components/runner/SupervisorDrawer.tsx` + test; Modify `SupervisorCard.tsx` (open the drawer); `HttpDaemonClient.ts` (`getSupervisorLog`).

- [ ] **Step 1: Failing test** — clicking the SupervisorCard opens a drawer that tails `getSupervisorLog`; assert management lines render.
- [ ] **Step 2: Run → FAIL** (`-- SupervisorDrawer`).
- [ ] **Step 3: Implement** the drawer (reuse the shell; console-log region against `getSupervisorLog` with SSE tail) + the SupervisorCard click handler + client method.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Lint + typecheck + tests → PASS.**
- [ ] **Step 6: Commit** — `"feat(dashboard): supervisor drawer tailing the management log (T4)"`.

---

## Task T5: Supervisor controls (Stop/Restart wired; cold Start = CLI hint)

**Parallel with T1** (independent of the log/drawer pillars).

**Files:**
- Modify: `packages/shared` (`runner_commands` kind enum → add `supervisor_stop`, `supervisor_restart`); the daemon `runner_commands` route/service; `packages/cli/src/lib/runner/commands.ts` + `loop.ts` (`drainCommands`) to apply supervisor commands; `packages/cli/src/lib/runner/supervisor.ts` (apply stop/restart); `packages/dashboard/src/components/runner/SupervisorCard.tsx` + `data/runnerControls.ts` (wire `onStop`/`onRestart`; `onStart` → hint)
- Create: `bruno/endpoints/runner/post-supervisor-command.bru` (if a new route) or extend the existing runner-command Bruno
- Test: `commands.test.ts` (apply supervisor_stop/restart), daemon route test, `SupervisorCard` test

- [ ] **Step 1: Failing test (CLI apply)** — in `commands.test.ts`, `applyCommand({kind:'supervisor_stop'}, deps)` signals the supervisor to exit; `supervisor_restart` triggers a re-exec/respawn. Assert via injected boundaries (no real process signalling).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the new command kinds in `commands.ts` (a `supervisorControl` boundary injected like `kill`/`resume`) + `supervisor.ts` handling (stop = graceful exit; restart = exit-and-respawn per the existing self-respawn design — see spec open question).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Failing daemon test** — enqueue route accepts `supervisor_stop`/`supervisor_restart`; the reverse-queue claim returns them. Run → FAIL → implement (extend the `runner_commands` enqueue validation + kind enum) → PASS. Add Bruno.
- [ ] **Step 6: Failing dashboard test** — `SupervisorCard` Stop/Restart call `enqueueRunnerCommand({kind:'supervisor_stop'|'supervisor_restart'})`; Start renders the `crew runner start` hint, does not enqueue. Run → FAIL → wire `runnerControls.ts` + `SupervisorCard` → PASS.
- [ ] **Step 7: Lint + typecheck + tests + bruno → PASS.**
- [ ] **Step 8: Commit** — `"feat(runner): wire supervisor Stop/Restart via reverse-queue; cold Start = CLI hint (T5)"`.

---

## Task T6: Queued section wiring (dashboard)

**Depends on T2.** Small — could fold into T3.

**Files:** Modify `packages/dashboard/src/components/runner/QueuedActions.tsx` (consume `queued`); `useRunnerPageData.ts` (replace the `queued: []` stub).

- [ ] **Step 1: Failing test** — `QueuedActions` renders rows from a mocked `getRunnerPage().queued`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Replace the `queued: []` stub** with the fetched data; render rows.
- [ ] **Step 4: Run → PASS; lint + typecheck → PASS.**
- [ ] **Step 5: Commit** — `"feat(dashboard): wire the Queued actions section to /api/runner/page (T6)"`.

---

## T-Figma (interactive): build the run + supervisor drawers into Figma

Per the CREW-235 precedent, the canonical Figma build of the two drawers into `Dashboard Screens` (out of `Composites`) is an **interactive** ticket (visual judge), and visual-fidelity for T3/T4 validates against it. Driven live in-session, not `crew run`. Snapshot-refresh after.

---

## Self-review notes

- **Spec coverage:** §1 capture → T1; §2 serve → T2; §3 run drawer → T3; §4 supervisor drawer → T4; §5 controls → T5; queued section → T6; Figma/visual-fidelity → T-Figma. Removing the global Logs section is a no-op (v1 already dropped it).
- **Type consistency:** `RunnerPageData`/`FailedStartView`/`QueuedActionView`/`EndedRunView` are the existing `runner/types.ts` shapes, mirrored into `crew-shared` in T2 and consumed in T3/T6. `startupLogFilePath` defined in T1, consumed in T2. `supervisor_stop`/`supervisor_restart` defined in T5 shared enum, consumed CLI + dashboard.
- **Open questions (from spec)** carried as in-task notes: supervisor-log filtering (T2 step 7), restart semantics (T5 step 3), log retention (not blocking — a follow-on cleanup).
