# Dashboard-triggered agent actions — Implementation Plan

> **For crew dispatch:** This plan is decomposed into the child tickets of Epic **CREW-208**. Each phase below maps to one child ticket; the implementing agent is dispatched via `crew run <KEY>` and does its own TDD against the ticket's acceptance criteria. Steps use checkbox (`- [ ]`) syntax. **Do not auto-execute** — the maintainer triggers each ticket.

**Goal:** Let the dashboard trigger `crew run` / `crew fix-pr` / `crew finish` as in-app actions, via a daemon-owned action queue drained by a host-side runner process, with runner lifecycle commands, a health indicator, and a log viewer.

**Architecture:** The containerized daemon can't launch host work, so it records action requests in SQLite and exposes them over HTTP; a new host **runner** process long-polls, claims a request, and shells the matching CLI verb in the right repo, reporting launch status back. Action/runner/finish-step status flow to the dashboard over the existing SSE bus. The runner has a first-class lifecycle (`crew runner *`, `crew up`/`down`); plain `docker compose up` stays standalone.

**Tech Stack:** TypeScript; daemon = Fastify + `fastify-type-provider-zod` + Kysely/SQLite + Awilix DI + an in-process EventBus→SSE; CLI = commander + execa; dashboard = React + TanStack Query + `sonner` + the Crew DS composites; tests = Vitest (+ RTL on the frontend), Bruno for HTTP.

**Spec:** `docs/superpowers/specs/2026-06-03-dashboard-agent-actions-design.md`.

---

## Phase ordering / parallelism

| Phase | Ticket(s) | Sequence |
|---|---|---|
| 1 | T1 (shared contracts) | first — blocks everything |
| 2 | T2 (daemon queue), T3 (daemon runner-ops + finish intake) | parallel after T1 — disjoint daemon files |
| 3 | T4 (runner + CLI lifecycle), T5 (dashboard action layer) | parallel after T2+T3 |
| 4 | T6 (New Run modal), T7 (Fix PR modal), T8 (Finish + step checklist), T9 (runner health chip + log viewer) | parallel after T5 (T8 also needs T3; T9 needs T3) |
| 5 | end-to-end smoke (with a real runner) | after all merge |

**Recommended sequence:** `crew run T1` → wait → `crew run T2 & T3` → wait → `crew run T4 & T5` → wait → `crew run T6 & T7 & T8 & T9` → end-to-end smoke.

---

## Task T1 — Shared contracts (`crew-shared`)

**Files:**
- Create: `packages/shared/src/actions/types.ts`
- Create: `packages/shared/src/actions/schema.ts`
- Create: `packages/shared/src/actions/types.test.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

- [ ] **Step 1: Write the failing schema test**

```ts
import { describe, expect, it } from 'vitest';
import { enqueueActionSchema, finishStepSchema } from './schema.js';

describe('enqueueActionSchema', () => {
  it('accepts a run action', () => {
    expect(enqueueActionSchema.parse({ kind: 'run', ticketKey: 'CREW-1', project: 'crew' }))
      .toMatchObject({ kind: 'run' });
  });
  it('requires a comment for fix_pr', () => {
    expect(() => enqueueActionSchema.parse({ kind: 'fix_pr', ticketKey: 'CREW-1', project: 'crew' }))
      .toThrow();
  });
});
```

- [ ] **Step 2: Run it, watch it fail** — `npm run --workspace crew-shared test:run -- src/actions/types.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the contracts**

```ts
// types.ts
export type ActionKind = 'run' | 'fix_pr' | 'finish';
export type ActionStatus = 'pending' | 'claimed' | 'launching' | 'launched' | 'failed';

export interface ActionRequest {
  id: number;
  kind: ActionKind;
  ticketKey: string;
  project: string;
  payload: ActionPayload;
  status: ActionStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export type ActionPayload =
  | { kind: 'run' }
  | { kind: 'fix_pr'; comment: string }
  | { kind: 'finish' };

export type FinishStepStatus = 'ok' | 'skip' | 'error';
export interface FinishStepEvent {
  key: string;          // agent key
  index: number;        // step ordinal within the finish run
  label: string;
  status: FinishStepStatus;
  detail?: string;
  ts: number;
}
```

