# Slice 1c — Agent drawer + push updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the agent detail drawer + full-page route, widen the transcript schema to model every JSONL event type, add a `state_transitions` table for ordered state history, and replace polling with an SSE push channel from the daemon.

**Architecture:** Three new daemon read endpoints (`/api/agents/:key`, `/api/agents/:key/state-history`, `/api/agents/:key/timeline`) plus an SSE firehose at `/api/events`. Schema lives in `crew-shared`; an exhaustive Zod discriminated union (~38 variants) parses any JSONL event with `unknown`-variant fallback. Dashboard subscribes to SSE via a singleton `EventSource` wrapper that patches the TanStack Query cache directly for typed events and invalidates on pings. A 30s polling fallback stays configured as belt-and-suspenders.

**Tech Stack:** Daemon: Fastify, Awilix, Zod, Kysely (`kysely-better-sqlite3`), pino, Vitest. CLI: existing daemon-client. Dashboard: TanStack Query, React Router, `@tanstack/react-virtual` (new), Vitest + RTL, Playwright. Shared: Zod, Vitest.

**Reference spec:** [`docs/superpowers/specs/2026-05-05-slice-1c-agent-drawer-and-push-updates-design.md`](../specs/2026-05-05-slice-1c-agent-drawer-and-push-updates-design.md). The plan implements the spec section-by-section; cross-references like "(spec §5.4)" point back.

---

## Task 1: Shared transcript schema — envelope + variant skeleton

**Files:**
- Create: `packages/shared/src/transcripts/schemas.ts`
- Modify: `packages/shared/src/transcripts/types.ts` (replace existing union)
- Test: `packages/shared/src/transcripts/parser.test.ts` (extend; `parser.ts` itself updated in Task 2)

The base envelope and the top-level discriminated union skeleton land first so subsequent variant tasks can plug in without reshaping the union each time.

- [ ] **Step 1: Add envelope + skeleton schemas** in `schemas.ts`:

```ts
import { z } from 'zod';

export const baseEnvelopeSchema = z.object({
  uuid: z.string().optional(),
  parentUuid: z.string().nullable().optional(),
  timestamp: z.string().optional(),
  sessionId: z.string().optional(),
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
  userType: z.string().optional(),
  entrypoint: z.string().optional(),
  version: z.string().optional(),
  isSidechain: z.boolean().optional(),
  isMeta: z.boolean().optional(),
});

export const unknownEventSchema = baseEnvelopeSchema.extend({
  type: z.literal('unknown'),
  raw: z.unknown(),
  reason: z.enum(['unknown_top_level', 'unknown_subtype', 'zod_failure']),
});

export const transcriptEventSchema = z.discriminatedUnion('type', [
  unknownEventSchema,
  // variants registered by Task 2
]);

export type TranscriptEvent = z.infer<typeof transcriptEventSchema>;
```

- [ ] **Step 2: Replace `types.ts`** with `export type { TranscriptEvent } from './schemas.js';` plus a re-export of legacy `ToolCall` / `AssistantText` / `AggregateUsage` so slice 1b consumers still compile.

- [ ] **Step 3: Run shared tests to confirm nothing is broken**

```
npm run test --workspace=crew-shared
```

Expected: existing parser tests still pass against the legacy union (variants haven't been removed yet — they'll move into `schemas.ts` in Task 2).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/transcripts/schemas.ts packages/shared/src/transcripts/types.ts
git commit -m "feat(shared): scaffold exhaustive TranscriptEvent envelope + union (slice 1c)"
```

---

## Task 2: Shared transcript schema — all variants + fixtures

**Files:**
- Modify: `packages/shared/src/transcripts/schemas.ts` (add the ~38 variants)
- Modify: `packages/shared/src/transcripts/parser.ts`
- Create: `packages/shared/src/transcripts/fixtures/<variant>.jsonl` (one per variant)
- Test: `packages/shared/src/transcripts/parser.test.ts`

Variants and their nested discriminants come straight from spec §2 + §3.2. Pattern is uniform: each variant extends `baseEnvelopeSchema`, fixes the `type` literal (and any nested discriminant), declares known fields, applies `.passthrough()` to preserve forward-compat fields.

- [ ] **Step 1: Add the 12 top-level variants** in `schemas.ts`. Pattern for `assistant`:

```ts
export const toolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
}).passthrough();

export const thinkingContentSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
}).passthrough();

export const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
}).passthrough();

export const unknownContentSchema = z.object({ type: z.string() }).passthrough();

export const assistantContentSchema = z.discriminatedUnion('type', [
  toolUseContentSchema, thinkingContentSchema, textContentSchema,
]).or(unknownContentSchema);

export const usageBlockSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
}).passthrough();

export const assistantEventSchema = baseEnvelopeSchema.extend({
  type: z.literal('assistant'),
  message: z.object({
    id: z.string().optional(),
    role: z.literal('assistant').optional(),
    content: z.array(assistantContentSchema),
    usage: usageBlockSchema.optional(),
  }).passthrough(),
}).passthrough();
```

Repeat the same envelope-extend + literal-discriminator + `.passthrough()` pattern for: `userEventSchema` (content array of `tool_result`/`text` plus the bare-string fallback at the message level), `queueOperationEventSchema` (`operation`, `content`, `timestamp`), `attachmentEventSchema` (with nested `attachment.type` discriminator over the 20 subtypes), `lastPromptEventSchema`, `permissionModeEventSchema`, `fileHistorySnapshotEventSchema`, `systemEventSchema` (with nested `subtype` discriminator over the 7 subtypes), `prLinkEventSchema`, `aiTitleEventSchema`, `customTitleEventSchema`, `agentNameEventSchema`. Field names come from the corpus walk in spec §2.

- [ ] **Step 2: Register all variants** in the union:

```ts
export const transcriptEventSchema = z.discriminatedUnion('type', [
  assistantEventSchema, userEventSchema, queueOperationEventSchema,
  attachmentEventSchema, lastPromptEventSchema, permissionModeEventSchema,
  fileHistorySnapshotEventSchema, systemEventSchema, prLinkEventSchema,
  aiTitleEventSchema, customTitleEventSchema, agentNameEventSchema,
  unknownEventSchema,
]);
```

- [ ] **Step 3: Rewrite `parser.ts`**:

```ts
import { transcriptEventSchema, type TranscriptEvent } from './schemas.js';

export function parseTranscriptLine(line: string): TranscriptEvent | null {
  let json: unknown;
  try { json = JSON.parse(line); } catch { return null; }

  const result = transcriptEventSchema.safeParse(json);
  if (result.success) return result.data;

  const raw = json as Record<string, unknown>;
  const reason = typeof raw?.type === 'string'
    ? (transcriptEventSchema.options.some(s => 'shape' in s && (s as any).shape?.type?._def?.value === raw.type)
        ? 'zod_failure' : 'unknown_top_level')
    : 'unknown_top_level';

  return { type: 'unknown', raw, reason } as TranscriptEvent;
}
```

- [ ] **Step 4: Add one fixture per variant** under `fixtures/`. Lift from real corpus and sanitize. Filenames: `assistant-tool-use.jsonl`, `assistant-thinking.jsonl`, `assistant-text.jsonl`, `user-tool-result.jsonl`, `user-text.jsonl`, `user-bare-string.jsonl`, `queue-operation-enqueue.jsonl`, `queue-operation-dequeue.jsonl`, then one per system subtype (`system-turn-duration.jsonl`, etc.) and per attachment subtype (`attachment-hook-success.jsonl`, etc.). ~38 files.

- [ ] **Step 5: Add per-variant tests** in `parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTranscriptLine } from './parser.js';

const fixtureDir = join(__dirname, 'fixtures');

