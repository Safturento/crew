# Agent State Override Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator override an agent's state from the drawer — a safe escape hatch (button → state popover → confirm modal → `POST /api/agents/:key/state`) that bypasses the reducer to correct a wrong/stranded state, recording its manual origin.

**Architecture:** A new daemon route delegates to `IngestService.recordStateOverride`, which writes a `state_transitions` row directly (bypassing `reduceState` + its sticky guards), updates the in-memory cache, and publishes the existing `agent.state_changed` SSE. A new `state_transitions.source` column records what drove every transition. The dashboard adds an override affordance to the drawer header backed by a TanStack Query mutation; the badge updates over the existing SSE channel.

**Tech Stack:** TypeScript; `crew-daemon` (Fastify + `fastify-type-provider-zod`, Kysely + better-sqlite3, pino); `crew-dashboard` (React + Vite + Tailwind, Radix UI primitives, TanStack Query); Vitest + React Testing Library; Bruno.

## Global Constraints

- **Targets the post-CREW-252 daemon** (reducer-driven state via `ingestStateEvent` + `reduceState`; no transcript inference). This work is **blocked by CREW-252** (all children incl. CREW-257 cutover).
- **Routes are thin:** parse + validate (Zod) → call service → return. No business logic in `routes/`.
- **Migrations:** numbered TS files in `packages/daemon/src/migrations/`. Use the **next free number** (`0011_state_events_applied` is taken; expect `0012`). Never edit a shipped migration.
- **The override bypasses `reduceState` and its sticky guards** — it must be able to move an agent *out of* `finished`/`pr_merged`. This is intentional and is the core behavior.
- **`source` is stamped on every transition**, free-form documented `TEXT`, nullable (legacy rows = null). Values: `override`, the `StateEvent.source` values (`cli-run`, `cli-fixpr`, `cli-finish`, `runner-exit`, `hook-pr-create`), `poller`, `startup-failure`.
- **Escape hatch, not everyday control:** keep the confirmation modal; offer all 8 states.
- **Run before each PR:** `npm run -w crew-daemon test` / `-w crew-dashboard test`, `npm run typecheck`, `npm run lint`, `npm run bruno:smoke` (daemon work), `visual-fidelity-check` (drawer work), `agents-doc-parity-check`.

## File Structure

**Daemon (Ticket 1):**
- Create `packages/daemon/src/migrations/0012_state_transitions_source.ts` — add nullable `source TEXT`.
- Modify `packages/daemon/src/db.ts` — add `source: string | null` to `StateTransitionsTable`.
- Modify `packages/daemon/src/services/IngestService.ts` — extract `writeTransitionRow` + `announceTransition`; route existing writers through them with `source`; add `recordStateOverride`.
- Modify `packages/daemon/src/services/PrPoller.ts` — stamp `source: 'poller'` on its insert.
- Create `packages/daemon/src/routes/agent-state.ts` — `POST /api/agents/:key/state` (or add to existing `routes/agents.ts`, matching how `refresh-pr-status` is registered).
- Create `bruno/endpoints/agents/post-state.bru`.

**Dashboard (Ticket 2):**
- Modify `packages/dashboard/src/data/HttpDaemonClient.ts` — `overrideState(key, state)`.
- Create `packages/dashboard/src/components/StateOverrideControl.tsx` — button + popover + AlertModal + mutation.
- Modify `packages/dashboard/src/components/DrawerHeader.tsx` — mount the control next to the state `Badge`.

---

## Ticket 1 — Daemon: `source` column, `applyTransition` extraction, override route

### Task 1.1: Migration — `source` column on `state_transitions`

**Files:**
- Create: `packages/daemon/src/migrations/0012_state_transitions_source.ts`
- Modify: `packages/daemon/src/db.ts` (`StateTransitionsTable`)
- Test: `packages/daemon/src/migrations/0012_state_transitions_source.test.ts`