```ts
// schema.ts
import { z } from 'zod';
export const enqueueActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run'), ticketKey: z.string().min(1), project: z.string().min(1) }),
  z.object({ kind: z.literal('fix_pr'), ticketKey: z.string().min(1), project: z.string().min(1), comment: z.string().min(1) }),
  z.object({ kind: z.literal('finish'), ticketKey: z.string().min(1), project: z.string().min(1) }),
]);
export const finishStepSchema = z.object({
  index: z.number().int().nonnegative(),
  label: z.string().min(1),
  status: z.enum(['ok', 'skip', 'error']),
  detail: z.string().optional(),
  ts: z.number(),
});
```

- [ ] **Step 4: Re-export from `index.ts`, run tests green, typecheck.**
- [ ] **Step 5: Commit** — `feat(shared): action-request + finish-step contracts (CREW-208)`

**Acceptance:** schema + types exported from `crew-shared`; `fix_pr` requires `comment`; `npm run --workspace crew-shared typecheck && test:run` clean.

---

## Task T2 — Daemon action queue (`crew-daemon`)

**Files:**
- Create: `packages/daemon/src/migrations/00NN_action_requests.ts` (next number)
- Create: `packages/daemon/src/services/ActionService.ts` (+ `.test.ts`)
- Create: `packages/daemon/src/routes/actions.ts` (+ `.test.ts`)
- Modify: `packages/daemon/src/container.ts` (register `ActionService`)
- Modify: `packages/daemon/src/app.ts` (register routes)
- Modify: `packages/daemon/src/services/EventBus.ts` (add `action.changed` to `SsePayload`)
- Create: `bruno/endpoints/actions/{post-enqueue,get-pending,post-result}.bru`

- [ ] **Step 1: Migration** — `action_requests` table (mirror the Kysely DDL style of `0001_…`):

```ts
await db.schema.createTable('action_requests')
  .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
  .addColumn('kind', 'text', (c) => c.notNull().check(sql`kind IN ('run','fix_pr','finish')`))
  .addColumn('ticket_key', 'text', (c) => c.notNull())
  .addColumn('project', 'text', (c) => c.notNull())
  .addColumn('payload', 'text', (c) => c.notNull().defaultTo('{}'))   // JSON
  .addColumn('status', 'text', (c) => c.notNull().defaultTo('pending')
    .check(sql`status IN ('pending','claimed','launching','launched','failed')`))
  .addColumn('error', 'text')
  .addColumn('created_at', 'text', (c) => c.notNull())
  .addColumn('updated_at', 'text', (c) => c.notNull())
  .execute();
await db.schema.createIndex('idx_action_requests_status').on('action_requests').column('status').execute();
```

- [ ] **Step 2: Add the SSE payload variant** (in `EventBus.ts` `SsePayload` union):

```ts
| { type: 'action.changed'; data: { id: number; kind: ActionKind; key: string; status: ActionStatus } }
```

- [ ] **Step 3: `ActionService` — TDD the contract.** Methods (Kysely-backed; injected `db` + `eventBus` via Awilix, matching existing services):

```ts
enqueue(input: EnqueueAction): Promise<ActionRequest>;          // validates kind via schema; publishes action.changed (pending)
claimNextPending(): Promise<ActionRequest | null>;             // atomic pending→claimed (single UPDATE … RETURNING / transaction)
report(id: number, status: 'launching'|'launched'|'failed', error?: string): Promise<void>;  // publishes action.changed
```

Tests (real SQLite, in-memory): enqueue stores `pending` + emits; `claimNextPending` returns exactly one and flips it to `claimed` (two concurrent claims never return the same row); `report` updates status + emits; unknown enqueue rejected.

