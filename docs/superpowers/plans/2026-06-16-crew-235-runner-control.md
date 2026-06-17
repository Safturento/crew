# Runner Control Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the host runner track the agent subprocesses it spawns, let the operator cancel/control them from the dashboard, surface startup failures with their cause, and give it all a first-class Runner page.

**Architecture:** The runner pushes a live-process snapshot on its existing 5s heartbeat; the daemon mirrors it in-memory (`RunnerStatusService`) + SSE at `GET /api/runner/status`. Control flows back through a persisted `runner_commands` reverse queue the runner drains each cycle, signalling the tracked process-group and landing a clean `completeRun`. Init failures register a run in `launching` *before* preflight and report a structured `failed-start`. Correlation key throughout: `agentKey`.

**Tech Stack:** Fastify + `fastify-type-provider-zod`, Kysely + `kysely-better-sqlite3`, `@fastify/awilix` DI, Vitest, React + Vite (dashboard), `execa`/`node:child_process` (runner), Bruno (HTTP smoke). Figma DS via `use_figma` (interactive lane).

**Spec:** `docs/superpowers/specs/2026-06-16-crew-235-runner-control-design.md`. Read it before starting — it carries the rationale, the Figma frame IDs, and the resolved decisions.

---

## Reading list (per task, before touching code)

- Daemon services/routes/migrations: `.agents/architecture.md`, `packages/daemon/AGENTS.md`, `.agents/testing.md` (Bruno).
- Runner / dispatch flow: `.agents/dispatch.md`, `packages/cli/AGENTS.md`.
- Dashboard / DS / `.figma.tsx`: `.agents/design-system.md`.
- Before claiming any task done: `superpowers:verification-before-completion`, `agents-doc-parity-check`, and (UI tasks) `visual-fidelity-check`.

## File Structure

**Shared (`packages/shared/src/`)**
- Modify `types/` (wherever `ActionRequest`/run types live) — add `LiveProcess`, `RunnerSnapshot`, `RunnerCommand`, `RunnerCommandKind`, and the `failed-start` run state + failure fields. Re-export from the package index.

**Daemon (`packages/daemon/src/`)**
- Create `migrations/0008_runner_commands.ts` (+ `.test.ts`) — `runner_commands` table.
- Create `migrations/0009_run_failure_fields.ts` (+ `.test.ts`) — `failed-start` support + `acknowledged` + failure columns on `runs`.
- Modify `services/RunnerStatusService.ts` (+ test) — hold the live snapshot; expose `setSnapshot`/`snapshot`.
- Create `services/RunnerCommandsService.ts` (+ test) — enqueue / claim-pending / report-result over `runner_commands`.
- Modify `services/AgentsService.ts` (or wherever `completeRun`/run-state writes live) — `failed-start` write path + `acknowledge` + supersede-on-new-run; the reaper's orphan settle.
- Modify `routes/runner.ts` (+ test) — extend `POST /api/runner/heartbeat` to accept a snapshot; `GET /api/runner/status` returns snapshot; add `POST /api/runner/commands`, `GET /api/runner/commands/pending`, `POST /api/runner/commands/:id/result`, `POST /api/runner/failed-start`, `POST /api/runs/:key/acknowledge`.
- Modify `container.ts` — register `runnerCommandsService`.
- Create Bruno endpoints under `bruno/endpoints/runner/` for each new route.

**CLI / runner (`packages/cli/src/`)**
- Create `lib/runner/registry.ts` (+ test) — in-memory `agentKey → {pid,pgid,command,...}` map + snapshot serialization.
- Modify `lib/runner/executor.ts` (+ test) — `launch` returns the spawned `{pid,pgid}`; `executeAction` records it in the registry.
- Modify `lib/runner/loop.ts` (+ test) — heartbeat carries the snapshot; each cycle drains `runner_commands` and applies them (signal pgid + `completeRun`).
- Create `lib/runner/commands.ts` (+ test) — pure apply mapping (`cancel_soft`/`cancel_hard`/`dequeue`/`reap` → effect).
- Modify `lib/runner/worker.ts` — wire registry + command-apply boundaries.
- Modify `commands/runner.ts` — `crew runner status` renders the live registry.
- Modify `commands/run.ts` + `lib/run/agent-environment.ts` — register `launching` before preflight; on `PreflightError`, POST `failed-start`.
- Modify `daemon-client/index.ts` — add `reportSnapshot`, `claimPendingCommand`, `reportCommandResult`, `reportFailedStart`, `acknowledgeRun`.

