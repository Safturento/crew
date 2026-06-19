# Concrete State Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the daemon's inferred agent-state transitions (transcript parsing + in-memory run-id cache) with concrete lifecycle events emitted by the CLI/runner and an injected PostToolUse hook, delivered through a durable per-key event log the daemon tails and reduces.

**Architecture:** Producers (CLI, runner, hook) append concrete lifecycle *facts* to `~/.crew/state-events/<key>.jsonl` — a near-clone of the existing `~/.crew/startup/<key>.jsonl` stream. The daemon tails each file with chokidar + offset tracking, dedups by `eventId`, and runs a pure reducer `(currentState, eventKind) → nextState | null` to drive the existing `state_transitions` write path. This makes the dormant `idle` state reachable and survives the daemon restart window by construction.

**Tech Stack:** TypeScript, npm workspaces; `crew-shared` (zod), `crew-daemon` (Fastify, Kysely + better-sqlite3, chokidar, pino), `crew-cli` (commander, execa), Vitest throughout.

## Global Constraints

- **Leaf rule:** `crew-shared` must not import from `cli/`, `daemon/`, or `dashboard/`. The `StateEvent` contract lives in shared; the *reducer* lives in the daemon.
- **Migrations:** numbered TS files in `packages/daemon/src/migrations/`. Next free number is **`0010`**. Never edit a shipped migration.
- **Best-effort emit:** appending a state event must never throw into the dispatch flow (mirror `emitStartupEvent`'s try/catch-to-stderr). A sync variant is required for `process.exit()` paths.
- **Reducer purity:** the reducer is pure and total — no I/O, no clock, exhaustive over `StateEventKind`. `finished` and `pr_merged` are terminal (sticky) against lifecycle events.
- **No new daemon HTTP route for ingestion** — delivery is file-log only (consistency with startup-events); routes/Bruno unaffected unless a task says otherwise.
- **Forward-only:** no historical re-backfill. `deriveStateFromToolCalls` / CREW-96 backfill stays for pre-cutover agents.
- **Verification per package:** `npm run -w crew-shared test`, `npm run -w crew-daemon test`, `npm run -w crew-cli test`, plus root `npm run typecheck` and `npm run lint`. Run `agents-doc-parity-check` before each PR.

## File Structure

**Created:**
- `packages/shared/src/state-events/types.ts` — `StateEventKind` tuple, `EventSource` tuple, `stateEventSchema` (zod), `StateEvent` type.
- `packages/shared/src/state-events/types.test.ts`
- `packages/shared/src/state-events/index.ts` — barrel; re-exported from `packages/shared/src/index.ts`.
- `packages/cli/src/lib/state-events/writer.ts` — `emitStateEvent` / `emitStateEventSync`, `stateEventsFilePath`, `newEventId`.
- `packages/cli/src/lib/state-events/writer.test.ts`
- `packages/cli/src/lib/state-events/index.ts`
- `packages/daemon/src/services/state-reduce.ts` — the pure `reduceState`.
- `packages/daemon/src/services/state-reduce.test.ts`
- `packages/daemon/src/migrations/0010_state_events_applied.ts` — `state_events_applied(event_id TEXT PRIMARY KEY, agent_key, ts)` dedup table + `idle`/`waiting` already legal in `state_transitions` CHECK (migration 0002).
- `hooks/state-events/pr-create-postuse.mjs` (repo-root `hooks/`, shipped + injected) — the PostToolUse hook script.
- `hooks/state-events/pr-create-postuse.test.mjs`

**Modified:**
- `packages/shared/src/index.ts` — export `state-events`.
- `packages/daemon/src/services/IngestService.ts` — add `watchStateEvents` + `onStateEventFile` + `ingestStateEvent` (mirroring the startup trio); call `reduceState`; **remove** `hasPrCreateInvocation` import, `computeNextState`, `lastRunIdCache` + priming.
- `packages/daemon/src/app.ts` — start/stop the state-events watcher (next to `watchStartupEvents`).
- `packages/daemon/src/config.ts` — `CREW_STATE_EVENTS_DIR` (default `~/.crew/state-events`); add to `DaemonConfig`.
- `packages/daemon/src/services/state-derivation.ts` — `TRANSITION_TO_AGENT_STATE.idle = 'idle'` (and `waiting: 'waiting'`).
- `packages/cli/src/commands/run.ts`, `fix-pr.ts`, `finish.ts` (or their `lib/run/*` dispatch helpers) — emit `run_started` / `fixpr_started` / `*_exited` / `finish_completed`.
- `packages/cli/src/lib/run/skill-injection-step.ts` (+ siblings) — inject the PostToolUse hook into the dispatched session settings; template the `key` + state-events path.
- `docker-compose.yml` — mount `${HOME}/.crew/state-events` into the daemon container (mirror the `~/.crew/startup` mount).
- `docs/followups.md` — Resolve the `idle`/`waiting`-unreachable and `finished`-footgun followups (in the idle-activation task's PR).

---

### Task 1: Shared `StateEvent` contract

**Files:**
- Create: `packages/shared/src/state-events/types.ts`
- Create: `packages/shared/src/state-events/index.ts`
- Test: `packages/shared/src/state-events/types.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `STATE_EVENT_KINDS = ['run_started','pr_created','fixpr_started','fixpr_exited','run_exited','finish_completed'] as const`
  - `type StateEventKind = (typeof STATE_EVENT_KINDS)[number]`
  - `STATE_EVENT_SOURCES = ['cli-run','cli-fixpr','cli-finish','runner-exit','hook-pr-create'] as const`
  - `stateEventSchema` (zod) and `type StateEvent = z.infer<typeof stateEventSchema>` with fields:
    `{ eventId: string; key: string; event: StateEventKind; ts: string; source: EventSource; prUrl?: string; runId?: number; exitCode?: number | null }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/state-events/types.test.ts
import { describe, it, expect } from 'vitest';
import { stateEventSchema, STATE_EVENT_KINDS } from './index.js';

describe('stateEventSchema', () => {
  it('accepts a minimal run_started event', () => {
    const e = stateEventSchema.parse({
      eventId: 'abc', key: 'CREW-1', event: 'run_started',
      ts: '2026-06-18T00:00:00Z', source: 'cli-run',
    });
    expect(e.event).toBe('run_started');
    expect(e.prUrl).toBeUndefined();
  });

  it('accepts a pr_created event carrying prUrl + runId', () => {
    const e = stateEventSchema.parse({
      eventId: 'd1', key: 'CREW-1', event: 'pr_created',
      ts: '2026-06-18T00:00:00Z', source: 'hook-pr-create',
      prUrl: 'https://github.com/o/r/pull/5', runId: 42,
    });
    expect(e.prUrl).toContain('/pull/5');
  });

  it('rejects an unknown event kind', () => {
    expect(() => stateEventSchema.parse({
      eventId: 'x', key: 'CREW-1', event: 'nope',
      ts: '2026-06-18T00:00:00Z', source: 'cli-run',
    })).toThrow();
  });

  it('exposes all six kinds', () => {
    expect(STATE_EVENT_KINDS).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-shared test -- state-events`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 3: Write the types**

```ts
// packages/shared/src/state-events/types.ts
import { z } from 'zod';

/** Concrete lifecycle facts producers append to ~/.crew/state-events/<key>.jsonl. */
export const STATE_EVENT_KINDS = [
  'run_started',
  'pr_created',
  'fixpr_started',
  'fixpr_exited',
  'run_exited',
  'finish_completed',
] as const;
export type StateEventKind = (typeof STATE_EVENT_KINDS)[number];

export const STATE_EVENT_SOURCES = [
  'cli-run',
  'cli-fixpr',
  'cli-finish',
  'runner-exit',
  'hook-pr-create',
] as const;
export type EventSource = (typeof STATE_EVENT_SOURCES)[number];

/**
 * One concrete state-lifecycle fact. The daemon reduces (currentState, event)
 * → nextState; producers never assert the target state. `eventId` is a
 * client-generated uuid the daemon dedups on (exactly-once across replays).
 * `exitCode` is meaningful only on `*_exited`; `prUrl` only on `pr_created`.
 */
export const stateEventSchema = z.object({
  eventId: z.string().min(1),
  key: z.string().min(1),
  event: z.enum(STATE_EVENT_KINDS),
  ts: z.string(),
  source: z.enum(STATE_EVENT_SOURCES),
  prUrl: z.string().optional(),
  runId: z.number().optional(),
  exitCode: z.number().nullable().optional(),
});

export type StateEvent = z.infer<typeof stateEventSchema>;
```

```ts
// packages/shared/src/state-events/index.ts
export * from './types.js';
```

- [ ] **Step 4: Export from the package barrel**

Add to `packages/shared/src/index.ts` (next to the `startup-events` export):

```ts
export * from './state-events/index.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run -w crew-shared test -- state-events`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/state-events packages/shared/src/index.ts
git commit -m "feat(shared): StateEvent contract for concrete state triggers"
```

---

### Task 2: The pure reducer (daemon)

**Files:**
- Create: `packages/daemon/src/services/state-reduce.ts`
- Test: `packages/daemon/src/services/state-reduce.test.ts`

**Interfaces:**
- Consumes: `StateEventKind` (Task 1), `TransitionState` (`packages/daemon/src/services/state-derivation.ts`).
- Produces: `reduceState(current: TransitionState, event: StateEventKind): TransitionState | null` — returns the next state, or `null` for "no transition" (idempotent no-op).

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/services/state-reduce.test.ts
import { describe, it, expect } from 'vitest';
import { reduceState } from './state-reduce.js';

describe('reduceState', () => {
  it('run_started → running', () => {
    expect(reduceState('init', 'run_started')).toBe('running');
  });
  it('pr_created → pr_open', () => {
    expect(reduceState('running', 'pr_created')).toBe('pr_open');
  });
  it('fixpr_started moves pr_open → running', () => {
    expect(reduceState('pr_open', 'fixpr_started')).toBe('running');
  });
  it('fixpr_exited → pr_open', () => {
    expect(reduceState('running', 'fixpr_exited')).toBe('pr_open');
  });
  it('run_exited from running → idle', () => {
    expect(reduceState('running', 'run_exited')).toBe('idle');
  });
  it('run_exited while pr_open is a no-op (null)', () => {
    expect(reduceState('pr_open', 'run_exited')).toBeNull();
  });
  it('finish_completed → finished', () => {
    expect(reduceState('pr_open', 'finish_completed')).toBe('finished');
  });
  it('finished is sticky against lifecycle events', () => {
    expect(reduceState('finished', 'run_started')).toBeNull();
    expect(reduceState('finished', 'pr_created')).toBeNull();
  });
  it('pr_merged is sticky against lifecycle events', () => {
    expect(reduceState('pr_merged', 'fixpr_started')).toBeNull();
  });
  it('returns null when the event would not change state', () => {
    expect(reduceState('pr_open', 'pr_created')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-daemon test -- state-reduce`
Expected: FAIL — `state-reduce.js` not found.

- [ ] **Step 3: Write the reducer**

```ts
// packages/daemon/src/services/state-reduce.ts
import type { StateEventKind } from 'crew-shared';
import type { TransitionState } from './state-derivation.js';

/**
 * Pure, total reduction of a concrete lifecycle event against the agent's
 * current state. Returns the next state, or `null` when the event implies no
 * change (the daemon then writes nothing). `finished` and `pr_merged` are
 * terminal — only their dedicated paths (`crew finish`, `PrPoller`) move out.
 *
 * `run_exited` is the only state-dependent case: a run process ending while
 * still `running` means it produced no PR → `idle` (the operator decides next);
 * ending while already `pr_open` is the normal happy path → no change.
 */
export function reduceState(
  current: TransitionState,
  event: StateEventKind,
): TransitionState | null {
  if (current === 'finished' || current === 'pr_merged') return null;

  let next: TransitionState | null;
  switch (event) {
    case 'run_started':
      next = 'running';
      break;
    case 'pr_created':
      next = 'pr_open';
      break;
    case 'fixpr_started':
      next = current === 'pr_open' ? 'running' : null;
      break;
    case 'fixpr_exited':
      next = 'pr_open';
      break;
    case 'run_exited':
      next = current === 'running' ? 'idle' : null;
      break;
    case 'finish_completed':
      next = 'finished';
      break;
    default: {
      const _exhaustive: never = event;
      next = _exhaustive;
    }
  }
  return next === current ? null : next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run -w crew-daemon test -- state-reduce`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/state-reduce.ts packages/daemon/src/services/state-reduce.test.ts
git commit -m "feat(daemon): pure reduceState for concrete state events"
```

---

### Task 3: Daemon ingestion — dedup migration, watcher, reducer wiring

**Files:**
- Create: `packages/daemon/src/migrations/0010_state_events_applied.ts`
- Modify: `packages/daemon/src/db.ts` (register `state_events_applied` table type)
- Modify: `packages/daemon/src/config.ts` (`CREW_STATE_EVENTS_DIR`)
- Modify: `packages/daemon/src/services/IngestService.ts` (add `watchStateEvents`, `onStateEventFile`, `ingestStateEvent`)
- Modify: `packages/daemon/src/app.ts` (start/stop the watcher)
- Modify: `docker-compose.yml` (mount the dir)
- Test: `packages/daemon/src/services/IngestService.test.ts` (new cases via the `ingestStateEvent` seam)

**Interfaces:**
- Consumes: `stateEventSchema`, `StateEvent` (Task 1); `reduceState` (Task 2); existing `applyStateTransition` write pattern (`IngestService.ts:568-583`) and `getCachedAgentState` (`:585`).
- Produces:
  - `IngestService.ingestStateEvent(event: StateEvent): Promise<void>` — dedups on `eventId`, reduces, writes `state_transitions` + publishes `agent.state_changed`.
  - `IngestService.watchStateEvents(dir: string): Promise<void>` / `stopStateEventWatcher()`.
  - `DaemonConfig.stateEventsDir: string`.

- [ ] **Step 1: Write the dedup migration**

Mirror an existing migration's shape (`packages/daemon/src/migrations/0009_runner_commands.ts`).

```ts
// packages/daemon/src/migrations/0010_state_events_applied.ts
import { sql, type Kysely } from 'kysely';

/**
 * 0010 — dedup ledger for the state-events log (CREW Concrete State Triggers).
 * The daemon re-reads each ~/.crew/state-events/<key>.jsonl from offset 0 on
 * restart; recording every applied eventId here makes application exactly-once.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS state_events_applied (
      event_id  TEXT PRIMARY KEY,
      agent_key TEXT NOT NULL,
      ts        INTEGER NOT NULL
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS state_events_applied`.execute(db);
}
```

- [ ] **Step 2: Register the table type in `db.ts`**

Add the interface and the `DaemonDatabase` member (mirror an existing table like `RunnerCommandsTable`):

```ts
export interface StateEventsAppliedTable {
  event_id: string;
  agent_key: string;
  ts: number;
}
// …in DaemonDatabase:
state_events_applied: StateEventsAppliedTable;
```

- [ ] **Step 3: Add `CREW_STATE_EVENTS_DIR` config**

In `packages/daemon/src/config.ts`, mirror `CREW_STARTUP_EVENTS_DIR` exactly:

```ts
CREW_STATE_EVENTS_DIR: z
  .string()
  .default(() => process.env.CREW_STATE_EVENTS_DIR ?? join(homedir(), '.crew', 'state-events')),
```

Add `stateEventsDir: string` to `DaemonConfig` and map it in `parseDaemonConfig` (parallel to `startupEventsDir`).

- [ ] **Step 4: Write the failing ingestion test**

```ts
// in packages/daemon/src/services/IngestService.test.ts
it('ingestStateEvent applies a pr_created event and flips state to pr_open', async () => {
  await ingest.ingestStateEvent({
    eventId: 'e1', key: 'AGENT', event: 'run_started',
    ts: '2026-06-18T00:00:00Z', source: 'cli-run',
  });
  expect(await getState('AGENT')).toBe('running');

  await ingest.ingestStateEvent({
    eventId: 'e2', key: 'AGENT', event: 'pr_created',
    ts: '2026-06-18T00:01:00Z', source: 'hook-pr-create',
    prUrl: 'https://github.com/o/r/pull/9',
  });
  expect(await getState('AGENT')).toBe('pr_open');
});

it('ingestStateEvent is idempotent on eventId (replay is a no-op)', async () => {
  const ev = {
    eventId: 'dup', key: 'AGENT', event: 'run_started' as const,
    ts: '2026-06-18T00:00:00Z', source: 'cli-run' as const,
  };
  await ingest.ingestStateEvent(ev);
  await ingest.ingestStateEvent(ev); // replay after a simulated restart
  const rows = await testDb
    .selectFrom('state_transitions').selectAll()
    .where('agent_key', '=', 'AGENT').execute();
  expect(rows).toHaveLength(1);
});

it('run_exited while pr_open does not change state', async () => {
  await ingest.ingestStateEvent({ eventId: 'a', key: 'AGENT', event: 'run_started', ts: '2026-06-18T00:00:00Z', source: 'cli-run' });
  await ingest.ingestStateEvent({ eventId: 'b', key: 'AGENT', event: 'pr_created', ts: '2026-06-18T00:01:00Z', source: 'hook-pr-create' });
  await ingest.ingestStateEvent({ eventId: 'c', key: 'AGENT', event: 'run_exited', ts: '2026-06-18T00:02:00Z', source: 'runner-exit', exitCode: 0 });
  expect(await getState('AGENT')).toBe('pr_open');
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npm run -w crew-daemon test -- IngestService`
Expected: FAIL — `ingest.ingestStateEvent is not a function`.

- [ ] **Step 6: Implement `ingestStateEvent`**

Add to `IngestService` (the agent must already exist via the run registration; if absent the reduce still writes a transition keyed by agent_key — match the startup path which assumes the agent row exists). Dedup first, then reduce, then reuse the existing transition-write block.

```ts
async ingestStateEvent(event: StateEvent): Promise<void> {
  // Dedup: skip if this eventId was already applied (exactly-once across replays).
  const already = await this.db
    .selectFrom('state_events_applied').select('event_id')
    .where('event_id', '=', event.eventId).executeTakeFirst();
  if (already) return;

  const ts = Date.parse(event.ts);
  if (!Number.isFinite(ts)) {
    this.logger.warn({ key: event.key, event: event.event, ts: event.ts }, 'unparseable state-event ts; skipping');
    return;
  }

  const previous = await this.getCachedAgentState(event.key);
  const next = reduceState(previous, event.event);

  // Record the eventId even on a no-op so a replay stays a no-op.
  await this.db.insertInto('state_events_applied')
    .values({ event_id: event.eventId, agent_key: event.key, ts })
    .onConflict((oc) => oc.column('event_id').doNothing())
    .execute();

  if (event.event === 'pr_created' && event.prUrl) {
    await this.db.updateTable('agents').set({ pr_url: event.prUrl })
      .where('key', '=', event.key).execute();
  }

  if (next === null) return;

  await this.db.insertInto('state_transitions')
    .values({ agent_key: event.key, from_state: previous, to_state: next, ts })
    .execute();
  this.agentStateCache.set(event.key, next);
  this.eventBus.publish({
    type: 'agent.state_changed',
    data: { key: event.key, from: previous, to: next, ts },
  });
}
```

Add `import { reduceState } from './state-reduce.js';` and `import { stateEventSchema, type StateEvent } from 'crew-shared';`.

- [ ] **Step 7: Add the watcher (mirror `watchStartupEvents`/`onStartupFile`)**

Copy `watchStartupEvents` → `watchStateEvents` and `onStartupFile` → `onStateEventFile`, swapping: the offset/buffer maps (`stateEventFileOffsets`, `stateEventFileBuffers`), the per-line parse to `stateEventSchema.safeParse(JSON.parse(line))`, and the terminal call to `await this.ingestStateEvent(result.data)`. Reuse the identical offset-tracking + truncation-reset logic verbatim. Add `stopStateEventWatcher()` mirroring `stopStartupWatcher()`.

- [ ] **Step 8: Wire start/stop in `app.ts`**

Next to `await ingest.watchStartupEvents(startupDir)`:

```ts
try {
  await ingest.watchStateEvents(config.stateEventsDir);
} catch (err) {
  logger.warn({ err, dir: config.stateEventsDir }, 'state-event watcher failed to attach');
}
```

And in the `onClose` hook add `await ingest.stopStateEventWatcher();`.

- [ ] **Step 9: Mount the dir in `docker-compose.yml`**

Mirror the startup mount (read-only; the daemon only reads):

```yaml
- ${HOME}/.crew/state-events:/root/.crew/state-events:ro
```

- [ ] **Step 10: Run the suite + typecheck**

Run: `npm run -w crew-daemon test -- IngestService` → PASS (new cases).
Run: `npm run typecheck` → clean.

- [ ] **Step 11: Commit**

```bash
git add packages/daemon/src/migrations/0010_state_events_applied.ts packages/daemon/src/db.ts \
  packages/daemon/src/config.ts packages/daemon/src/services/IngestService.ts \
  packages/daemon/src/app.ts docker-compose.yml packages/daemon/src/services/IngestService.test.ts
git commit -m "feat(daemon): ingest + reduce concrete state events from the durable log"
```

> Note: this task changes the DB schema. Per project convention the daemon container must be rebuilt (not just hot-reloaded) before the dashboard works against it. Flag in the PR body.

---

### Task 4: CLI/runner emitters

**Files:**
- Create: `packages/cli/src/lib/state-events/writer.ts`
- Create: `packages/cli/src/lib/state-events/index.ts`
- Test: `packages/cli/src/lib/state-events/writer.test.ts`
- Modify: dispatch paths — `packages/cli/src/commands/run.ts`, `packages/cli/src/commands/fix-pr.ts`, `packages/cli/src/commands/finish.ts` (or their `lib/run/*` helpers where the process is launched/awaited).

**Interfaces:**
- Consumes: `StateEvent`, `StateEventKind`, `EventSource` (Task 1).
- Produces:
  - `stateEventsFilePath(key: string, home?: string): string`
  - `newEventId(): string`
  - `emitStateEvent(key, partial, opts?): Promise<void>` and `emitStateEventSync(...)` where `partial` is `{ event, source, prUrl?, runId?, exitCode? }` (the writer fills `eventId` + `ts` + `key`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/lib/state-events/writer.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitStateEvent, stateEventsFilePath } from './index.js';

describe('emitStateEvent', () => {
  it('appends a well-formed JSONL line with a generated eventId + ts', async () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-se-'));
    await emitStateEvent('CREW-1', { event: 'run_started', source: 'cli-run' }, { home });
    const line = readFileSync(stateEventsFilePath('CREW-1', home), 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('run_started');
    expect(parsed.key).toBe('CREW-1');
    expect(typeof parsed.eventId).toBe('string');
    expect(parsed.eventId.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(parsed.ts))).toBe(false);
  });

  it('never throws on an unwritable home (best-effort)', async () => {
    await expect(
      emitStateEvent('CREW-1', { event: 'run_exited', source: 'runner-exit', exitCode: 0 }, { home: '/dev/null/nope' }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-cli test -- state-events`
Expected: FAIL — `./index.js` unresolved.

- [ ] **Step 3: Implement the writer (mirror `startup-events/writer.ts`)**

```ts
// packages/cli/src/lib/state-events/writer.ts
import { promises as fs, appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { EventSource, StateEvent, StateEventKind } from 'crew-shared';

export interface EmitOptions { home?: string }

export interface StateEventInput {
  event: StateEventKind;
  source: EventSource;
  prUrl?: string;
  runId?: number;
  exitCode?: number | null;
}

export function newEventId(): string {
  return randomUUID();
}

export function stateEventsRootForHome(home: string): string {
  return join(home, '.crew', 'state-events');
}

export function stateEventsFilePath(key: string, home: string = homedir()): string {
  return join(stateEventsRootForHome(home), `${key}.jsonl`);
}

function build(key: string, input: StateEventInput): StateEvent {
  return { eventId: newEventId(), key, ts: new Date().toISOString(), ...input };
}

export async function emitStateEvent(key: string, input: StateEventInput, opts: EmitOptions = {}): Promise<void> {
  const file = stateEventsFilePath(key, opts.home);
  try {
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(build(key, input))}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(`crew: failed to emit state event ${key}/${input.event}: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

export function emitStateEventSync(key: string, input: StateEventInput, opts: EmitOptions = {}): void {
  const file = stateEventsFilePath(key, opts.home);
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(build(key, input))}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(`crew: failed to emit state event ${key}/${input.event}: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
```

```ts
// packages/cli/src/lib/state-events/index.ts
export * from './writer.js';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run -w crew-cli test -- state-events`
Expected: PASS (2 tests).

- [ ] **Step 5: Emit at the dispatch lifecycle points**

Wire emits at the exact moments (find the launch/await sites; `run.ts`/`fix-pr.ts` already `import` startup-event emits — co-locate):
- `crew run`, right after `registerRun` succeeds → `emitStateEvent(key, { event: 'run_started', source: 'cli-run' })`.
- `crew fix-pr`, at dispatch → `emitStateEvent(key, { event: 'fixpr_started', source: 'cli-fixpr' })`.
- On the dispatched child process exit (the detached-launch await / runner `executeAction` result): exit 0 + command `run` → `run_exited`; exit 0 + command `fix-pr` → `fixpr_exited`; non-zero → `*_exited` with the `exitCode` (the daemon reduces non-zero to `error` — see Task 6 note). Use `emitStateEventSync` on paths that `process.exit()` immediately.
- `crew finish` completion → `emitStateEvent(key, { event: 'finish_completed', source: 'cli-finish' })` (keep the existing daemon finish call too until Task 6 unifies).

Add a focused test per command path asserting the right event lands in the temp `home` (inject `home` via the same opts seam the tests use).

- [ ] **Step 6: Run CLI suite + commit**

Run: `npm run -w crew-cli test` → PASS.

```bash
git add packages/cli/src/lib/state-events packages/cli/src/commands
git commit -m "feat(cli): emit concrete state-lifecycle events at dispatch + exit"
```

---

### Task 5: PostToolUse hook + dispatch injection

**Files:**
- Create: `hooks/state-events/pr-create-postuse.mjs`
- Test: `hooks/state-events/pr-create-postuse.test.mjs`
- Modify: `packages/cli/src/lib/run/skill-injection-step.ts` (+ the settings-writing sibling it calls) to inject the hook into the dispatched session.

**Interfaces:**
- Consumes: the state-events file format (Task 1/4) — the hook appends the same JSONL shape directly (it runs on the host, in Node, with no crew-cli import; keep it dependency-free).
- Produces: a `PostToolUse` (matcher `Bash`) hook entry in the session settings that runs `node <abs>/hooks/state-events/pr-create-postuse.mjs` with the agent `key` + state-events dir templated via env.

- [ ] **Step 1: Write the failing hook test**

```js
// hooks/state-events/pr-create-postuse.test.mjs
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePostToolUse } from './pr-create-postuse.mjs';

const ev = (command, stdout, exitCode) => ({
  tool_name: 'Bash',
  tool_input: { command },
  tool_response: { stdout, stderr: '', exitCode },
});

describe('handlePostToolUse', () => {
  it('emits pr_created for a `;`-chained gh pr create that exits 0', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-hook-'));
    handlePostToolUse(ev('cd /x; gh pr create --base main', 'https://github.com/o/r/pull/7\n', 0), 'CREW-1', home);
    const line = readFileSync(join(home, '.crew', 'state-events', 'CREW-1.jsonl'), 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('pr_created');
    expect(parsed.prUrl).toBe('https://github.com/o/r/pull/7');
    expect(parsed.source).toBe('hook-pr-create');
  });

  it('matches `&&`-chained form', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-hook-'));
    handlePostToolUse(ev('git push && gh pr create', 'https://github.com/o/r/pull/8', 0), 'CREW-1', home);
    expect(existsSync(join(home, '.crew', 'state-events', 'CREW-1.jsonl'))).toBe(true);
  });

  it('ignores a failed gh pr create (non-zero exit)', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-hook-'));
    handlePostToolUse(ev('gh pr create', 'oops', 1), 'CREW-1', home);
    expect(existsSync(join(home, '.crew', 'state-events', 'CREW-1.jsonl'))).toBe(false);
  });

  it('ignores an echo decoy', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-hook-'));
    handlePostToolUse(ev('echo "run gh pr create later"', '', 0), 'CREW-1', home);
    expect(existsSync(join(home, '.crew', 'state-events', 'CREW-1.jsonl'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run hooks/state-events/pr-create-postuse.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook (dependency-free Node)**

```js
// hooks/state-events/pr-create-postuse.mjs
import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const PR_CREATE = /(^|&&|;|\|)\s*gh pr create\b/;
const URL_RE = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

/** Append the pr_created event iff a successful `gh pr create` is detected. */
export function handlePostToolUse(payload, key, home = homedir()) {
  if (payload?.tool_name !== 'Bash') return;
  const command = payload.tool_input?.command ?? '';
  if (!PR_CREATE.test(command)) return;
  const exitCode = payload.tool_response?.exitCode;
  if (exitCode !== 0) return;
  const stdout = payload.tool_response?.stdout ?? '';
  const prUrl = (stdout.match(URL_RE) ?? [])[0];

  const file = join(home, '.crew', 'state-events', `${key}.jsonl`);
  const event = {
    eventId: randomUUID(), key, event: 'pr_created',
    ts: new Date().toISOString(), source: 'hook-pr-create',
    ...(prUrl ? { prUrl } : {}),
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(`crew hook: failed to emit pr_created for ${key}: ${err}\n`);
  }
}

// CLI entrypoint: Claude Code pipes the PostToolUse payload as JSON on stdin;
// the agent key + home come from env templated at injection time.
if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      handlePostToolUse(JSON.parse(raw), process.env.CREW_AGENT_KEY ?? 'unknown', process.env.CREW_STATE_EVENTS_HOME || undefined);
    } catch (err) {
      process.stderr.write(`crew hook: ${err}\n`);
    }
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run hooks/state-events/pr-create-postuse.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Inject the hook at dispatch**

In the session-settings injection (alongside skill injection), add a `PostToolUse` hook with matcher `Bash` whose command is `node "<repoAbs>/hooks/state-events/pr-create-postuse.mjs"`, and set `CREW_AGENT_KEY=<key>` in the hook's `env` (use `$CLAUDE_PROJECT_DIR` for the absolute path, matching the existing PreToolUse hook fix in `df6a2a3`). Add a unit test asserting the injected settings contain the PostToolUse entry with the templated key.

- [ ] **Step 6: Run CLI suite + commit**

Run: `npm run -w crew-cli test` → PASS.

```bash
git add hooks/state-events packages/cli/src/lib/run
git commit -m "feat: PostToolUse hook emits pr_created on successful gh pr create"
```

---

### Task 6: Remove the inferred state path + activate `idle`

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts` — remove `hasPrCreateInvocation` import + the `pr_created`-from-transcript branch (`:484`), `computeNextState` (`:696`), `lastRunIdCache` + `primeLastRunId`/seed (`:101`, `:549-556`, `:614-650`), and the `applyStateTransition` runId plumbing.
- Modify: `packages/daemon/src/services/state-derivation.ts` — `TRANSITION_TO_AGENT_STATE.idle = 'idle'`, `.waiting = 'waiting'`.
- Modify: `docs/followups.md` — Resolve the `idle`/`waiting`-unreachable + `finished`-footgun entries.
- Test: `IngestService.test.ts` — delete/replace the transcript-driven state-transition tests (kept behaviors now covered by Task 3); add a test that ingesting tool_calls no longer writes `state_transitions`.

**Interfaces:**
- Consumes: Tasks 2-5 fully landed (concrete events now drive every transition).
- Produces: `idle` reachable end-to-end; transcript ingestion no longer writes `state_transitions`.

- [ ] **Step 1: Write the failing test (idle mapping + no transcript-driven transitions)**

```ts
// state-derivation.test.ts
it('maps idle/waiting transitions to their own badge state', () => {
  expect(currentStateFromTransitions([{ to: 'idle', ts: 1 }])).toBe('idle');
  expect(currentStateFromTransitions([{ to: 'waiting', ts: 1 }])).toBe('waiting');
});

// IngestService.test.ts
it('ingesting a gh pr create tool_call no longer writes a state_transition', async () => {
  await ingest.processEventForTest({ runId: 1, agentKey: 'AGENT',
    event: makeAssistantEvent({ toolUse: { name: 'Bash', input: { command: 'gh pr create --base main' } } }) });
  const rows = await testDb.selectFrom('state_transitions').selectAll().where('agent_key', '=', 'AGENT').execute();
  expect(rows).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-daemon test -- state-derivation IngestService`
Expected: FAIL — `idle` currently maps to `running`; the tool_call still writes a transition.

- [ ] **Step 3: Fix the mapping**

In `state-derivation.ts`:

```ts
const TRANSITION_TO_AGENT_STATE: Record<TransitionTarget, AgentState> = {
  init: 'initializing',
  running: 'running',
  pr_open: 'pr_open',
  pr_merged: 'pr_merged',
  finished: 'finished',
  error: 'error',
  idle: 'idle',
  waiting: 'waiting',
};
```

- [ ] **Step 4: Remove the inferred state path**

Delete from `IngestService`: the `hasPrCreateInvocation` import + its `:484` branch; `computeNextState`; `lastRunIdCache` field, its `.get`/`.set` in `applyStateTransition`, and `primeLastRunId` + its caller; the now-unused `applyStateTransition` runId param if nothing else uses it. Leave transcript ingestion writing `tool_calls`/timeline/metrics untouched. (Keep `recordError` for the startup-failure path, or migrate it to a `*_exited` non-zero event in Task 4 — pick one and note it; recommended: keep `recordError` as the startup-phase-failure path, and have the runner's non-zero `*_exited` event also route to `error` via a `reduceState` extension. If extending `reduceState`, add the case + test in Task 2's file.)

- [ ] **Step 5: Run to verify it passes**

Run: `npm run -w crew-daemon test` → PASS (transcript-state tests removed/replaced; concrete-path tests green).

- [ ] **Step 6: Resolve the followups**

Move the `idle`/`waiting`-unreachable entry and the `finished`-footgun entry from `## Active` to `## Resolved` in `docs/followups.md`, updating both ToC links and appending a `**Resolved 2026-06-18:**` line noting concrete triggers made `idle` reachable.

- [ ] **Step 7: Run full verification + commit**

Run: `npm run typecheck && npm run lint && npm run -w crew-daemon test`
Run: `agents-doc-parity-check` (the `.agents/architecture.md` state-machine description must be updated to the concrete model).

```bash
git add packages/daemon/src/services/IngestService.ts packages/daemon/src/services/state-derivation.ts \
  packages/daemon/src/services/IngestService.test.ts packages/daemon/src/services/state-derivation.test.ts docs/followups.md
git commit -m "refactor(daemon): drop inferred state path; activate idle via concrete events"
```

---

## Self-Review

**Spec coverage:**
- Concrete-signals-only source of truth → Tasks 2-6 (reducer + emitters + hook + removal). ✓
- Durable per-key log + chokidar tail + eventId idempotency → Task 3. ✓
- PostToolUse hook with `;`/`&&` regex + URL parse + exit-0 gate → Task 5. ✓
- `idle` reachable (clean run exit, no PR) → reducer `run_exited` case (Task 2) + mapping (Task 6). ✓
- Forward-only migration; PrPoller + finish kept; timeline UI untouched → no PrPoller/dashboard tasks (intentional). ✓
- Retire `finished`-footgun + `idle`-unreachable followups → Task 6 Step 6. ✓

**Open carry-overs (intentional, flagged for ticketing):**
- The `error`-from-`*_exited` routing is left as a decision inside Task 6 Step 4 (extend `reduceState` vs. keep `recordError`). Recommended path stated; the implementer picks and tests it. This is the one spot the plan defers a small design call rather than a value.
- `pr_merged` stays `PrPoller`-driven; `crew finish`'s existing daemon call is kept until Task 6 unifies it through the event (`finish_completed`).

**Placeholder scan:** no TBD/TODO; every code step carries real code. The two "mirror the existing X" steps (watcher in Task 3 Step 7, injection in Task 5 Step 5) point at exact shipped files to clone rather than restating identical code — appropriate for DRY cloning of `watchStartupEvents`/`onStartupFile` and the skill-injection settings writer.

**Type consistency:** `StateEvent`/`StateEventKind`/`EventSource` (Task 1) are consumed unchanged in Tasks 3-5; `reduceState(current, event)` signature (Task 2) matches its call in Task 3 Step 6; `emitStateEvent(key, input, opts)` (Task 4) matches its test and call sites.