- [ ] **Step 4: Routes** (`fastify-type-provider-zod`, thin → service):
  - `POST /api/actions` body=`enqueueActionSchema`; also validate `project`/`ticketKey` are registered (reuse the ProjectsService); → `ActionService.enqueue`.
  - `GET /api/actions/pending` → `ActionService.claimNextPending` with **long-poll**: hold up to ~25s, resolve early when a pending row appears (subscribe to `action.changed` pending events or poll-with-await); return the claimed row or empty on timeout.
  - `POST /api/actions/:id/result` body=`{status, error?}` → `ActionService.report`.
  Route tests via Fastify `inject` (mirror existing route tests).

- [ ] **Step 5: Bruno endpoints** for the three routes (per `bruno-collection-maintenance`).
- [ ] **Step 6: Wire container + app; full daemon `typecheck + test:run + bruno:smoke` green.**
- [ ] **Step 7: Commit** — `feat(daemon): action queue + routes + SSE (CREW-208)`

**Acceptance:** enqueue→pending→claim→result lifecycle works end-to-end via HTTP; `action.changed` emitted on each transition; long-poll returns promptly when a pending action lands; Bruno covers all three; daemon verification clean.

---

## Task T3 — Daemon runner-ops + finish-step intake (`crew-daemon`)

**Files:**
- Create: `packages/daemon/src/services/RunnerStatusService.ts` (+ `.test.ts`)
- Create: `packages/daemon/src/routes/runner.ts` (+ `.test.ts`) — heartbeat + log tail
- Create: `packages/daemon/src/migrations/00NN_finish_steps.ts`
- Create: `packages/daemon/src/routes/finish-steps.ts` (+ `.test.ts`)
- Modify: `EventBus.ts` (`runner.status_changed`, `finish_step.changed`)
- Modify: `docker-compose.yml` (canonical: add `${HOME}/.crew/runner:/root/.crew/runner:ro`)
- Create: `bruno/endpoints/runner/{post-heartbeat,get-logs}.bru`, `bruno/endpoints/agents/post-finish-step.bru`

- [ ] **Step 1: SSE variants** in `EventBus.ts`:

```ts
| { type: 'runner.status_changed'; data: { online: boolean; lastSeen: number | null } }
| { type: 'finish_step.changed'; data: { key: string } }
```

- [ ] **Step 2: `RunnerStatusService`** — TDD. `heartbeat()` records `lastSeen=now` and emits `runner.status_changed{online:true}` on the rising edge; `isOnline()` returns `now - lastSeen < staleMs` (e.g. 15s); a timer (or lazy check) emits `online:false` once stale. Tests: rising/falling edge emits exactly once; staleness threshold respected.

- [ ] **Step 3: `routes/runner.ts`** — `POST /api/runner/heartbeat` → service; `GET /api/runner/logs?tail=N` reads `~/.crew/runner/runner.log` from the mounted path (return last N lines; 404→empty when absent). SSE live-tail can reuse the events stream with a `runner.log` ping, or a dedicated `text/event-stream` route — keep v1 as tail + client refetch on a `runner.log.changed` ping if simple; otherwise plain periodic tail. Tests via `inject` with a temp log file.

- [ ] **Step 4: `finish_steps` migration** — `(id pk, agent_key text refs agents.key, idx integer, label text, status text check ok|skip|error, detail text, ts text)` + index on `agent_key`.

- [ ] **Step 5: `routes/finish-steps.ts`** — `POST /api/agents/:key/finish-step` body=`finishStepSchema` → insert row + emit `finish_step.changed{key}`; `GET /api/agents/:key/finish-steps` → ordered rows. Tests via `inject`.

- [ ] **Step 6: Compose mount** — add the read-only `~/.crew/runner` mount to the **canonical** daemon service only (worktree override omits it). Note it in `.agents/local-dev.md`.

- [ ] **Step 7: Bruno + container/app wiring; daemon verification green.**
- [ ] **Step 8: Commit** — `feat(daemon): runner heartbeat/logs + finish-step intake (CREW-208)`

**Acceptance:** heartbeat flips online/offline with SSE; `GET /api/runner/logs` tails the mounted file; finish-step POST persists + pings + is retrievable in order; canonical compose mounts `~/.crew/runner` ro; Bruno + verification clean.

---