**Dashboard (`packages/dashboard/src/`)**
- Modify `routing/parseRoute.ts` (+ test) — add `runner` route kind.
- Modify `components/TopNav.tsx` (+ figma/test) — Runner tab.
- Modify `App.tsx` — route the Runner page.
- Create `routes/RunnerPage.tsx` + section components under `components/runner/` (+ tests).
- Modify `components/DrawerHeader.tsx` (+ figma/test) — Cancel control for running agents.
- Modify data hooks / `data/` — `useRunnerStatus` consuming `/api/runner/status` + SSE; mutation hooks for the control actions.

**Figma (interactive lane — no code)**
- `Composites`: `TopNav` runner-tab variant; new composites (SupervisorCard, ProcessRow, FailedStartCard).
- `Dashboard Screens`: assemble the Runner page; drawer-cancel state.
- `.figma.tsx` Code Connect for the new composites; `figma-snapshot` refresh.

---

# Autonomous lane (`crew run`)

## Task 1: Shared types

**Files:**
- Modify: `packages/shared/src/` (run/action types module + package index)
- Test: colocated `.test.ts` (type-only — a compile assertion test)

- [ ] **Step 1: Add the types**

```typescript
// In the shared types module (next to ActionRequest)
export type RunnerCommandKind =
  | 'cancel_soft'
  | 'cancel_hard'
  | 'dequeue'
  | 'reap'
  // designed-for, applied in the fast-follow:
  | 'pause'
  | 'resume'
  | 'message';

export type LiveProcessState = 'launching' | 'running' | 'cancelling' | 'paused';

export interface LiveProcess {
  agentKey: string;
  command: 'run' | 'fix-pr' | 'finish';
  pid: number;
  pgid: number;
  actionRequestId: number | null;
  spawnedAt: string; // ISO
  state: LiveProcessState;
  project: string;
}

export interface RunnerSnapshot {
  processes: LiveProcess[];
}

export interface RunnerCommand {
  id: number;
  agentKey: string | null;
  kind: RunnerCommandKind;
  payload: { message?: string } | null;
  status: 'pending' | 'claimed' | 'applied' | 'failed';
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// Run terminal states — extend the existing union with failed-start.
export type RunFailure = {
  check: string;
  headline: string;
  remediation: string;
  output: string;
};
```

- [ ] **Step 2: Re-export from the package index, typecheck**

Run: `npm run -w crew-shared typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): runner control + live-process + failed-start types (CREW-235)"
```

## Task 2: `runner_commands` migration

**Files:**
- Create: `packages/daemon/src/migrations/0008_runner_commands.ts`
- Test: `packages/daemon/src/migrations/0008_runner_commands.test.ts`

- [ ] **Step 1: Write the failing migration test** (mirror `0006_action_requests.test.ts` — apply the migration to an in-memory db, assert the table + columns exist and a row round-trips).

```typescript
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../test/makeTestDb.js'; // match the helper 0006's test uses
import { up } from './0008_runner_commands.js';

describe('0008_runner_commands', () => {
  it('creates runner_commands with the expected columns', async () => {
    const db = makeTestDb();
    await up(db);
    await db
      .insertInto('runner_commands')
      .values({
        agent_key: 'CREW-231',
        kind: 'cancel_soft',
        payload: null,
        status: 'pending',
        error: null,
        created_at: '2026-06-16T00:00:00.000Z',
        updated_at: '2026-06-16T00:00:00.000Z',
      })
      .execute();
    const row = await db.selectFrom('runner_commands').selectAll().executeTakeFirstOrThrow();
    expect(row.kind).toBe('cancel_soft');
    expect(row.status).toBe('pending');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm run -w crew-daemon test -- 0008` → FAIL (module not found).