**Interfaces:**
- Produces: `state_transitions.source` (nullable `TEXT`); `StateTransitionsTable.source: string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// 0012_state_transitions_source.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from '../test/setup.js'; // existing helper that runs migrations
import { sql } from 'kysely';

describe('0012 state_transitions.source', () => {
  it('adds a nullable source column', async () => {
    const db = await makeTestDb();
    const cols = await sql<{ name: string; notnull: number }>`
      SELECT name, "notnull" FROM pragma_table_info('state_transitions')
    `.execute(db);
    const source = cols.rows.find((c) => c.name === 'source');
    expect(source).toBeDefined();
    expect(source!.notnull).toBe(0); // nullable
  });
});
```

> If `makeTestDb` doesn't exist under that name, use the test DB factory the other migration tests use (grep `migrations/*.test.ts` for the import).

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-daemon test -- 0012_state_transitions_source`
Expected: FAIL — migration file missing.

- [ ] **Step 3: Write the migration**

```ts
// 0012_state_transitions_source.ts
import { sql, type Kysely } from 'kysely';

/**
 * 0012 — provenance on every state transition. `source` records what drove the
 * hop: a StateEvent source (cli-run, hook-pr-create, …), `poller` (PrPoller),
 * `startup-failure`, or `override` (operator escape hatch, CREW state-override).
 * Nullable: legacy/backfilled rows carry null. Free-form TEXT so new sources
 * don't need a migration.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE state_transitions ADD COLUMN source TEXT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite can't drop a column pre-3.35 cleanly across versions; recreate-free
  // down is acceptable for an additive nullable column (no-op on rollback path
  // used only in dev). Match the project's existing additive-migration down style.
}
```

> Match the surrounding migrations' `down` convention — if they perform real rollbacks, mirror that; if additive migrations no-op their `down`, keep the no-op.

- [ ] **Step 4: Register the column type in `db.ts`**

Add to `StateTransitionsTable`:

```ts
source: string | null;
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run -w crew-daemon test -- 0012_state_transitions_source`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/migrations/0012_state_transitions_source.ts packages/daemon/src/migrations/0012_state_transitions_source.test.ts packages/daemon/src/db.ts
git commit -m "feat(daemon): add nullable state_transitions.source column"
```

---

### Task 1.2: Extract `writeTransitionRow` + `announceTransition`; thread `source`

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/PrPoller.ts`
- Test: `packages/daemon/src/services/IngestService.test.ts`

**Interfaces:**
- Produces (private to `IngestService`):
  - `writeTransitionRow(exec, args: { agentKey; from; to; ts; source }): Promise<void>` — inserts the row using `exec` (either `this.db` or a Kysely `trx`), so it can run inside `ingestStateEvent`'s dedup transaction or standalone.
  - `announceTransition(args: { agentKey; from; to; ts }): void` — sets `agentStateCache` + publishes `agent.state_changed`.

- [ ] **Step 1: Write the failing test (source is recorded for an event-driven transition)**

```ts
// IngestService.test.ts — add to the state-event suite
it('records source on the transition written by ingestStateEvent', async () => {
  await ingest.ingestStateEvent({
    eventId: 's1', key: 'AGENT', event: 'run_started',
    ts: '2026-06-19T00:00:00Z', source: 'cli-run',
  });
  const row = await testDb
    .selectFrom('state_transitions').select(['to_state', 'source'])
    .where('agent_key', '=', 'AGENT').orderBy('ts', 'desc').executeTakeFirst();
  expect(row).toMatchObject({ to_state: 'running', source: 'cli-run' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-daemon test -- IngestService`
Expected: FAIL — `source` is null/undefined (column written without it).

- [ ] **Step 3: Add the two helpers**

```ts
private async writeTransitionRow(
  exec: Kysely<DaemonDatabase> | Transaction<DaemonDatabase>,
  args: { agentKey: string; from: TransitionTarget; to: TransitionTarget; ts: number; source: string },
): Promise<void> {
  await exec
    .insertInto('state_transitions')
    .values({
      agent_key: args.agentKey,
      from_state: args.from,
      to_state: args.to,
      ts: args.ts,
      source: args.source,
    })
    .execute();
}

private announceTransition(args: {
  agentKey: string; from: TransitionTarget; to: TransitionTarget; ts: number;
}): void {
  this.agentStateCache.set(args.agentKey, args.to);
  this.eventBus.publish({
    type: 'agent.state_changed',
    data: { key: args.agentKey, from: args.from, to: args.to, ts: args.ts },
  });
}
```

(`Transaction` from `kysely`. Import if not present.)

- [ ] **Step 4: Route the existing writers through them, threading `source`**

In `ingestStateEvent`, inside the transaction replace the inline `insertInto('state_transitions')` with `await this.writeTransitionRow(trx, { agentKey: event.key, from: previous, to: next, ts, source: event.source })`; after the commit replace the inline cache-set + publish with `this.announceTransition({ agentKey: event.key, from: previous, to: next, ts })`.

Do the same for the remaining transition-writers that exist post-CREW-257 — at minimum `recordError` (`source: 'startup-failure'`). If `recordFinishCompleted` / a `pr_open` writer still exist post-cutover, route them too with an apt source (`cli-finish` etc.). **Verify against the then-current file** which writers remain after CREW-257's removals.

- [ ] **Step 5: Stamp PrPoller's insert**

In `PrPoller.ts`, add `source: 'poller'` to the `state_transitions` insert values (it writes directly; no IngestService dependency).

- [ ] **Step 6: Run to verify it passes**

Run: `npm run -w crew-daemon test -- IngestService PrPoller`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/services/IngestService.ts packages/daemon/src/services/PrPoller.ts packages/daemon/src/services/IngestService.test.ts
git commit -m "refactor(daemon): centralize transition writes + stamp source on every hop"
```

---

### Task 1.3: `recordStateOverride` + route + Bruno

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Create/Modify: `packages/daemon/src/routes/agents.ts` (register `POST /api/agents/:key/state`)
- Create: `bruno/endpoints/agents/post-state.bru`
- Test: `packages/daemon/src/services/IngestService.test.ts`, `packages/daemon/src/routes/agents.test.ts`

**Interfaces:**
- Consumes: `writeTransitionRow`, `announceTransition` (Task 1.2); `getCachedAgentState`.
- Produces: `IngestService.recordStateOverride(agentKey: string, toState: TransitionTarget): Promise<{ from: TransitionTarget; to: TransitionTarget } | { noop: true; state: TransitionTarget }>`; route `POST /api/agents/:key/state`.

- [ ] **Step 1: Write the failing service test (bypasses stickiness + stamps override)**

```ts
it('recordStateOverride moves an agent OUT of a terminal state and stamps source=override', async () => {
  // Drive to a terminal state first.
  await ingest.ingestStateEvent({ eventId: 'o1', key: 'AGENT', event: 'run_started', ts: '2026-06-19T00:00:00Z', source: 'cli-run' });
  await ingest.ingestStateEvent({ eventId: 'o2', key: 'AGENT', event: 'pr_created', ts: '2026-06-19T00:01:00Z', source: 'hook-pr-create' });
  await ingest.recordStateOverride('AGENT', 'pr_merged'); // simulate merge
  expect(await getState('AGENT')).toBe('pr_merged');

  // The escape hatch can leave a terminal state — a plain event could not.
  const res = await ingest.recordStateOverride('AGENT', 'pr_open');
  expect(res).toMatchObject({ from: 'pr_merged', to: 'pr_open' });
  expect(await getState('AGENT')).toBe('pr_open');

  const row = await testDb.selectFrom('state_transitions').select(['to_state', 'source'])
    .where('agent_key', '=', 'AGENT').orderBy('ts', 'desc').executeTakeFirst();
  expect(row).toMatchObject({ to_state: 'pr_open', source: 'override' });
});

it('recordStateOverride is a no-op when already in the target state', async () => {
  await ingest.ingestStateEvent({ eventId: 'n1', key: 'AGENT', event: 'run_started', ts: '2026-06-19T00:00:00Z', source: 'cli-run' });
  const res = await ingest.recordStateOverride('AGENT', 'running');
  expect(res).toMatchObject({ noop: true, state: 'running' });
  const rows = await testDb.selectFrom('state_transitions').selectAll().where('agent_key', '=', 'AGENT').execute();
  expect(rows).toHaveLength(1); // no second row written
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-daemon test -- IngestService`
Expected: FAIL — `recordStateOverride is not a function`.

- [ ] **Step 3: Implement `recordStateOverride`**

```ts
/**
 * Operator escape hatch: force an agent to `toState`, bypassing `reduceState`
 * and its terminal stickiness — the one path that can move an agent OUT of
 * `finished`/`pr_merged`. Writes the transition (source=override), updates the
 * cache (keeping the reducer coherent), and publishes the SSE. No-op if already
 * there. Not a lifecycle event; never touches the durable state-events log.
 */