describe('parseTranscriptLine — every variant', () => {
  it.each([
    ['assistant-tool-use.jsonl', 'assistant'],
    ['assistant-thinking.jsonl', 'assistant'],
    // ... entry per fixture
    ['system-turn-duration.jsonl', 'system'],
    ['attachment-hook-success.jsonl', 'attachment'],
  ])('parses %s as type=%s', (file, expectedType) => {
    const line = readFileSync(join(fixtureDir, file), 'utf8').trim();
    const evt = parseTranscriptLine(line);
    expect(evt).not.toBeNull();
    expect(evt!.type).toBe(expectedType);
  });

  it('returns null on malformed JSON', () => {
    expect(parseTranscriptLine('not json')).toBeNull();
  });

  it('returns unknown variant on unrecognized type', () => {
    const evt = parseTranscriptLine(JSON.stringify({ type: 'martian' }));
    expect(evt).toMatchObject({ type: 'unknown', reason: 'unknown_top_level' });
  });

  it('returns unknown variant on Zod failure for known type', () => {
    const evt = parseTranscriptLine(JSON.stringify({ type: 'assistant', message: 'wrong' }));
    expect(evt).toMatchObject({ type: 'unknown', reason: 'zod_failure' });
  });
});
```

- [ ] **Step 6: Run tests, expect green**

```
npm run test --workspace=crew-shared -- transcripts/parser.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/transcripts/
git commit -m "feat(shared): exhaustive TranscriptEvent schema covering every JSONL variant (slice 1c)"
```

---

## Task 3: Migration 0002 — `state_transitions` table

**Files:**
- Create: `packages/daemon/src/migrations/0002_state_transitions.ts`
- Test: `packages/daemon/src/migrations/0002_state_transitions.test.ts`

- [ ] **Step 1: Write failing migration test**

```ts
import { describe, expect, it } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import { up as up0001 } from './0001_agents_runs_tool_calls.js';
import { up as up0002 } from './0002_state_transitions.js';