## Task T4 — Runner process + CLI lifecycle (`crew-cli`)

**Files:**
- Create: `packages/cli/src/lib/runner/loop.ts` (poll→claim→execute→report) (+ `.test.ts`)
- Create: `packages/cli/src/lib/runner/executor.ts` (verb mapping) (+ `.test.ts`)
- Create: `packages/cli/src/commands/runner.ts` (`crew runner start|stop|restart|status|logs`) (+ `.test.ts`)
- Create: `packages/cli/src/commands/up.ts`, `down.ts` (+ tests)
- Modify: `packages/cli/src/lib/daemon-client/index.ts` (add `claimPendingAction`, `reportActionResult`, `heartbeat`)
- Modify: `packages/cli/src/index.ts` (register `runner`, `up`, `down`)

- [ ] **Step 1: daemon-client methods** (mirror existing `registerRun` fetch shape): `claimPendingAction(): Promise<ActionRequest|null>` (long-poll GET), `reportActionResult(id, status, error?)` (POST), `heartbeat()` (POST). TDD against a mock fetch.

- [ ] **Step 2: `executor.ts`** — pure mapping from an `ActionRequest` to an execution. TDD with `execa` mocked:
  - `run` → `execa('crew', ['run', ticketKey], { cwd: repoDir })`
  - `fix_pr` → `execa('gh', ['pr','comment', …, '--body', payload.comment], {cwd:repoDir})` **then** `execa('crew', ['fix-pr', ticketKey, '--from-pr'], {cwd:repoDir})`
  - `finish` → `execa('crew', ['finish', ticketKey], { cwd: repoDir })`
  `repoDir` resolved from the project's config (`discoverProjectConfig`/registry). Returns `launched` on spawn success, `failed{error}` on throw. Tests: each verb maps correctly; unknown kind rejected; fix_pr posts comment before fix-pr.

- [ ] **Step 3: `loop.ts`** — long-poll `claimPendingAction`; on a claim, `report(launching)`, run executor, `report(launched|failed)`, heartbeat on an interval, structured log lines to `~/.crew/runner/runner.log`. TDD the loop with client + executor mocked: claim→launching→launched ordering; failure path reports `failed`; empty claim re-polls.

- [ ] **Step 4: `crew runner` lifecycle** — `start` spawns the loop **detached** (`spawn` with `detached:true`, `unref`), writes PID to `~/.config/crew/runner.pid`, redirects output to `~/.crew/runner/runner.log`, and **respawns on crash** (a thin supervisor or `start` writes a wrapper that restarts on non-zero exit). `stop` reads the PID and kills it (+ removes the pidfile). `restart` = stop+start. `status` reports running (pidfile + liveness) + daemon connectivity (a `heartbeat`/health probe). `logs` tails the log file. TDD with the spawn boundary mocked.

- [ ] **Step 5: `crew up` / `crew down`** — `up` = `execa('docker', ['compose','up','-d', …])` then `crew runner start`; `down` = `crew runner stop` then `docker compose down`. Compose invocation only; **never required by compose**. TDD with execa mocked.

- [ ] **Step 6: Register commands; full CLI verification green.**
- [ ] **Step 7: Commit** (logical sub-commits per the steps) — `feat(cli): runner process + crew runner/up/down (CREW-208)`

**Acceptance:** with a daemon up and a pending action, `crew runner start` drains it (correct verb in the correct repo) and reports status; `crew runner status/stop/restart/logs` behave; `crew up`/`down` orchestrate compose + runner; `docker compose up` alone is unaffected; CLI verification clean.

---

## Task T5 — Dashboard action layer + degradation (`crew-dashboard`)

**Files:**
- Create: `packages/dashboard/src/data/actions.ts` (TanStack `useMutation` hooks + fetchers) (+ test)
- Create: `packages/dashboard/src/data/useRunnerStatus.ts` (SSE-driven online/offline) (+ test)
- Modify: `packages/dashboard/src/App.tsx` (mount the `onAgentAction` handler)
- Modify: the SSE client to handle `action.changed` / `runner.status_changed`
- Modify: `packages/dashboard/src/components/AgentsList.tsx` consumer wiring as needed