- [ ] **Step 3: Write the migration** (copy `0006`'s `up` shape — Kysely `schema.createTable`).

```typescript
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('runner_commands')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('agent_key', 'text')
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('payload', 'text') // JSON or null
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('pending'))
    .addColumn('error', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();
  await db.schema
    .createIndex('runner_commands_pending_idx')
    .on('runner_commands')
    .columns(['status'])
    .execute();
}
```

- [ ] **Step 4: Register the table in `DaemonDatabase`** (`packages/daemon/src/db.ts`) — add the `runner_commands` interface matching the columns, and wire `0008` into the migration list however the repo registers migrations (match how `0007` is registered).

- [ ] **Step 5: Run tests** — `npm run -w crew-daemon test -- 0008` → PASS. `npm run -w crew-daemon typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/migrations/0008_runner_commands.ts packages/daemon/src/migrations/0008_runner_commands.test.ts packages/daemon/src/db.ts
git commit -m "feat(daemon): runner_commands migration (CREW-235)"
```

## Task 3: `RunnerCommandsService`

**Files:**
- Create: `packages/daemon/src/services/RunnerCommandsService.ts`
- Test: `packages/daemon/src/services/RunnerCommandsService.test.ts`
- Modify: `packages/daemon/src/container.ts`

- [ ] **Step 1: Write failing tests** for `enqueue`, `claimPending` (atomic pending→claimed), `reportResult` (claimed→applied|failed). Mirror `ActionService.test.ts` structure (real in-memory db via the test helper).

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from '../test/makeTestDb.js';
import { up } from '../migrations/0008_runner_commands.js';
import { EventBus } from './EventBus.js';
import { RunnerCommandsService } from './RunnerCommandsService.js';

describe('RunnerCommandsService', () => {
  let svc: RunnerCommandsService; let db: any;
  beforeEach(async () => { db = makeTestDb(); await up(db); svc = new RunnerCommandsService({ db, eventBus: new EventBus() }); });

  it('enqueue then claimPending returns the row and marks it claimed', async () => {
    const { id } = await svc.enqueue({ agentKey: 'CREW-231', kind: 'cancel_soft', payload: null });
    const claimed = await svc.claimPending();
    expect(claimed?.id).toBe(id);
    expect((await svc.claimPending())).toBeNull(); // already claimed
  });

  it('reportResult moves claimed → applied', async () => {
    const { id } = await svc.enqueue({ agentKey: 'CREW-231', kind: 'cancel_hard', payload: null });
    await svc.claimPending();
    await svc.reportResult(id, 'applied');
    const row = await db.selectFrom('runner_commands').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.status).toBe('applied');
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npm run -w crew-daemon test -- RunnerCommandsService` → FAIL.

- [ ] **Step 3: Implement the service** (claim is a single UPDATE…RETURNING the oldest `pending`, mirroring `ActionService.claimPendingAction`; publish `runner.command_changed` on the EventBus on each transition for SSE).

```typescript
import type { Kysely } from 'kysely';
import type { DaemonDatabase } from '../db.js';
import type { RunnerCommand, RunnerCommandKind } from 'crew-shared';
import type { EventBus } from './EventBus.js';

export class RunnerCommandsService {
  constructor(private deps: { db: Kysely<DaemonDatabase>; eventBus: EventBus }) {}

  async enqueue(input: { agentKey: string | null; kind: RunnerCommandKind; payload: RunnerCommand['payload'] }) {
    const now = new Date().toISOString();
    const row = await this.deps.db.insertInto('runner_commands')
      .values({ agent_key: input.agentKey, kind: input.kind, payload: input.payload ? JSON.stringify(input.payload) : null, status: 'pending', error: null, created_at: now, updated_at: now })
      .returningAll().executeTakeFirstOrThrow();
    this.deps.eventBus.publish({ type: 'runner.command_changed', data: { id: row.id, status: 'pending' } });
    return { id: row.id };
  }

  async claimPending(): Promise<RunnerCommand | null> {
    const now = new Date().toISOString();
    const row = await this.deps.db.updateTable('runner_commands')
      .set({ status: 'claimed', updated_at: now })
      .where('id', '=', (eb) => eb.selectFrom('runner_commands').select('id').where('status', '=', 'pending').orderBy('id', 'asc').limit(1))
      .returningAll().executeTakeFirst();
    return row ? this.toModel(row) : null;
  }

  async reportResult(id: number, status: 'applied' | 'failed', error?: string) {
    await this.deps.db.updateTable('runner_commands')
      .set({ status, error: error ?? null, updated_at: new Date().toISOString() })
      .where('id', '=', id).execute();
    this.deps.eventBus.publish({ type: 'runner.command_changed', data: { id, status } });
  }

  private toModel(row: any): RunnerCommand { /* map snake_case → camelCase, JSON.parse(payload) */ return { id: row.id, agentKey: row.agent_key, kind: row.kind, payload: row.payload ? JSON.parse(row.payload) : null, status: row.status, error: row.error, createdAt: row.created_at, updatedAt: row.updated_at }; }
}
```

> If the repo's Kysely version doesn't support the subquery-in-`where` claim form, copy the exact claim implementation from `ActionService.claimPendingAction` — match it rather than inventing a variant.

- [ ] **Step 4: Register in `container.ts`** — add `runnerCommandsService` to `DaemonCradle` and `buildContainer` (scoped, mirroring `actionService`):

```typescript
runnerCommandsService: asFunction(
  ({ db, eventBus }: DaemonCradle) => new RunnerCommandsService({ db, eventBus }),
).scoped(),
```

- [ ] **Step 5: Run tests + typecheck** → PASS.

- [ ] **Step 6: Commit** — `feat(daemon): RunnerCommandsService over runner_commands (CREW-235)`.

## Task 4: Snapshot on `RunnerStatusService` + extended runner routes

**Files:**
- Modify: `packages/daemon/src/services/RunnerStatusService.ts` (+ test)
- Modify: `packages/daemon/src/routes/runner.ts` (+ test)
- Create: `bruno/endpoints/runner/*.bru`

- [ ] **Step 1: Failing test — snapshot round-trips on the service.**

```typescript
it('stores and returns the latest live-process snapshot', () => {
  const svc = new RunnerStatusService({ eventBus: new EventBus() });
  svc.heartbeat({ processes: [{ agentKey: 'CREW-231', command: 'run', pid: 1, pgid: 1, actionRequestId: null, spawnedAt: 'x', state: 'running', project: 'crew' }] });
  expect(svc.status().processes).toHaveLength(1);
});
```

- [ ] **Step 2: Run, fail.** `heartbeat()` takes no arg today.

- [ ] **Step 3: Extend the service** — `heartbeat(snapshot?: RunnerSnapshot)` stores `this.snapshot = snapshot ?? { processes: [] }`; `status()` returns `{ online, lastSeen, processes }`; publish the snapshot on a **dedicated `runner.snapshot_changed`** SSE event (only when a snapshot body is supplied). Do **not** fold it into `runner.status_changed` — that event fires only on online/offline edges (guarded by `emittedOnline`, with edge tests asserting exactly-once emission and exact `{online, lastSeen}` equality), so a per-heartbeat snapshot would break edge semantics. Keep the existing edge logic untouched. _(Shipped this way in CREW-242; see `docs/tickets/CREW-242.md` for the full rationale.)_

- [ ] **Step 4: Failing route tests** (mirror `runner.test.ts`) — `POST /api/runner/heartbeat` with a `{ snapshot }` body stores it; `GET /api/runner/status` returns `processes`; the new command routes enqueue/claim/result.

- [ ] **Step 5: Extend `routes/runner.ts`** — widen `RunnerStatusResponseSchema` with `processes: z.array(LiveProcessSchema)`; accept an optional `body: { snapshot }` on heartbeat; add:
  - `POST /api/runner/commands` → `runnerCommandsService.enqueue`
  - `GET /api/runner/commands/pending` → `claimPending` (long-poll optional; a plain claim is fine for v1 since the runner already cycles every 5s)
  - `POST /api/runner/commands/:id/result` → `reportResult`

- [ ] **Step 6: Bruno endpoints** — add one `.bru` per new route under `bruno/endpoints/runner/` (run `bruno-collection-maintenance` skill). Verify with `npm run bruno:smoke`.

- [ ] **Step 7: Run daemon tests + typecheck** → PASS.

- [ ] **Step 8: Commit** — `feat(daemon): live-process snapshot on status + runner command routes (CREW-235)`.

## Task 5: Runner registry + signalling (host side)

**Files:**
- Create: `packages/cli/src/lib/runner/registry.ts` (+ test)
- Create: `packages/cli/src/lib/runner/commands.ts` (+ test)
- Modify: `packages/cli/src/lib/runner/executor.ts` (+ test)
- Modify: `packages/cli/src/lib/runner/loop.ts` (+ test)
- Modify: `packages/cli/src/daemon-client/index.ts`

- [ ] **Step 1: Failing test for the registry** — `add`/`remove`/`get`/`toSnapshot`; ended entries drop from the snapshot.

```typescript
import { describe, it, expect } from 'vitest';
import { Registry } from './registry.js';

describe('Registry', () => {
  it('tracks spawned processes and serializes a snapshot', () => {
    const r = new Registry();
    r.add({ agentKey: 'CREW-231', command: 'run', pid: 10, pgid: 10, actionRequestId: 1, spawnedAt: 'x', state: 'running', project: 'crew' });
    expect(r.toSnapshot().processes).toHaveLength(1);
    r.remove('CREW-231');
    expect(r.toSnapshot().processes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, fail. Step 3: Implement `Registry`** — a `Map<string, LiveProcess>` with `add/remove/get/setState/toSnapshot`.

- [ ] **Step 4: Failing test for `commands.ts` apply-mapping** — pure function mapping a `RunnerCommand` + registry to an effect (signal pgid / no-op), returning what to `completeRun`. Inject `kill` + `completeRun` boundaries.

```typescript
it('cancel_soft SIGTERMs the tracked pgid and completes the run cancelled', async () => {
  const kill = vi.fn(); const completeRun = vi.fn();
  const reg = new Registry(); reg.add({ agentKey: 'CREW-231', command: 'run', pid: 10, pgid: 10, actionRequestId: 1, spawnedAt: 'x', state: 'running', project: 'crew' });
  await applyCommand({ id: 1, agentKey: 'CREW-231', kind: 'cancel_soft', payload: null, status: 'claimed', error: null, createdAt: 'x', updatedAt: 'x' }, { registry: reg, kill, completeRun });
  expect(kill).toHaveBeenCalledWith(-10, 'SIGTERM'); // negative pid = process group
  expect(reg.get('CREW-231')?.state).toBe('cancelling');
});
```

- [ ] **Step 5: Implement `applyCommand`** — `cancel_soft` → `kill(-pgid,'SIGTERM')` + set state `cancelling`; `cancel_hard` → `kill(-pgid,'SIGKILL')` + `completeRun(cancelled)`; `dequeue` → call the daemon to drop the pending action_request (no process); `reap` → `completeRun` the orphan terminal without signalling. Unknown kinds (`pause`/`resume`/`message` in v1) → report `failed` "not yet supported".

- [ ] **Step 6: Modify `executor.ts`** — `launch` resolves to `{ pid, pgid }` (spawn with `detached: true` so the child gets its own process group = its pid; capture `child.pid`). `executeAction` gains a `registry` dep and `registry.add(...)` on a successful launch, keyed by `action.ticketKey`. Update `executor.test.ts` to assert the registry entry.

- [ ] **Step 7: Modify `loop.ts`** — `runLoop` (a) passes `registry.toSnapshot()` into `client.heartbeat(snapshot)`; (b) after each `runOnce`, calls a new `drainCommands(client, registry)` that claims pending `runner_commands` and `applyCommand`s them. Add tests for both.

- [ ] **Step 8: Add daemon-client methods** — `reportSnapshot` (folded into `heartbeat(snapshot)`), `claimPendingCommand`, `reportCommandResult`, `reportFailedStart`, `acknowledgeRun`. Match the never-throws style of the existing client.

- [ ] **Step 9: Run cli tests + typecheck** → PASS.

- [ ] **Step 10: Commit** — `feat(cli): runner registry, snapshot heartbeat, command apply (CREW-235)`.

## Task 6: `crew runner status` renders the registry

**Files:**
- Modify: `packages/cli/src/commands/runner.ts` (+ test if one exists for status rendering)

- [ ] **Step 1: Failing test** — `crew runner status` output includes a live-process line per snapshot entry (drive via the daemon-client returning a snapshot).

- [ ] **Step 2: Implement** — `status` fetches `/api/runner/status` and renders supervisor up/down + a table of live processes (agentKey, command, pid, state, duration). Keep the existing supervisor-only output as the header.

- [ ] **Step 3: Run, PASS. Step 4: Commit** — `feat(cli): crew runner status shows live processes (CREW-235)`.

## Task 7: Register-before-preflight + structured failed-start

**Files:**
- Modify: `packages/daemon/src/migrations/0009_run_failure_fields.ts` (+ test) and `db.ts`
- Modify: `packages/daemon/src/services/AgentsService.ts` (or the run-state writer) + reaper
- Modify: `packages/daemon/src/routes/` (runs/agents) — `POST /api/runner/failed-start`, `POST /api/runs/:key/acknowledge`
- Modify: `packages/cli/src/commands/run.ts`, `packages/cli/src/lib/run/agent-environment.ts`

- [ ] **Step 1: Migration test + migration `0009`** — add to `runs`: `failure_check`, `failure_headline`, `failure_remediation`, `failure_output` (all text, nullable), `acknowledged` (integer default 0). `failed-start` is a `status` value (text column — no DDL needed, just app validation). Register in `db.ts`.

- [ ] **Step 2: Failing service test** — `recordFailedStart({ key, project, command, failure })` writes a run row with `status='failed-start'` + failure fields; `acknowledge(key)` sets `acknowledged=1`; a new `registerRun` for the same key auto-acknowledges any prior unacknowledged `failed-start`.

- [ ] **Step 3: Implement** those three behaviors on the service. The auto-acknowledge: in `registerRun`, `UPDATE runs SET acknowledged=1 WHERE key=? AND status='failed-start' AND acknowledged=0`.

- [ ] **Step 4: Reaper change** — when settling an orphan (running in DB, no live process per the latest snapshot), set the terminal state; if it never reached `running` (was `launching`), prefer `failed-start` with a generic "process exited before registering" failure, else `cancelled`/`error` per existing reaper logic. Add a test driving a stuck `launching` row + empty snapshot.

- [ ] **Step 5: Routes** — `POST /api/runner/failed-start` (body: key, project, command, failure) → `recordFailedStart`; `POST /api/runs/:key/acknowledge` → `acknowledge`. Bruno endpoints + `bruno:smoke`.

- [ ] **Step 6: Failing test in the run flow** — `prepareAgentEnvironment` registers `launching` before `runPreflight`, and a thrown `PreflightError` triggers a `reportFailedStart` carrying `checkName/headline/remediation/details` before exit. Mock the daemon-client; assert call order (register before preflight; failed-start on throw).

- [ ] **Step 7: Implement the reorder** in `commands/run.ts` / `lib/run/agent-environment.ts`:
  - Pre-register the run in `launching` *before* `prepareAgentEnvironment`/`runPreflight`. (Move the `registerRun` call earlier, or add a `preRegisterRun`.)
  - Wrap the preflight path so a `PreflightError` calls `daemonClient.reportFailedStart({ key, project, command, failure: { check: err.checkName, headline: err.headline, remediation: err.remediation, output: capturedStderr } })` before `renderPreflightError` + `process.exit(1)`.
  - Capture the rendered preflight output (`renderPreflightError(err)`) as `failure.output`.

- [ ] **Step 8: Run daemon + cli tests + typecheck** → PASS. Manually sanity-check `crew run` against a project with a deliberately-missing remote → a `failed-start` row appears via the daemon API.

- [ ] **Step 9: Commit** — `feat: register launching before preflight + structured failed-start capture (CREW-235)`.

## Task 8: Dashboard — Runner page

**Files:**
- Modify: `packages/dashboard/src/routing/parseRoute.ts` (+ test), `App.tsx`, `components/TopNav.tsx` (+ test)
- Create: `packages/dashboard/src/routes/RunnerPage.tsx`, `components/runner/{SupervisorCard,FailedToStartSection,LiveProcessList,UnmanagedRuns,QueuedActions,RecentlyEnded,RunnerLogs}.tsx` (+ tests)
- Modify: `packages/dashboard/src/data/` — `useRunnerStatus` (fetch `/api/runner/status` for the initial seed + subscribe to **both** `runner.status_changed` (online/offline health-chip edge) **and** `runner.snapshot_changed` (the live-process list — CREW-242 shipped the snapshot on this dedicated event, not `runner.status_changed`)) and control-action mutation hooks (`useCancelRun`, `useForceKill`, `useReap`, `useDequeue`, `useArchiveFailedStart`).

- [ ] **Step 1: Route test** — `parseRoute('#/runner')` → `{ kind: 'runner' }`. Implement the route kind + `navigate`.

- [ ] **Step 2: TopNav test** — a Runner tab renders and is active on the runner route. Implement (`runnerActive = route.kind === 'runner'`; add the `NavTab`).

- [ ] **Step 3: Data hook test** — `useRunnerStatus` returns the snapshot from a mocked API + updates the live-process list on a `runner.snapshot_changed` SSE event (and the online/offline state on `runner.status_changed`). Implement following the existing runner-chip data pattern.

- [ ] **Step 4: Section components** — one test + component per section, each rendering from a fixture: SupervisorCard, FailedToStartSection (hidden when empty; Archive + View output), LiveProcessList (status slot, command badge, Pause/Cancel, cancelling→Force-kill), UnmanagedRuns (hidden when empty; Reap), QueuedActions (Dequeue), RecentlyEnded, RunnerLogs (reuse the existing `RunnerLogViewer` tail). Match the Figma reference (`739:1111`) and the DS `Pill`/`AgentRow` idioms.

- [ ] **Step 5: Cancel escalation** — `LiveProcessList` row: `Cancel` opens an `AlertModal`; on confirm, fires `useCancelRun` and the row reflects `cancelling`; a `Force kill` button appears after ~10s (timer in the row, cleared on unmount/state change) wired to `useForceKill`. Test the timer with fake timers.

- [ ] **Step 6: Wire `App.tsx`** — `route.kind === 'runner'` renders `<RunnerPage/>`.

- [ ] **Step 7: Run dashboard tests + typecheck + lint** → PASS.

- [ ] **Step 8: Commit** — `feat(dashboard): Runner page with live processes, failed-start, controls (CREW-235)`.

## Task 9: Dashboard — drawer cancel control

**Files:**
- Modify: `packages/dashboard/src/components/DrawerHeader.tsx` (+ test)

- [ ] **Step 1: Failing test** — for a running agent, the drawer header renders a `Cancel` in the action cluster; clicking it runs the same soft→hard flow (AlertModal → cancelling → Force kill after ~10s). For non-running agents, no Cancel.

- [ ] **Step 2: Implement** — add the control to the header's action cluster (next to "Open as page"), reusing the `useCancelRun`/`useForceKill` hooks and the escalation timer from Task 8 (extract the escalation into a shared `useCancelEscalation` hook so the row and the header share it — DRY).

- [ ] **Step 3: Run tests + typecheck → PASS. Step 4: Commit** — `feat(dashboard): cancel control in agent drawer header (CREW-235)`.

---

# Interactive lane (Figma — `interactive` label, driven live in-session)

> These tasks are **not** TDD/code steps and **cannot** run via `crew run`. They're driven live with the user as visual judge, using `figma-use` / `figma-generate-design` / `figma-generate-library`. Land them **early** so the autonomous dashboard tasks (8, 9) have a visual source of truth for `visual-fidelity-check`. The Brainstorm-page mockups (`739:1111`, `756:1237`) are the reference.

## Task I-1: DS composites in `Composites`

- [ ] Add a `runner` value to `TopNav`'s `Active Tab` variant axis + a `tab-runner` frame in each variant.
- [ ] Build new composites: `SupervisorCard`, `ProcessRow` (status slot + command badge + controls), `FailedStartCard` (check/headline/remediation + Archive/View output). Reuse `Pill`; follow `feedback_figma_component_properties_over_variants` for optional parts.
- [ ] Verify variants + bindings with `get_screenshot`.

## Task I-2: Assemble the Runner page into `Dashboard Screens`

- [ ] Build the full Runner page frame out of `Composites` instances (not the throwaway Brainstorm primitives), matching `739:1111`.
- [ ] Add the drawer-cancel state to the existing drawer screen (running agent → `Cancel`; cancelling → `Force kill`), matching `756:1237`.

## Task I-3: Code Connect + snapshot refresh

- [ ] Write `.figma.tsx` Code Connect for the new composites (`figma-code-connect` skill); map to the Task 8/9 components once they exist.
- [ ] Run `figma-snapshot-refresh` so `visual-fidelity-check` validates against current data.

---

# Fast-follow (separate, gated — NOT in the v1 Epic close)

## Task F-1: Pause/resume/message feasibility spike

- [ ] Prove a detached headless `claude` can be cleanly interrupted mid-turn and resumed via `spawnClaudeResume` without a half-finished tool call corrupting state. Time-boxed spike; document the outcome in `docs/tickets/` or a followup. Only if it proves out do the `pause`/`resume`/`message` apply paths in `commands.ts` + the dashboard controls graduate from designed-for to built.

---

## Verification (whole-Epic smoke)

1. `npm run -w crew-daemon test && npm run -w crew-cli test && npm run -w crew-dashboard test` → all green.
2. `npm run bruno:smoke` → new runner routes covered + green.
3. Manual: start the stack, dispatch a run, open the **Runner** page → the live process appears; `Cancel` it → row goes `cancelling` → settles in Recently ended. Dispatch a run against a project with a missing remote → it appears under **Failed to start** with the check + remediation; re-run the ticket → the failed-start auto-clears to Recently ended.
4. Open a running agent's drawer → `Cancel` is in the header and follows the same escalation.
5. `agents-doc-parity-check` + `visual-fidelity-check` (UI tasks) pass.

## Self-review notes (spec coverage)

- Live registry + snapshot → Tasks 1, 4, 5. Daemon mirror + API → Task 4. `runner_commands` → Tasks 2, 3, 5. Cancel soft/hard + escalation → Tasks 5, 8, 9. Orphan/Unmanaged + Reap → Tasks 5 (apply), 7 (reaper), 8 (UI). Failed-start + register-before-preflight + attention queue/acknowledge → Task 7 (data/flow) + Task 8 (UI). Runner page (3rd tab) → Task 8. Drawer parity → Task 9. No-orphaned-logs → Tasks 7 (capture) + 8 (RunnerLogs) + existing drawer. Pause/resume designed-for → types in Task 1, apply stub in Task 5, built in F-1. Figma build-out → I-1..I-3.