describe('migration 0002', () => {
  it('creates state_transitions with the expected shape', async () => {
    const db = new Kysely<any>({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
    await up0001(db);
    await up0002(db);
    const cols = await db.selectFrom('sqlite_master')
      .select('sql').where('name', '=', 'state_transitions').executeTakeFirst();
    expect(cols?.sql).toMatch(/agent_key TEXT NOT NULL/);
    expect(cols?.sql).toMatch(/from_state TEXT/);
    expect(cols?.sql).toMatch(/to_state TEXT NOT NULL/);
    expect(cols?.sql).toMatch(/ts INTEGER NOT NULL/);
  });

  it('is idempotent', async () => {
    const db = new Kysely<any>({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
    await up0001(db);
    await up0002(db);
    await expect(up0002(db)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (file doesn't exist).

- [ ] **Step 3: Write `0002_state_transitions.ts`**

```ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS state_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      from_state TEXT,
      to_state TEXT NOT NULL,
      ts INTEGER NOT NULL,
      CHECK (to_state IN ('init','running','pr_open','error','finished','idle','waiting'))
    )
  `.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS state_transitions_agent_ts ON state_transitions (agent_key, ts)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS state_transitions`.execute(db);
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/migrations/0002_state_transitions.ts packages/daemon/src/migrations/0002_state_transitions.test.ts
git commit -m "feat(daemon): migration 0002 — state_transitions table (slice 1c)"
```

---

## Task 4: Migration 0002 — backfill from existing runs

**Files:**
- Modify: `packages/daemon/src/migrations/0002_state_transitions.ts`
- Modify: `packages/daemon/src/migrations/0002_state_transitions.test.ts`

The backfill walks every distinct `agent_key` in `runs`, applies the existing slice 1b state-derivation rules incrementally over its tool_calls, and inserts one row per state flip (spec §4.2).

- [ ] **Step 1: Add backfill test**

```ts
it('backfills transitions per agent', async () => {
  const db = new Kysely<any>({ dialect: new SqliteDialect({ database: new Database(':memory:') }) });
  await up0001(db);
  // seed: agent KAN-1 has 3 tool_calls, the third is a `gh pr create` Bash call
  await db.insertInto('runs').values({
    id: 1, agent_key: 'KAN-1', command: 'run', started_at: 1000, completed_at: null,
  }).execute();
  await db.insertInto('tool_calls').values([
    { run_id: 1, tool_name: 'Read',  summary: 'a', ts: 1100, tokens: 0 },
    { run_id: 1, tool_name: 'Edit',  summary: 'b', ts: 1200, tokens: 0 },
    { run_id: 1, tool_name: 'Bash',  summary: 'gh pr create', ts: 1300, tokens: 0 },
  ]).execute();
  await up0002(db);
  const rows = await db.selectFrom('state_transitions')
    .where('agent_key', '=', 'KAN-1').orderBy('ts').selectAll().execute();
  expect(rows.map(r => r.to_state)).toEqual(['init', 'running', 'pr_open']);
});
```

- [ ] **Step 2: Implement backfill** in the migration's `up`. Reuse the existing slice-1b derivation by importing a small helper from `AgentsService` (extract `deriveState(toolCalls)` if not already exported). Loop:

```ts
const agents = await db.selectFrom('runs').select('agent_key').distinct().execute();
for (const { agent_key } of agents) {
  await db.transaction().execute(async trx => {
    const calls = await trx.selectFrom('tool_calls')
      .innerJoin('runs', 'runs.id', 'tool_calls.run_id')
      .where('runs.agent_key', '=', agent_key)
      .orderBy('tool_calls.ts').selectAll('tool_calls').execute();
    let prev: string | null = null;
    const acc: Array<{ ts: number; state: string }> = [];
    for (let i = 0; i <= calls.length; i++) {
      const slice = calls.slice(0, i);
      const state = deriveState(slice);
      if (state !== prev) { acc.push({ ts: slice.at(-1)?.ts ?? 0, state }); prev = state; }
    }
    if (acc.length === 0) return;
    await trx.insertInto('state_transitions').values(
      acc.map((a, i) => ({ agent_key, from_state: i === 0 ? null : acc[i-1].state, to_state: a.state, ts: a.ts })),
    ).execute();
  }).catch(err => {/* log + skip per spec §8.3; don't rethrow */});
}
```

- [ ] **Step 3: Run tests, expect PASS**

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/migrations/0002_state_transitions.ts packages/daemon/src/migrations/0002_state_transitions.test.ts packages/daemon/src/services/AgentsService.ts
git commit -m "feat(daemon): backfill state_transitions on migration 0002 (slice 1c)"
```

---

## Task 5: `EventBus` service + ring buffer

**Files:**
- Create: `packages/daemon/src/services/EventBus.ts`
- Create: `packages/daemon/src/services/EventBus.test.ts`

Spec §4.4. Single Awilix-registered service; in-process pub/sub; ring buffer for `last-event-id` replay.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus.js';

describe('EventBus', () => {
  it('publishes to subscribers', () => {
    const bus = new EventBus({ bufferSize: 10 });
    const seen: any[] = [];
    bus.subscribe({ onEvent: e => seen.push(e) });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'KAN-1' } });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'tool_calls.changed', id: expect.any(String) });
  });

  it('replays from lastEventId', () => {
    const bus = new EventBus({ bufferSize: 10 });
    const e1 = bus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });
    const seen: any[] = [];
    bus.subscribe({ lastEventId: e1.id, onEvent: e => seen.push(e) });
    expect(seen.map(e => e.data.key)).toEqual(['B']);
  });

  it('emits cache.miss when lastEventId is evicted', () => {
    const bus = new EventBus({ bufferSize: 2 });
    const stale = bus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'C' } });
    const seen: any[] = [];
    bus.subscribe({ lastEventId: stale.id, onEvent: e => seen.push(e) });
    expect(seen[0]).toMatchObject({ type: 'cache.miss' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `EventBus.ts`**

```ts
import { randomUUID } from 'node:crypto';

export type SsePayload =
  | { type: 'agent.state_changed'; data: { key: string; from: string|null; to: string; ts: number } }
  | { type: 'tool_calls.changed';  data: { key: string } }
  | { type: 'run.completed';       data: { key: string; ts: number } }
  | { type: 'cache.miss';          data: Record<string, never> };

export interface SseEvent extends SsePayload { id: string; }

interface SubscribeOpts { lastEventId?: string; onEvent: (e: SseEvent) => void; }
type Unsubscribe = () => void;

export class EventBus {
  private buffer: SseEvent[] = [];
  private subs = new Set<(e: SseEvent) => void>();
  private bufferSize: number;
  constructor(opts: { bufferSize?: number } = {}) { this.bufferSize = opts.bufferSize ?? 1000; }

  publish(p: SsePayload): SseEvent {
    const evt: SseEvent = { ...p, id: randomUUID() };
    this.buffer.push(evt);
    if (this.buffer.length > this.bufferSize) this.buffer.shift();
    for (const fn of this.subs) fn(evt);
    return evt;
  }

  subscribe({ lastEventId, onEvent }: SubscribeOpts): Unsubscribe {
    if (lastEventId !== undefined) {
      const idx = this.buffer.findIndex(e => e.id === lastEventId);
      if (idx === -1) {
        onEvent({ id: randomUUID(), type: 'cache.miss', data: {} });
      } else {
        for (const e of this.buffer.slice(idx + 1)) onEvent(e);
      }
    }
    this.subs.add(onEvent);
    return () => this.subs.delete(onEvent);
  }
}
```

- [ ] **Step 4: Register `EventBus` in the Awilix container** (`packages/daemon/src/container.ts` or wherever services are wired) as a singleton.

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/services/EventBus.ts packages/daemon/src/services/EventBus.test.ts packages/daemon/src/container.ts
git commit -m "feat(daemon): EventBus pub/sub + ring buffer for SSE (slice 1c)"
```

---

## Task 6: SSE endpoint `GET /api/events`

**Files:**
- Create: `packages/daemon/src/routes/events.ts`
- Create: `packages/daemon/src/routes/events.test.ts`
- Modify: `packages/daemon/src/server.ts` (or wherever routes are registered)

Spec §5.4. Standard SSE framing; `last-event-id` header on connect triggers replay through the EventBus.

- [ ] **Step 1: Write failing test using supertest-style fetch**

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer } from '../testing/buildTestServer.js'; // helper from slice 1b

describe('GET /api/events', () => {
  it('streams a published event', async () => {
    const { app, eventBus } = await buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    // simulate publish
    setTimeout(() => eventBus.publish({ type: 'tool_calls.changed', data: { key: 'X' } }), 10);
    const body = await res.body;
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(body).toMatch(/event: tool_calls.changed/);
    expect(body).toMatch(/"key":"X"/);
  });
});
```

(If `app.inject` doesn't surface streaming bodies, swap to `fastify.listen()` + raw `fetch` against `app.server.address()`.)

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `routes/events.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { EventBus, SseEvent } from '../services/EventBus.js';

export async function eventsRoutes(app: FastifyInstance, deps: { eventBus: EventBus }) {
  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    const lastEventId = req.headers['last-event-id'] as string | undefined;
    const send = (e: SseEvent) => {
      reply.raw.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
    };
    const unsub = deps.eventBus.subscribe({ lastEventId, onEvent: send });
    req.raw.on('close', unsub);
  });
}
```

- [ ] **Step 4: Register the route** in the server boot.

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/routes/events.ts packages/daemon/src/routes/events.test.ts packages/daemon/src/server.ts
git commit -m "feat(daemon): GET /api/events SSE endpoint (slice 1c)"
```

---

## Task 7: `TimelineService` — re-parse JSONL on demand

**Files:**
- Create: `packages/daemon/src/services/TimelineService.ts`
- Create: `packages/daemon/src/services/TimelineService.test.ts`

Spec §5.3. Reads the run's JSONL line-by-line, calls `parseTranscriptLine` from shared, returns the array.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TimelineService } from './TimelineService.js';

describe('TimelineService', () => {
  it('returns parsed events for an existing transcript', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'timeline-'));
    const path = join(dir, 't.jsonl');
    writeFileSync(path, [
      JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 10 }),
      JSON.stringify({ type: 'pr-link', url: 'https://github.com/x/y/pull/1' }),
    ].join('\n'));
    const svc = new TimelineService({ resolveJsonlPath: () => path });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toHaveLength(2);
    expect(out.events[0].type).toBe('system');
    expect(out.warnings).toEqual([]);
  });

  it('returns empty + warning on missing file', async () => {
    const svc = new TimelineService({ resolveJsonlPath: () => '/no/such/path' });
    const out = await svc.getTimeline('KAN-1');
    expect(out.events).toEqual([]);
    expect(out.warnings).toEqual(['transcript-missing']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `TimelineService.ts`**

```ts
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseTranscriptLine, type TranscriptEvent } from 'crew-shared';

export interface TimelineDeps { resolveJsonlPath: (agentKey: string) => string | null; }

export class TimelineService {
  constructor(private deps: TimelineDeps) {}

  async getTimeline(agentKey: string): Promise<{ events: TranscriptEvent[]; warnings: string[] }> {
    const path = this.deps.resolveJsonlPath(agentKey);
    if (!path) return { events: [], warnings: ['transcript-missing'] };

    const events: TranscriptEvent[] = [];
    try {
      const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        const evt = parseTranscriptLine(line);
        if (evt) events.push(evt);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') return { events: [], warnings: ['transcript-missing'] };
      throw err;
    }
    return { events, warnings: [] };
  }
}
```

- [ ] **Step 4: Register `TimelineService`** in the container, wiring `resolveJsonlPath` to the same helper slice 1b uses (`claudeProjectDirFor` + lookup of the run's session id).

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/services/TimelineService.ts packages/daemon/src/services/TimelineService.test.ts packages/daemon/src/container.ts
git commit -m "feat(daemon): TimelineService re-parses JSONL on demand (slice 1c)"
```

---

## Task 8: `GET /api/agents/:key` — single-agent detail endpoint

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts` (add `getByKey`)
- Modify: `packages/daemon/src/routes/agents.ts`
- Modify: `packages/daemon/src/services/AgentsService.test.ts`
- Modify: `packages/daemon/src/routes/agents.test.ts`

Spec §5.1. Joins runs + tool_calls aggregates + latest state; returns the `AgentDetail` shape.

- [ ] **Step 1: Write failing service test**

```ts
it('returns detail with runs, tokens, tool_call_count', async () => {
  const svc = makeService(); // helper builds in-memory db + seeds an agent
  const detail = await svc.getByKey('KAN-1');
  expect(detail).toMatchObject({
    key: 'KAN-1',
    state: 'pr_open',
    pr_url: 'https://github.com/x/y/pull/1',
    tokens: { total: expect.any(Number) },
    tool_call_count: expect.any(Number),
    runs: expect.arrayContaining([expect.objectContaining({ command: 'run' })]),
  });
});

it('returns null when no run exists for that key', async () => {
  const svc = makeService();
  expect(await svc.getByKey('NOPE-99')).toBeNull();
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `getByKey`** on `AgentsService` (Kysely query joining `runs` + `tool_calls` aggregates).

- [ ] **Step 4: Add the route** in `routes/agents.ts`:

```ts
app.get('/api/agents/:key', async (req, reply) => {
  const { key } = req.params as { key: string };
  const detail = await deps.agentsService.getByKey(key);
  if (!detail) return reply.status(404).send({ error: 'agent not found' });
  return detail;
});
```

- [ ] **Step 5: Add route test** asserting 200 + body for an existing agent and 404 for an unknown one.

- [ ] **Step 6: Run tests, expect PASS**

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/services/AgentsService.ts packages/daemon/src/services/AgentsService.test.ts packages/daemon/src/routes/agents.ts packages/daemon/src/routes/agents.test.ts
git commit -m "feat(daemon): GET /api/agents/:key returns single-agent detail (slice 1c)"
```

---

## Task 9: `GET /api/agents/:key/state-history`

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts` (add `getStateHistory`)
- Modify: `packages/daemon/src/routes/agents.ts`
- Modify: `packages/daemon/src/services/AgentsService.test.ts`
- Modify: `packages/daemon/src/routes/agents.test.ts`

- [ ] **Step 1: Write failing service test**

```ts
it('returns transitions ordered by ts', async () => {
  const svc = makeService(); // seed: state_transitions for KAN-1: init→running→pr_open
  const out = await svc.getStateHistory('KAN-1');
  expect(out.transitions.map(t => t.to)).toEqual(['init', 'running', 'pr_open']);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** with a Kysely `selectFrom('state_transitions').where('agent_key','=',key).orderBy('ts')`.

- [ ] **Step 4: Add route**

```ts
app.get('/api/agents/:key/state-history', async (req) => {
  const { key } = req.params as { key: string };
  return deps.agentsService.getStateHistory(key);
});
```

- [ ] **Step 5: Add route test, run all daemon tests, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/services/AgentsService.ts packages/daemon/src/services/AgentsService.test.ts packages/daemon/src/routes/agents.ts packages/daemon/src/routes/agents.test.ts
git commit -m "feat(daemon): GET /api/agents/:key/state-history (slice 1c)"
```

---

## Task 10: `GET /api/agents/:key/timeline`

**Files:**
- Modify: `packages/daemon/src/routes/agents.ts`
- Modify: `packages/daemon/src/routes/agents.test.ts`

- [ ] **Step 1: Write failing route test**

```ts
it('returns parsed events for a seeded transcript', async () => {
  const { app } = await buildTestServer({ seed: 'KAN-1-with-jsonl' });
  const res = await app.inject({ method: 'GET', url: '/api/agents/KAN-1/timeline' });
  expect(res.statusCode).toBe(200);
  expect(res.json().events).toBeInstanceOf(Array);
  expect(res.json().events.length).toBeGreaterThan(0);
});

it('returns 200 + empty events + warning header when transcript missing', async () => {
  const { app } = await buildTestServer({ seed: 'KAN-1-no-jsonl' });
  const res = await app.inject({ method: 'GET', url: '/api/agents/KAN-1/timeline' });
  expect(res.statusCode).toBe(200);
  expect(res.json().events).toEqual([]);
  expect(res.headers['x-crew-warning']).toBe('transcript-missing');
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add route**

```ts
app.get('/api/agents/:key/timeline', async (req, reply) => {
  const { key } = req.params as { key: string };
  const out = await deps.timelineService.getTimeline(key);
  if (out.warnings.includes('transcript-missing')) reply.header('X-Crew-Warning', 'transcript-missing');
  return { events: out.events };
});
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/routes/agents.ts packages/daemon/src/routes/agents.test.ts
git commit -m "feat(daemon): GET /api/agents/:key/timeline (slice 1c)"
```

---

## Task 11: IngestService — write state_transitions + publish state_changed

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/IngestService.test.ts`

The ingest loop (the `for await (const event of tailTranscript(...))` block) gets one new step per event: re-derive state, compare to in-memory cache, on flip insert a transition row + publish.

- [ ] **Step 1: Write failing test**

```ts
it('writes state_transitions row + publishes agent.state_changed on derived flip', async () => {
  const bus = new EventBus({ bufferSize: 10 });
  const seen: any[] = [];
  bus.subscribe({ onEvent: e => seen.push(e) });
  const svc = makeIngestService({ eventBus: bus });
  await svc.processEventForTest({ runId: 1, agentKey: 'KAN-1', event: assistantToolUseFixture });
  await svc.processEventForTest({ runId: 1, agentKey: 'KAN-1', event: ghPrCreateFixture });
  const rows = await db.selectFrom('state_transitions').selectAll().execute();
  expect(rows.map(r => r.to_state)).toEqual(['running', 'pr_open']);
  expect(seen.filter(e => e.type === 'agent.state_changed')).toHaveLength(2);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add a per-agent state cache to IngestService** (`Map<agentKey, derivedState>`). After each event processed, recompute derived state from the now-current tool_calls; if changed, insert + publish.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/IngestService.ts packages/daemon/src/services/IngestService.test.ts
git commit -m "feat(daemon): IngestService writes state_transitions + emits agent.state_changed (slice 1c)"
```

---

## Task 12: IngestService — publish tool_calls.changed pings

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/IngestService.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it('publishes tool_calls.changed after each tool_calls insert', async () => {
  const bus = new EventBus({ bufferSize: 10 });
  const seen: any[] = [];
  bus.subscribe({ onEvent: e => seen.push(e) });
  const svc = makeIngestService({ eventBus: bus });
  await svc.processEventForTest({ runId: 1, agentKey: 'KAN-1', event: assistantToolUseFixture });
  expect(seen.filter(e => e.type === 'tool_calls.changed' && e.data.key === 'KAN-1')).toHaveLength(1);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: After the existing tool_calls insert** in the ingest loop, call `eventBus.publish({ type: 'tool_calls.changed', data: { key: agentKey } })`.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/IngestService.ts packages/daemon/src/services/IngestService.test.ts
git commit -m "feat(daemon): IngestService publishes tool_calls.changed pings (slice 1c)"
```

---

## Task 13: IngestService — PR URL extraction from `gh pr create` tool_result

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/IngestService.test.ts`

Spec §4.3 step 2 + §8.6.

- [ ] **Step 1: Write failing test**

```ts
it('writes runs.pr_url when tool_result contains a github PR URL', async () => {
  const svc = makeIngestService();
  await svc.processEventForTest({ runId: 1, agentKey: 'KAN-1',
    event: makeBashToolUse({ id: 'tu_1', input: 'gh pr create --title ...' }) });
  await svc.processEventForTest({ runId: 1, agentKey: 'KAN-1',
    event: makeToolResult({ tool_use_id: 'tu_1', content: 'Creating pull request for KAN-1...\nhttps://github.com/x/y/pull/42\n' }) });
  const row = await db.selectFrom('runs').where('id','=',1).selectAll().executeTakeFirst();
  expect(row?.pr_url).toBe('https://github.com/x/y/pull/42');
});

it('leaves pr_url NULL when tool_result has no URL', async () => {
  const svc = makeIngestService();
  await svc.processEventForTest({ runId: 1, agentKey: 'KAN-1',
    event: makeBashToolUse({ id: 'tu_1', input: 'gh pr create' }) });
  await svc.processEventForTest({ runId: 1, agentKey: 'KAN-1',
    event: makeToolResult({ tool_use_id: 'tu_1', content: 'error: not authenticated' }) });
  const row = await db.selectFrom('runs').where('id','=',1).selectAll().executeTakeFirst();
  expect(row?.pr_url).toBeNull();
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** in the user-event branch of the ingest loop. Maintain a small `Map<tool_use_id, agentKey | runId>` for in-flight `gh pr create` calls; when the matching `tool_result` lands, regex-scan its `content` for `/https?:\/\/github\.com\/[^\/\s]+\/[^\/\s]+\/pull\/\d+/`. On match, `UPDATE runs SET pr_url = ? WHERE id = ?`.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/IngestService.ts packages/daemon/src/services/IngestService.test.ts
git commit -m "feat(daemon): extract PR URL from gh pr create tool_result (slice 1c)"
```

---

## Task 14: `crew finish` — daemon registration parity

**Files:**
- Modify: `packages/cli/src/commands/finish.ts`
- Modify: `packages/cli/src/commands/finish.test.ts`

Slice 1b's `daemon-client` already has generic `registerRun({ command, ... })` and `completeRun(runId, ...)`. `crew finish` needs to call them at the right seams; no new client methods.

- [ ] **Step 1: Write failing test** (mock the daemon client; assert the two seams are hit with `command: 'finish'`).

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add the calls** to `finish.ts`:

```ts
const reg = await daemonClient.registerRun({ agentKey, command: 'finish', /* ... */ });
const runId = reg.ok ? reg.runId : null;
try {
  await runFinish(/* existing local logic */);
  if (runId) await daemonClient.completeRun(runId, { ok: true });
} catch (err) {
  if (runId) await daemonClient.completeRun(runId, { ok: false, error: String(err) });
  throw err;
}
```

- [ ] **Step 4: Daemon-side: ensure `runs.command` CHECK list includes `'finish'`** (slice 1b spec §6 already provides for this — verify, no migration needed).

- [ ] **Step 5: Daemon-side: when a `command='finish'` run completes ok**, publish `run.completed` from the routes layer. Add a small route test asserting this.

- [ ] **Step 6: Run all tests, expect PASS**

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/finish.ts packages/cli/src/commands/finish.test.ts packages/daemon/src/routes/runs.ts packages/daemon/src/routes/runs.test.ts
git commit -m "feat(cli,daemon): crew finish registers/completes runs + publishes run.completed (slice 1c)"
```

---

## Task 15: Dashboard — `eventStream.ts` singleton with reconnect/replay

**Files:**
- Create: `packages/dashboard/src/data/eventStream.ts`
- Create: `packages/dashboard/src/data/eventStream.test.ts`

Spec §7.2 + §8.4.

- [ ] **Step 1: Write failing test using mocked EventSource**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrewEventStream } from './eventStream.js';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string; listeners: Record<string, Array<(e: any) => void>> = {};
  onopen: any = null; onerror: any = null;
  constructor(url: string) { this.url = url; MockEventSource.instances.push(this); }
  addEventListener(name: string, fn: any) { (this.listeners[name] ||= []).push(fn); }
  emit(name: string, data: any, lastEventId?: string) {
    (this.listeners[name] ?? []).forEach(fn => fn({ data: JSON.stringify(data), lastEventId }));
  }
  close() {}
}

beforeEach(() => { (globalThis as any).EventSource = MockEventSource as any; MockEventSource.instances = []; });
afterEach(() => vi.useRealTimers());

describe('CrewEventStream', () => {
  it('dispatches typed events to subscribers', () => {
    const stream = new CrewEventStream('http://localhost/api/events');
    const seen: any[] = [];
    stream.on('agent.state_changed', e => seen.push(e));
    MockEventSource.instances[0].emit('agent.state_changed', { key: 'KAN-1', from: null, to: 'init', ts: 0 }, 'evt-1');
    expect(seen).toHaveLength(1);
  });

  it('on cache.miss invokes the onCacheMiss callback', () => {
    const onCacheMiss = vi.fn();
    new CrewEventStream('http://localhost/api/events', { onCacheMiss });
    MockEventSource.instances[0].emit('cache.miss', {}, 'evt-x');
    expect(onCacheMiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
type Handler = (data: any) => void;

export interface CrewEventStreamOpts { onCacheMiss?: () => void; }

export class CrewEventStream {
  private es: EventSource | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private lastEventId: string | undefined;
  private retryMs = 500;

  constructor(private url: string, private opts: CrewEventStreamOpts = {}) { this.connect(); }

  on(event: string, fn: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return () => this.handlers.get(event)!.delete(fn);
  }

  private connect() {
    // EventSource doesn't accept headers, so encode last-event-id as a query param —
    // the daemon route accepts both header and ?last_event_id= for client compat.
    const u = this.lastEventId ? `${this.url}?last_event_id=${this.lastEventId}` : this.url;
    this.es = new EventSource(u);
    const dispatch = (name: string) => (e: MessageEvent) => {
      this.lastEventId = (e as any).lastEventId ?? this.lastEventId;
      const data = JSON.parse(e.data);
      if (name === 'cache.miss') this.opts.onCacheMiss?.();
      this.handlers.get(name)?.forEach(fn => fn(data));
    };
    for (const t of ['agent.state_changed','tool_calls.changed','run.completed','cache.miss']) {
      this.es.addEventListener(t, dispatch(t));
    }
    this.es.onerror = () => {
      this.es?.close();
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 30000);
    };
    this.es.onopen = () => { this.retryMs = 500; };
  }
}
```

- [ ] **Step 4: Add the daemon-side support for `?last_event_id=` query param** so the client can reconnect with replay even though browser EventSource can't set headers. (Edit `routes/events.ts` to read `req.query.last_event_id` as a fallback.)

- [ ] **Step 5: Export a singleton instance** alongside the class so the rest of the dashboard can `import { eventStream }`:

```ts
export const eventStream = new CrewEventStream(`${import.meta.env.VITE_DAEMON_URL}/api/events`, {
  onCacheMiss: () => queryClient.refetchQueries(),
});
```

(Where `queryClient` is the existing TanStack Query client. If circular-import risk surfaces, defer the construction to a small `bootstrap.ts` that runs once at app entry.)

- [ ] **Step 6: Run, expect PASS**

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/data/eventStream.ts packages/dashboard/src/data/eventStream.test.ts packages/daemon/src/routes/events.ts
git commit -m "feat(dashboard): CrewEventStream singleton with reconnect + cache.miss handler (slice 1c)"
```

---

## Task 16: Dashboard — `HttpDaemonClient` new methods + shared types

**Files:**
- Modify: `packages/dashboard/src/data/HttpDaemonClient.ts`
- Modify: `packages/dashboard/src/data/HttpDaemonClient.test.ts`
- Modify: `packages/dashboard/src/data/types.ts` (add `AgentDetail`, `StateTransition`)

- [ ] **Step 1: Add shared types** in `data/types.ts`:

```ts
import type { TranscriptEvent } from 'crew-shared';
export type { TranscriptEvent };

export interface StateTransition { from: string | null; to: AgentState; ts: number; }

export interface AgentDetail {
  key: string;
  project: string;
  ticket_key: string;
  ticket_title: string | null;
  state: AgentState;
  worktree_path: string;
  pr_url: string | null;
  runs: Array<{ id: number; command: 'run' | 'fix-pr' | 'finish'; started_at: number; completed_at: number | null }>;
  tokens: { total: number; input: number; output: number; cache_read: number; cache_creation: number };
  tool_call_count: number;
}
```

- [ ] **Step 2: Write failing tests** for `getAgent(key)`, `getStateHistory(key)`, `getTimeline(key)` against a mocked fetch.

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the methods** mirroring the existing `listAgents` shape:

```ts
async getAgent(key: string): Promise<AgentDetail> {
  const r = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}`);
  if (r.status === 404) throw new AgentNotFoundError(key);
  if (!r.ok) throw new Error(`getAgent: HTTP ${r.status}`);
  return r.json();
}
async getStateHistory(key: string): Promise<{ transitions: StateTransition[] }> {
  const r = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/state-history`);
  if (!r.ok) throw new Error(`getStateHistory: HTTP ${r.status}`);
  return r.json();
}
async getTimeline(key: string): Promise<{ events: TranscriptEvent[]; warnings?: string[] }> {
  const r = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/timeline`);
  if (!r.ok) throw new Error(`getTimeline: HTTP ${r.status}`);
  const events = (await r.json()).events;
  const w = r.headers.get('X-Crew-Warning');
  return w ? { events, warnings: [w] } : { events };
}
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/data/HttpDaemonClient.ts packages/dashboard/src/data/HttpDaemonClient.test.ts packages/dashboard/src/data/types.ts
git commit -m "feat(dashboard): HttpDaemonClient.getAgent / getStateHistory / getTimeline + shared types (slice 1c)"
```

---

## Task 17: Dashboard — `useAgent`, `useStateHistory`, `useTimeline` hooks

**Files:**
- Modify: `packages/dashboard/src/data/queries.ts`
- Modify: `packages/dashboard/src/data/queries.test.ts`

- [ ] **Step 1: Write failing tests** asserting the three hooks return the right query keys, fetch on mount, and react to SSE events:
  - `agent.state_changed` patches `['agent', key]` cache.
  - `tool_calls.changed` invalidates `['agent', key, 'timeline']`.
  - `run.completed` invalidates `['agents']` + `['agent', key]`.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
export function useAgent(key: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const off1 = eventStream.on('agent.state_changed', (d: { key: string; to: string }) => {
      if (d.key !== key) return;
      qc.setQueryData(['agent', key], (old: AgentDetail | undefined) => old && { ...old, state: d.to });
    });
    const off2 = eventStream.on('run.completed', (d: { key: string }) => {
      if (d.key === key) qc.invalidateQueries({ queryKey: ['agent', key] });
    });
    return () => { off1(); off2(); };
  }, [key, qc]);
  return useQuery({ queryKey: ['agent', key], queryFn: () => client.getAgent(key), refetchInterval: 30_000 });
}
// useStateHistory, useTimeline follow the same shape;
// useTimeline subscribes to tool_calls.changed and invalidates ['agent', key, 'timeline'].
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/data/queries.ts packages/dashboard/src/data/queries.test.ts
git commit -m "feat(dashboard): useAgent/useStateHistory/useTimeline hooks with SSE wiring (slice 1c)"
```

---

## Task 18: Dashboard — `AgentDrawer` route shell

**Files:**
- Create: `packages/dashboard/src/routes/AgentDrawer.tsx`
- Create: `packages/dashboard/src/routes/AgentDrawer.test.tsx`
- Modify: `packages/dashboard/src/App.tsx` (or wherever routes are registered)

Spec §5 (header anatomy) and §7.1 (open behavior).

- [ ] **Step 1: Write failing test**

```tsx
it('mounts on /agent/:key, renders header with project / ticket / state badge', async () => {
  renderWithProviders(<MemoryRouter initialEntries={['/agent/KAN-1']}><App/></MemoryRouter>);
  await screen.findByTestId('drawer-header');
  expect(screen.getByText('KAN-1')).toBeInTheDocument();
  expect(screen.getByTestId('state-badge')).toHaveTextContent(/running|pr_open|finished/i);
});

it('closes on Esc and navigates to /', async () => {
  const { history } = renderWithProviders(
    <MemoryRouter initialEntries={['/agent/KAN-1']}><App/></MemoryRouter>,
  );
  await screen.findByTestId('drawer-header');
  await userEvent.keyboard('{Escape}');
  expect(history.location.pathname).toBe('/');
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** the drawer route (spec §5 anatomy):
  - Calls `useAgent(key)` for the header.
  - Header renders project, ticket key, ticket title, StateBadge (existing component), runtime, total tokens, worktree path link, GitHub PR link (when `pr_url` non-null), `↗ Open as page` link.
  - Body slot is a placeholder div the next tasks fill in.
  - Close behavior: Esc, click-outside, browser back, close button → `navigate('/')`.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/routes/AgentDrawer.tsx packages/dashboard/src/routes/AgentDrawer.test.tsx packages/dashboard/src/App.tsx
git commit -m "feat(dashboard): AgentDrawer route shell + header (slice 1c)"
```

---

## Task 19: Dashboard — `AgentFullPage` route

**Files:**
- Create: `packages/dashboard/src/routes/AgentFullPage.tsx`
- Create: `packages/dashboard/src/routes/AgentFullPage.test.tsx`
- Modify: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Write failing test** asserting `/agent/:key/full` mounts the same data with full-page (not drawer) layout.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — extract a shared `<AgentBody>` component from AgentDrawer body that AgentFullPage also renders, just without the drawer chrome.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/routes/AgentFullPage.tsx packages/dashboard/src/routes/AgentFullPage.test.tsx packages/dashboard/src/App.tsx
git commit -m "feat(dashboard): /agent/:key/full route (slice 1c)"
```

---

## Task 20: Dashboard — `TokenTable`

**Files:**
- Create: `packages/dashboard/src/components/TokenTable.tsx`
- Create: `packages/dashboard/src/components/TokenTable.test.tsx`

Spec §5a. Sortable per-tool aggregation table; columns: tool name, token count, share-of-total %.

- [ ] **Step 1: Write failing test**

```tsx
it('renders one row per distinct tool, sorted by token count desc by default', () => {
  render(<TokenTable rows={[{ tool: 'Bash', tokens: 1000 }, { tool: 'Read', tokens: 4000 }]}/>);
  const rows = screen.getAllByRole('row').slice(1); // skip header
  expect(rows[0]).toHaveTextContent('Read');
  expect(rows[1]).toHaveTextContent('Bash');
});

it('renders share-of-total %', () => {
  render(<TokenTable rows={[{ tool: 'Read', tokens: 8000 }, { tool: 'Bash', tokens: 2000 }]}/>);
  expect(screen.getByText('80%')).toBeInTheDocument();
});

it('clicking a column header reverses sort', async () => {
  render(<TokenTable rows={[{ tool: 'Bash', tokens: 1000 }, { tool: 'Read', tokens: 4000 }]}/>);
  await userEvent.click(screen.getByRole('columnheader', { name: /tokens/i }));
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Bash');
  expect(rows[1]).toHaveTextContent('Read');
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — small component, no virtualization (per-tool counts are small), monospace numerics via FiraCode utility class.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/TokenTable.tsx packages/dashboard/src/components/TokenTable.test.tsx
git commit -m "feat(dashboard): TokenTable component (slice 1c)"
```

---

## Task 21: Dashboard — `StateHistoryBar`

**Files:**
- Create: `packages/dashboard/src/components/StateHistoryBar.tsx`
- Create: `packages/dashboard/src/components/StateHistoryBar.test.tsx`

Spec §5b.

- [ ] **Step 1: Write failing test**

```tsx
it('renders transitions as inline pills with arrows between them', () => {
  render(<StateHistoryBar transitions={[
    { from: null, to: 'init', ts: 1 }, { from: 'init', to: 'running', ts: 2 }, { from: 'running', to: 'pr_open', ts: 3 },
  ]} onScrollTo={() => {}} />);
  const pills = screen.getAllByRole('button');
  expect(pills).toHaveLength(3);
  expect(pills[0]).toHaveTextContent('Initializing');
  expect(pills[2]).toHaveTextContent('PR open');
});

it('clicking a transition fires onScrollTo with that transition ts', async () => {
  const onScrollTo = vi.fn();
  render(<StateHistoryBar transitions={[{ from: null, to: 'init', ts: 7 }]} onScrollTo={onScrollTo}/>);
  await userEvent.click(screen.getByRole('button'));
  expect(onScrollTo).toHaveBeenCalledWith(7);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — `STATE_META[state].label` for the pill text, `state-meta.ts` color classes for the pill bg, arrow separators.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/StateHistoryBar.tsx packages/dashboard/src/components/StateHistoryBar.test.tsx
git commit -m "feat(dashboard): StateHistoryBar component (slice 1c)"
```

---

## Task 22: Dashboard — `Timeline` shell + virtualization

**Files:**
- Create: `packages/dashboard/src/components/Timeline/Timeline.tsx`
- Create: `packages/dashboard/src/components/Timeline/Timeline.test.tsx`
- Modify: `packages/dashboard/package.json` (add `@tanstack/react-virtual`)

Spec §5c skeleton; events come from `useTimeline(key)`. The shell hosts virtualization, the FilterChips/SearchBar/LiveModeToggle slots, and the EventCard renderer (Tasks 23–26).

- [ ] **Step 1: Add `@tanstack/react-virtual` to dashboard deps** and run `npm install`.

- [ ] **Step 2: Write failing test**

```tsx
it('renders one EventCard per event from useTimeline', () => {
  mockUseTimeline.mockReturnValue({ data: { events: [evt1, evt2, evt3] }, isLoading: false });
  render(<Timeline agentKey="KAN-1"/>);
  expect(screen.getAllByTestId('event-card')).toHaveLength(3);
});

it('shows a loading state', () => {
  mockUseTimeline.mockReturnValue({ data: undefined, isLoading: true });
  render(<Timeline agentKey="KAN-1"/>);
  expect(screen.getByTestId('timeline-loading')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Implement** the virtualized list via `useVirtualizer` from `@tanstack/react-virtual`. EventCard is a placeholder for now (renders a `<div data-testid="event-card">{event.type}</div>`); per-type renderers come in Task 26. Filter/search/live-mode slots are empty placeholders.

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/Timeline/ packages/dashboard/package.json
git commit -m "feat(dashboard): Timeline shell + virtualization (slice 1c)"
```

---

## Task 23: Dashboard — `FilterChips`

**Files:**
- Create: `packages/dashboard/src/components/Timeline/FilterChips.tsx`
- Create: `packages/dashboard/src/components/Timeline/FilterChips.test.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`

Spec §7.4 — six chip groups: Tool calls, Assistant prose, Thinking, System, Hooks & skills, Other.

- [ ] **Step 1: Write failing test**

```tsx
it('renders six chips with curated defaults', () => {
  render(<FilterChips visible={defaultVisibleSet} onChange={() => {}}/>);
  ['Tool calls','Assistant prose','Thinking','System','Hooks & skills','Other']
    .forEach(label => expect(screen.getByRole('button', { name: label })).toBeInTheDocument());
});

it('clicking a chip toggles its visibility set', async () => { /* ... */ });
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — one stable mapping from chip group → set of `TranscriptEvent.type` (and nested subtype where relevant) discriminants. Export `defaultVisibleSet`. Wire into Timeline by filtering the events array before passing to the virtualizer.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/FilterChips.tsx packages/dashboard/src/components/Timeline/FilterChips.test.tsx packages/dashboard/src/components/Timeline/Timeline.tsx
git commit -m "feat(dashboard): FilterChips with curated default-visible set (slice 1c)"
```

---

## Task 24: Dashboard — `SearchBar`

**Files:**
- Create: `packages/dashboard/src/components/Timeline/SearchBar.tsx`
- Create: `packages/dashboard/src/components/Timeline/SearchBar.test.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`

Spec §7.5.

- [ ] **Step 1: Write failing test**

```tsx
it('filters timeline events by substring against one-liner content', async () => {
  mockUseTimeline.mockReturnValue({ data: { events: [
    makeAssistantToolUse({ name: 'Bash', input: { command: 'npm test' } }),
    makeAssistantToolUse({ name: 'Read', input: { file_path: '/foo.ts' } }),
  ] }, isLoading: false });
  render(<Timeline agentKey="KAN-1"/>);
  expect(screen.getAllByTestId('event-card')).toHaveLength(2);
  await userEvent.type(screen.getByRole('searchbox'), 'npm');
  expect(screen.getAllByTestId('event-card')).toHaveLength(1);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** with `useDeferredValue` for input debouncing. The search predicate is type-specific via a small `eventOneLiner(evt)` helper (used both for rendering and for searching).

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/SearchBar.tsx packages/dashboard/src/components/Timeline/SearchBar.test.tsx packages/dashboard/src/components/Timeline/Timeline.tsx
git commit -m "feat(dashboard): Timeline SearchBar (slice 1c)"
```

---

## Task 25: Dashboard — `LiveModeToggle`

**Files:**
- Create: `packages/dashboard/src/components/Timeline/LiveModeToggle.tsx`
- Create: `packages/dashboard/src/components/Timeline/LiveModeToggle.test.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`

Spec §7.6.

- [ ] **Step 1: Write failing tests**:
  - Toggle defaults ON for active agents, OFF for finished/error.
  - When ON, new events appended to the bottom auto-scroll the virtualizer to the bottom.
  - When OFF, a "↓ N new events" pill appears in the bottom-right and clicking it scrolls + clears the count.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — internal state `liveMode: boolean`, `newEventCount: number`. Effect hook on the `events.length` change: if liveMode, scroll-to-bottom; else, increment counter.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/LiveModeToggle.tsx packages/dashboard/src/components/Timeline/LiveModeToggle.test.tsx packages/dashboard/src/components/Timeline/Timeline.tsx
git commit -m "feat(dashboard): Timeline live-mode toggle + new-events pill (slice 1c)"
```

---

## Task 26: Dashboard — `EventCard` router + per-type renderers

**Files:**
- Create: `packages/dashboard/src/components/Timeline/EventCard.tsx`
- Create: `packages/dashboard/src/components/Timeline/renderers/ToolUseCard.tsx`
- Create: `packages/dashboard/src/components/Timeline/renderers/ThinkingCard.tsx`
- Create: `packages/dashboard/src/components/Timeline/renderers/TextCard.tsx`
- Create: `packages/dashboard/src/components/Timeline/renderers/ToolResultCard.tsx`
- Create: `packages/dashboard/src/components/Timeline/renderers/SystemCard.tsx`
- Create: `packages/dashboard/src/components/Timeline/renderers/AttachmentCard.tsx`
- Create: `packages/dashboard/src/components/Timeline/renderers/RawCard.tsx`
- Test files: one `*.test.tsx` per renderer + `EventCard.test.tsx`

Spec §7.3. Each renderer outputs the §5c card anatomy: line 1 = type-specific one-liner, line 2 = timestamp + tokens. Click expands to type-specific full view.

- [ ] **Step 1: Write `EventCard.test.tsx`** asserting it dispatches by event type to the right renderer (one branch per renderer, including `unknown` → `RawCard`).

- [ ] **Step 2: Implement `EventCard`** as a switch over `event.type` (with nested switch for `assistant`/`user` content[] entries — each content item is its own card).

- [ ] **Step 3: For each renderer, write a focused test**, e.g. `ToolUseCard.test.tsx`:

```tsx
it('renders a Bash tool_use as line1 = [Bash] command-summary, line2 = HH:MM:SS · tokens', () => {
  render(<ToolUseCard event={makeAssistantToolUse({ name: 'Bash', input: { command: 'npm test' } })} />);
  expect(screen.getByTestId('card-line-1')).toHaveTextContent('[Bash] npm test');
  expect(screen.getByTestId('card-line-2')).toMatch(/^\d{2}:\d{2}:\d{2}/);
});

it('clicking expands to show full input', async () => {
  render(<ToolUseCard event={...} />);
  await userEvent.click(screen.getByTestId('card-line-1'));
  expect(screen.getByTestId('card-expanded')).toHaveTextContent('npm test');
});
```

Repeat with type-appropriate assertions for the other renderers:
- `ThinkingCard` — line1 = first ~80 chars of `thinking`, expand shows full prose.
- `TextCard` — line1 = first ~80 chars of text, expand shows full.
- `ToolResultCard` — line1 = `[result for {tool_use_id}]`, expand shows full content; if `is_error` true, line1 prefixed with red `[error]`.
- `SystemCard` — line1 = `[system/{subtype}]`, body type-specific (turn_duration shows `12.4s`, api_error shows the error message, etc.).
- `AttachmentCard` — line1 = `[{attachment.type}]`, body type-specific.
- `RawCard` — line1 = `[unknown]`, expand shows pretty-printed JSON of `raw`.

- [ ] **Step 4: Implement each renderer** following the line-1/line-2/expand pattern.

- [ ] **Step 5: Run all renderer tests, expect PASS**

- [ ] **Step 6: Commit (one commit for the whole renderer set; they're tightly coupled to EventCard)**

```bash
git add packages/dashboard/src/components/Timeline/EventCard.tsx packages/dashboard/src/components/Timeline/renderers/ packages/dashboard/src/components/Timeline/EventCard.test.tsx
git commit -m "feat(dashboard): EventCard + per-type Timeline renderers (slice 1c)"
```

---

## Task 27: Dashboard — empty filter state + "Show all"

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/Timeline.tsx`
- Modify: `packages/dashboard/src/components/Timeline/Timeline.test.tsx`

Spec §7.4 + §8.8.

- [ ] **Step 1: Write failing test**

```tsx
it('renders empty state when all chips are off', async () => {
  render(<Timeline agentKey="KAN-1"/>);
  // toggle every chip off via the rendered FilterChips
  for (const chip of ['Tool calls','Assistant prose','Thinking','System','Hooks & skills','Other']) {
    const btn = screen.getByRole('button', { name: chip });
    if (btn.getAttribute('aria-pressed') === 'true') await userEvent.click(btn);
  }
  expect(screen.getByText(/No events match your filters/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Show all/i })).toBeInTheDocument();
  expect(screen.queryAllByTestId('event-card')).toHaveLength(0);
});

it('Show all resets to defaults', async () => {
  render(<Timeline agentKey="KAN-1"/>);
  for (const chip of ['Tool calls','Assistant prose']) {
    await userEvent.click(screen.getByRole('button', { name: chip }));
  }
  await userEvent.click(screen.getByRole('button', { name: /Show all/i }));
  expect(screen.getByRole('button', { name: 'Tool calls' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Assistant prose' })).toHaveAttribute('aria-pressed', 'true');
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — when filtered events length is 0, render an empty-state div with copy + Show all button instead of the virtualizer.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Timeline/
git commit -m "feat(dashboard): Timeline empty-filter state + Show all (slice 1c)"
```

---

## Task 28: Dashboard — "Hide finished" toggle on `AgentsList`

**Files:**
- Modify: `packages/dashboard/src/components/AgentsList.tsx`
- Modify: `packages/dashboard/src/components/AgentsList.test.tsx`

Spec §7.7.

- [ ] **Step 1: Write failing test**

```tsx
it('hides finished agents by default; toggling off shows them', async () => {
  mockUseAgents.mockReturnValue({ data: [{ key: 'A', state: 'running' }, { key: 'B', state: 'finished' }] });
  render(<AgentsList/>);
  expect(screen.queryByText('B')).toBeNull();
  await userEvent.click(screen.getByRole('switch', { name: /Hide finished/i }));
  expect(screen.getByText('B')).toBeInTheDocument();
});

it('persists pref to localStorage', async () => {
  mockUseAgents.mockReturnValue({ data: [{ key: 'A', state: 'finished' }] });
  render(<AgentsList/>);
  await userEvent.click(screen.getByRole('switch', { name: /Hide finished/i }));
  expect(localStorage.getItem('crew.dashboard.hideFinished')).toBe('false');
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — `useState`-backed toggle, hydrated from `localStorage.getItem('crew.dashboard.hideFinished')` (default `'true'`), persisted on change. Filter the agents array before rendering rows.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/AgentsList.tsx packages/dashboard/src/components/AgentsList.test.tsx
git commit -m "feat(dashboard): Hide finished toggle on agents list (slice 1c)"
```

---

## Task 29: Bruno endpoints + flow extension

**Files:**
- Create: `bruno/endpoints/agents/get-agent-by-key.bru`
- Create: `bruno/endpoints/agents/get-state-history.bru`
- Create: `bruno/endpoints/agents/get-timeline.bru`
- Create: `bruno/endpoints/events/sse-stream.bru`
- Modify: `bruno/flows/main-smoke.bru`

Per the bruno-collection-maintenance skill — every new HTTP route ships with a `.bru` in the same commit.

- [ ] **Step 1: Author each endpoint `.bru`** with the standard request shape, plus an `assert:` block on response shape.

For example, `get-agent-by-key.bru`:

```
meta {
  name: get-agent-by-key
  type: http
  seq: 4
}
get {
  url: {{baseUrl}}/api/agents/{{agentKey}}
  body: none
  auth: none
}
vars:pre-request {
  agentKey: KAN-1
}
assert {
  res.status: eq 200
  res.body.key: isString
  res.body.state: isString
  res.body.tokens.total: isNumber
}
```

(Repeat shape for `get-state-history.bru` and `get-timeline.bru`. For `sse-stream.bru` use Bruno's plain-text response check — assert that `res.headers["content-type"]` matches `text/event-stream`. Bruno's SSE support is limited; a single connection-and-content-type assertion is enough.)

- [ ] **Step 2: Extend `main-smoke.bru`** with a "drawer-data" stanza that hits the three drawer endpoints in sequence using `vars:post-response` to chain the agent key.

- [ ] **Step 3: Run smoke against a worktree stack**

```
npm run bruno:smoke
```

Expected: PASS for all stanzas.

- [ ] **Step 4: Commit**

```bash
git add bruno/endpoints/agents/ bruno/endpoints/events/ bruno/flows/main-smoke.bru
git commit -m "test(bruno): coverage for slice 1c drawer + events endpoints"
```

---

## Task 30: Playwright E2E spec for the agent drawer

**Files:**
- Create: `tests/e2e/agent-drawer.spec.ts`
- Possibly modify: `tests/e2e/fixtures/` to add a seeded-agent helper

Spec §9.5.

- [ ] **Step 1: Write the spec** with the five required scenarios:

```ts
import { test, expect } from '@playwright/test';

test.describe('Agent drawer', () => {
  test('opens with timeline rendered', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('agent-row').first().click();
    await expect(page).toHaveURL(/\/agent\/[^/]+$/);
    await expect(page.getByTestId('drawer-header')).toBeVisible();
    await expect(page.getByTestId('event-card').first()).toBeVisible();
  });

  test('filter chips toggle event-type cards in DOM', async ({ page }) => {
    await page.goto('/agent/KAN-1');
    const before = await page.getByTestId('event-card').count();
    await page.getByRole('button', { name: 'Tool calls' }).click();
    const after = await page.getByTestId('event-card').count();
    expect(after).toBeLessThan(before);
  });

  test('empty filter state', async ({ page }) => {
    await page.goto('/agent/KAN-1');
    for (const chip of ['Tool calls','Assistant prose','Thinking','System','Hooks & skills','Other']) {
      const btn = page.getByRole('button', { name: chip });
      if (await btn.getAttribute('aria-pressed') === 'true') await btn.click();
    }
    await expect(page.getByText(/No events match your filters/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Show all/i })).toBeVisible();
    await expect(page.getByTestId('event-card')).toHaveCount(0);
    await page.getByRole('button', { name: /Show all/i }).click();
    await expect(page.getByTestId('event-card').first()).toBeVisible();
  });

  test('full-page route renders same content', async ({ page }) => {
    await page.goto('/agent/KAN-1/full');
    await expect(page.getByTestId('agent-body')).toBeVisible();
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    await expect(page.getByTestId('drawer-header')).toHaveCount(0);
  });

  test('state badge flips on synthetic SSE event without page reload', async ({ page }) => {
    // expose a window-level test hook from CrewEventStream during dev/test that injects a synthetic event
    await page.goto('/agent/KAN-1');
    const initial = await page.getByTestId('state-badge').textContent();
    await page.evaluate(() => (window as any).__crewTestInjectEvent('agent.state_changed', {
      key: 'KAN-1', from: 'running', to: 'pr_open', ts: Date.now(),
    }));
    await expect(page.getByTestId('state-badge')).not.toHaveText(initial!);
  });
});
```

- [ ] **Step 2: Add the test hook to CrewEventStream** (gated by `import.meta.env.DEV` so it doesn't ship to prod): expose `(window as any).__crewTestInjectEvent` that fans out via the same dispatcher real events use.

- [ ] **Step 3: Run E2E**

```
npm run test:e2e
```

Expected: PASS for all five scenarios.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/agent-drawer.spec.ts packages/dashboard/src/data/eventStream.ts
git commit -m "test(e2e): agent drawer Playwright coverage (slice 1c)"
```

---

## Final verification

- [ ] **Step 1: Run the full test matrix**

```
npm run lint
npm run format
npm run typecheck
npm run test:run
npm run bruno:smoke
npm run test:e2e
```

All commands exit 0.

- [ ] **Step 2: Boot a fresh worktree stack and exercise the drawer manually** (golden path + at least one off-default filter chip).

- [ ] **Step 3: Open the PR**

```
git push -u origin docs/slice-1c-design
gh pr create --base main --title "feat: slice 1c — agent drawer + push updates" --body "$(cat <<'EOF'
## Summary
Implements [slice 1c](docs/superpowers/specs/2026-05-05-slice-1c-agent-drawer-and-push-updates-design.md):
- Exhaustive TranscriptEvent schema in crew-shared
- state_transitions table + backfill
- New daemon endpoints: GET /api/agents/:key, /state-history, /timeline, /api/events (SSE)
- Dashboard agent drawer + /agent/:key/full route
- crew finish daemon parity, PR URL extraction from gh pr create

## Test plan
- [ ] Unit: `npm run test:run`
- [ ] Bruno: `npm run bruno:smoke`
- [ ] E2E: `npm run test:e2e`
- [ ] Manual: boot worktree stack, open drawer on a running agent, observe live updates

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Per the user's planning workflow, this final verification block is for reference once the slice is implemented — do **not** run it during planning. Tickets dispatch the actual work.)