- [ ] **Step 1: Mutation hooks** — `useEnqueueAction()` → `POST /api/actions`; optimistic + `sonner` toast on enqueue (`"Run queued"`) and on `action.changed` failure (error toast). TDD with a mocked fetch + query client.
- [ ] **Step 2: `useRunnerStatus()`** — derive `{online, lastSeen}` from the SSE `runner.status_changed` stream (seed from a `GET /api/runner/status` on mount). TDD with a fake SSE source.
- [ ] **Step 3: `onAgentAction` handler in `App.tsx`** — maps QuickAction kinds to `useEnqueueAction`; the existing thread from AgentRow→AgentsList finally has a handler. Disable/annotate actions when `!online` ("waiting for runner"). RTL test: clicking a wired QuickAction calls the mutation; disabled when offline.
- [ ] **Step 4: Verification (typecheck + test:run + build) green; visual-fidelity-check for any rendered change.**
- [ ] **Step 5: Commit** — `feat(dashboard): action mutation layer + runner-aware degradation (CREW-208)`

**Acceptance:** QuickAction clicks enqueue the right action with toasts; actions are disabled/annotated when no runner is online; SSE `action.changed`/`runner.status_changed` update the UI without refetch; dashboard verification clean.

---

## Task T6 — New Run modal (`crew-dashboard`)

**Files:**
- Create: `packages/dashboard/src/components/NewRunModal.tsx` (+ `.test.tsx`, `.figma.tsx`)
- Modify: a top-level entry point (e.g. `TopNav.tsx`) to add a "+ New run" trigger