async recordStateOverride(
  agentKey: string,
  toState: TransitionTarget,
): Promise<{ from: TransitionTarget; to: TransitionTarget } | { noop: true; state: TransitionTarget }> {
  const from = await this.getCachedAgentState(agentKey);
  if (from === toState) return { noop: true, state: toState };
  const ts = Date.now();
  await this.writeTransitionRow(this.db, { agentKey, from, to: toState, ts, source: 'override' });
  this.announceTransition({ agentKey, from, to: toState, ts });
  return { from, to: toState };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run -w crew-daemon test -- IngestService`
Expected: PASS.

- [ ] **Step 5: Write the failing route test**

```ts
// agents.test.ts — mirror the existing refresh-pr-status route test setup
it('POST /api/agents/:key/state overrides the state', async () => {
  // seed an agent named AGENT in the test app's DB (use the suite's seed helper)
  const res = await app.inject({ method: 'POST', url: '/api/agents/AGENT/state', payload: { state: 'finished' } });
  expect(res.statusCode).toBe(200);
});

it('POST /api/agents/:key/state 404s an unknown agent', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/agents/NOPE/state', payload: { state: 'finished' } });
  expect(res.statusCode).toBe(404);
});

it('POST /api/agents/:key/state 400s an invalid state', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/agents/AGENT/state', payload: { state: 'bogus' } });
  expect(res.statusCode).toBe(400);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm run -w crew-daemon test -- agents`
Expected: FAIL — route not registered (404 for all / route missing).

- [ ] **Step 7: Register the route** (in `routes/agents.ts`, mirroring the `refresh-pr-status` POST registration)

```ts
const OVERRIDE_STATES = ['init','running','pr_open','pr_merged','error','finished','idle','waiting'] as const;

app.post(
  '/api/agents/:key/state',
  {
    schema: {
      params: z.object({ key: z.string() }),
      body: z.object({ state: z.enum(OVERRIDE_STATES) }),
    },
  },
  async (req, reply) => {
    const { key } = req.params;
    const exists = await db.selectFrom('agents').select('key').where('key', '=', key).executeTakeFirst();
    if (!exists) throw new NotFoundError('agent', key);
    const result = await ingest.recordStateOverride(key, req.body.state);
    return reply.code(200).send(result);
  },
);
```

(Resolve `ingest`/`db` the same way the surrounding routes in the file do — via `req.diScope.resolve(...)` or the registered decorators. `NotFoundError` is the existing daemon error type.)

- [ ] **Step 8: Run to verify it passes**

Run: `npm run -w crew-daemon test -- agents`
Expected: PASS.

- [ ] **Step 9: Add the Bruno endpoint**

Create `bruno/endpoints/agents/post-state.bru` mirroring an existing agents POST `.bru` (e.g. the refresh-pr-status one): `POST {{baseUrl}}/api/agents/:key/state`, JSON body `{ "state": "pr_merged" }`, asserting `res.status == 200`.

- [ ] **Step 10: Full daemon verification + commit**

Run: `npm run -w crew-daemon test && npm run typecheck && npm run lint && npm run bruno:smoke`
Run: `agents-doc-parity-check` (update `.agents/architecture.md` — new route + override path).

```bash
git add packages/daemon/src/services/IngestService.ts packages/daemon/src/routes/agents.ts \
  packages/daemon/src/routes/agents.test.ts packages/daemon/src/services/IngestService.test.ts \
  bruno/endpoints/agents/post-state.bru .agents/architecture.md
git commit -m "feat(daemon): POST /api/agents/:key/state operator override (CREW state-override)"
```

---

## Ticket 2 — Dashboard: drawer override control

> Depends on Ticket 1 (the route contract). Build after Ticket 1 merges.

### Task 2.1: `HttpDaemonClient.overrideState` + mutation

**Files:**
- Modify: `packages/dashboard/src/data/HttpDaemonClient.ts`
- Test: `packages/dashboard/src/data/HttpDaemonClient.test.ts`

**Interfaces:**
- Produces: `HttpDaemonClient.overrideState(key: string, state: AgentState): Promise<void>`.

- [ ] **Step 1: Write the failing test** (mirror an existing POST method test, e.g. refresh-pr-status)

```ts
it('overrideState POSTs the state', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  const client = new HttpDaemonClient('http://d');
  await client.overrideState('CREW-1', 'pr_merged');
  expect(fetchMock).toHaveBeenCalledWith('http://d/api/agents/CREW-1/state', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ state: 'pr_merged' }),
  }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-dashboard test -- HttpDaemonClient`
Expected: FAIL — `overrideState` undefined.

- [ ] **Step 3: Implement** (mirror the existing `refresh-pr-status` POST method in the file)

```ts
async overrideState(key: string, state: AgentState): Promise<void> {
  const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error(`POST /api/agents/${key}/state: ${res.status}`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run -w crew-dashboard test -- HttpDaemonClient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/data/HttpDaemonClient.ts packages/dashboard/src/data/HttpDaemonClient.test.ts
git commit -m "feat(dashboard): HttpDaemonClient.overrideState"
```

---

### Task 2.2: `StateOverrideControl` + mount in `DrawerHeader`

**Files:**
- Create: `packages/dashboard/src/components/StateOverrideControl.tsx`
- Test: `packages/dashboard/src/components/StateOverrideControl.test.tsx`
- Modify: `packages/dashboard/src/components/DrawerHeader.tsx`

**Interfaces:**
- Consumes: `overrideState` (Task 2.1) via TanStack `useMutation`; `STATE_META` (all 8 states); `ui/popover.tsx`; `AlertModal`.
- Produces: `<StateOverrideControl agentKey state />`.

- [ ] **Step 1: Write the failing test**

```tsx
// StateOverrideControl.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StateOverrideControl } from './StateOverrideControl.js';

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

it('opens the popover, lists all 8 states with current disabled, and confirms via modal', async () => {
  const overrideState = vi.fn().mockResolvedValue(undefined);
  wrap(<StateOverrideControl agentKey="CREW-1" state="running" client={{ overrideState } as never} />);

  fireEvent.click(screen.getByrole('button', { name: /override state/i }));
  expect(screen.getByRole('menuitem', { name: /pr open/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /running/i })).toHaveAttribute('aria-disabled', 'true');

  fireEvent.click(screen.getByRole('menuitem', { name: /finished/i }));
  // AlertModal appears
  expect(screen.getByText(/override .* from .*running.* to .*finished/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^override$/i }));
  expect(overrideState).toHaveBeenCalledWith('CREW-1', 'finished');
});
```

> Inject the client as a prop for testability (or via the existing daemon-client context the dashboard uses — match how other components obtain the client). Adjust the role queries to the actual `ui/popover` + `AlertModal` semantics.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-dashboard test -- StateOverrideControl`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the control**

```tsx
// StateOverrideControl.tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js';
import { AlertModal } from './AlertModal.js';
import { StateIcon } from './ui/state-icon.js';
import { STATE_META } from '../data/state-meta.js';
import type { AgentState } from '../data/types.js';

const ALL_STATES = Object.keys(STATE_META) as AgentState[];

export function StateOverrideControl({
  agentKey, state, client,
}: { agentKey: string; state: AgentState; client: { overrideState(k: string, s: AgentState): Promise<void> } }) {
  const [pending, setPending] = useState<AgentState | null>(null);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (next: AgentState) => client.overrideState(agentKey, next),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['agents'] }); },
  });

  return (
    <>
      <Popover>
        <PopoverTrigger aria-label="Override state" className="…secondary icon button styles…">
          {/* a sliders/edit icon */}
        </PopoverTrigger>
        <PopoverContent role="menu">
          {ALL_STATES.map((s) => (
            <button
              key={s}
              role="menuitem"
              aria-disabled={s === state}
              disabled={s === state}
              onClick={() => setPending(s)}
            >
              <StateIcon state={s} /> {STATE_META[s].label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {pending && (
        <AlertModal
          title="Override agent state"
          description={`Override ${agentKey} state from "${state}" to "${pending}"? This manually sets the agent's state and won't be undone automatically.`}
          confirmLabel="Override"
          onConfirm={() => { mutation.mutate(pending); setPending(null); }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
```

> Match `AlertModal`'s real prop names (it exposes `title`, `description`, `onCancel`, a confirm handler/label — read `AlertModal.tsx` for exact names) and `ui/popover`'s real exports. Use `STATE_META[s].label` for display.

- [ ] **Step 4: Mount in `DrawerHeader`**

Next to the state `Badge` (`DrawerHeader.tsx:114`), render `<StateOverrideControl agentKey={detail.key} state={detail.state} client={…} />`, obtaining the daemon client the same way the header/drawer already does.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run -w crew-dashboard test -- StateOverrideControl DrawerHeader`
Expected: PASS.

- [ ] **Step 6: Visual fidelity + full verification**

Run: `npm run -w crew-dashboard test && npm run typecheck && npm run lint`
Run: the `visual-fidelity-check` skill (the drawer header is under the component dir) — confirm the button placement reads as a secondary affordance next to the pill.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/components/StateOverrideControl.tsx \
  packages/dashboard/src/components/StateOverrideControl.test.tsx \
  packages/dashboard/src/components/DrawerHeader.tsx
git commit -m "feat(dashboard): drawer state-override control"
```

---

## Self-Review

**Spec coverage:**
- Drawer button → popover(8 states) → AlertModal confirm → POST → live SSE update — Tasks 2.1–2.2. ✓
- Post-252 write path via shared helper + cache coherence — Task 1.2. ✓
- Override bypasses reducer + sticky guards (can leave terminal) — Task 1.3 (test asserts pr_merged→pr_open). ✓
- `source` column stamped on every transition (override + automatic + poller) — Tasks 1.1–1.3. ✓
- Bruno coverage; 404/400/no-op route behavior — Task 1.3. ✓
- Visual-fidelity gate on the drawer change — Task 2.2. ✓
- Debug-only provenance (no new UI marker) — honored (no timeline UI task). ✓

**Placeholder scan:** code steps carry real code. The "match the surrounding X" notes (migration `down` style, route DI resolution, AlertModal/popover exact prop names) point at concrete files to read rather than inventing APIs that may have drifted post-257 — appropriate, since this ticket is implemented after CREW-252 lands and must bind to the then-current code.

**Type consistency:** `recordStateOverride(agentKey, toState) → { from, to } | { noop, state }` (Task 1.3) matches its route call (Task 1.3 Step 7) and the service test. `writeTransitionRow(exec, {agentKey,from,to,ts,source})` / `announceTransition({agentKey,from,to,ts})` (Task 1.2) are used unchanged by `recordStateOverride`. `overrideState(key, state)` (Task 2.1) matches the control's `mutationFn` (Task 2.2).

**Carry-over flagged for the implementer:** Task 1.2 Step 4 must reconcile against the exact set of transition-writers remaining after CREW-257's cutover removals — the plan names the stable ones (`ingestStateEvent`, `recordError`, `PrPoller`) and instructs verifying the rest against the then-current file.