- [ ] **Step 1:** Build the modal from the shipped DS composites — `Modal` + `Stepper` (`1·Project → 2·Ticket → 3·Confirm`) + `ModalSelectionRow` (project picker) + `FormField` (ticket key). Step 3 is a **confirm guard** (per the security decision). On confirm → `useEnqueueAction({kind:'run', project, ticketKey})`.
- [ ] **Step 2:** Optionally fetch the Jira summary for the entered key to show on the confirm step (reuse the daemon's title path if available; otherwise skip in v1).
- [ ] **Step 3:** RTL tests — stepper advances only with valid input; confirm enqueues with the chosen project+key; cancel resets.
- [ ] **Step 4:** `visual-fidelity-check` against the New Run Figma frames; typecheck/test/build green.
- [ ] **Step 5: Commit** — `feat(dashboard): New Run modal (CREW-208)`

**Acceptance:** "+ New run" opens the stepper; a valid project+ticket + confirm enqueues a `run` action; visual fidelity verified; verification clean.

---

## Task T7 — Fix PR comment modal (`crew-dashboard`)

**Files:**
- Create: `packages/dashboard/src/components/FixPrModal.tsx` (+ `.test.tsx`, `.figma.tsx`)
- Modify: AgentRow/QuickAction so the "Fix PR" action on a `pr_open` agent opens it

- [ ] **Step 1:** `Modal` + `FormField`/textarea for the comment. Submit → `useEnqueueAction({kind:'fix_pr', project, ticketKey, comment})`. Disable submit on empty comment.
- [ ] **Step 2:** Only surface the Fix PR action when the agent state is `pr_open`.
- [ ] **Step 3:** RTL tests — empty comment blocks submit; submit enqueues with the comment; only shown for `pr_open`.
- [ ] **Step 4:** `visual-fidelity-check`; verification green.
- [ ] **Step 5: Commit** — `feat(dashboard): Fix PR comment modal (CREW-208)`

**Acceptance:** on a `pr_open` agent, Fix PR opens a comment modal; submit enqueues a `fix_pr` action carrying the comment; verification clean.

---

## Task T8 — Finish gating + finish-step emission + step checklist

**Files:**
- Modify: `packages/cli/src/commands/finish.ts` (emit a finish-step via daemon-client per `step()`)
- Modify: `packages/cli/src/lib/daemon-client/index.ts` (`reportFinishStep`)
- Modify: dashboard AgentRow/QuickAction (Finish enabled only on `pr_merged`)
- Create: `packages/dashboard/src/components/FinishSteps.tsx` (+ `.test.tsx`) — drawer checklist
- Modify: `AgentBody`/drawer to render `FinishSteps`
- Create: `packages/dashboard/src/data/useFinishSteps.ts` (SSE-driven, refetch on `finish_step.changed`)

- [ ] **Step 1 (CLI):** add `daemon-client.reportFinishStep(key, {index,label,status,detail,ts})`; call it from the `step()` helper in `finish.ts` for each step (ok/skip/error). TDD with the client mocked — each step reports once with the right status.
- [ ] **Step 2 (dashboard gating):** Finish QuickAction `disabled` unless `agent.state === 'pr_merged'`; clicking enqueues `{kind:'finish'}`. RTL test for the gate.
- [ ] **Step 3 (dashboard render):** `useFinishSteps(key)` seeds from `GET /api/agents/:key/finish-steps` and refetches on `finish_step.changed`; `FinishSteps` renders the ordered checklist (ok/skip/error icons). RTL test with fixture rows.
- [ ] **Step 4:** `visual-fidelity-check` for the checklist; CLI + dashboard verification green.
- [ ] **Step 5: Commit** — `feat(cli+dashboard): finish gating + step checklist (CREW-208)`

**Acceptance:** Finish is actionable only after `pr_merged` and enqueues a `finish` action; running `crew finish` streams per-step events that render as a live checklist in the drawer; verification clean.

---

## Task T9 — Runner health chip + log viewer (`crew-dashboard`)

**Files:**
- Create: `packages/dashboard/src/components/RunnerStatusChip.tsx` (+ `.test.tsx`)
- Create: `packages/dashboard/src/components/RunnerLogViewer.tsx` (+ `.test.tsx`)
- Modify: `TopNav.tsx` (mount the chip)
- Create: `packages/dashboard/src/data/useRunnerLogs.ts` (tail + live-tail)

- [ ] **Step 1:** `RunnerStatusChip` reads `useRunnerStatus()` → healthy/unhealthy styling (DS Pill/Badge). RTL test: online→healthy, offline→unhealthy.
- [ ] **Step 2:** clicking the chip opens `RunnerLogViewer` (Modal) which loads `GET /api/runner/logs` and live-tails (SSE or short interval). RTL test with fixture log lines.
- [ ] **Step 3:** confirm graceful behavior on worktree dashboards (no runner → unhealthy, "no logs"). 
- [ ] **Step 4:** `visual-fidelity-check`; verification green.
- [ ] **Step 5: Commit** — `feat(dashboard): runner health chip + log viewer (CREW-208)`

**Acceptance:** the chip reads healthy on the main stack and unhealthy on worktree stacks; the log viewer tails runner logs (and is empty/absent when no runner); verification clean.

---

## Phase 5 — End-to-end smoke (no ticket; do after all merge)

With `crew up` running a real runner: enqueue each verb from the dashboard, confirm the agent registers/cycles and the action/runner/finish-step status reflect in the UI; confirm `docker compose up` (no runner) degrades gracefully.

## Self-review notes

- **Spec coverage:** queue (T2) ✓, runner+lifecycle (T4) ✓, health+logs (T3 routes, T9 UI) ✓, three actions (T6/T7/T8) ✓, finish-step HTTP transport (T1 type, T3 route, T8 emit+render) ✓, security confirm-on-run (T6 step 1) ✓, graceful degradation (T5) ✓.
- **Contract consistency:** `ActionKind`/`ActionStatus`/`ActionPayload`/`FinishStepEvent` defined once in T1 and referenced by name everywhere; SSE variants (`action.changed`, `runner.status_changed`, `finish_step.changed`) defined where introduced (T2/T3) and consumed in T5/T8/T9.
- **Open implementation choices left to the agent (non-contract):** long-poll mechanism internals (subscribe vs await-poll), runner supervisor shape (wrapper vs in-process respawn), SSE-live-tail vs interval for logs. None affect cross-ticket interfaces.
