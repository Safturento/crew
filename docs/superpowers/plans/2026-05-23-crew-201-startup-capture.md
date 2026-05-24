# CREW-201 — Startup capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CLI emits per-phase startup events to `~/.crew/startup/<key>.jsonl`; daemon ingests via chokidar into a new `startup_events` table; Timeline endpoint merges with transcript events; TranscriptRow renders the new system subtypes with human-readable labels.

**Architecture:** New data flow, not a refactor. CLI writer → JSONL file → daemon chokidar → new table → timeline merge → existing TranscriptRow render. Failed phases fire `recordError` to transition agent to `error` state.

**Tech Stack:** TypeScript across all three packages (cli/daemon/shared). chokidar (already used by daemon). No new deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-201-startup-capture-design.md`](../specs/2026-05-23-crew-201-startup-capture-design.md)
**Ticket:** CREW-201 (Epic [CREW-200](https://safturento.atlassian.net/browse/CREW-200))

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/shared/src/types.ts` | Add `StartupEvent` (CLI emits) + `StartupPhaseRow` (daemon → frontend wire shape) types; extend `TranscriptEvent` union |
| Create | `packages/cli/src/lib/startup-events/writer.ts` | `emitStartupEvent(key, event)` |
| Create | `packages/cli/src/lib/startup-events/writer.test.ts` | Writer unit tests |
| Modify | `packages/cli/src/lib/run/bringup.ts` (or per-phase files) | Bracket each of 7 phases with started/completed/failed `emitStartupEvent` calls |
| Create | `packages/daemon/src/migrations/00NN_startup_events.ts` | New table |
| Modify | `packages/daemon/src/db.ts` | Add `StartupEventsTable` to interfaces |
| Modify | `packages/daemon/src/services/IngestService.ts` | Chokidar watcher; `ingestStartupEvent`; `recordError` on failed phase |
| Modify | `packages/daemon/src/services/IngestService.test.ts` | Tests for new ingest path |
| Modify | `packages/daemon/src/services/AgentsService.ts` | `getTimeline` merges started+completed events per phase into `StartupPhaseRow` rows, then merges with transcript events |
| Modify | `packages/daemon/src/services/AgentsService.test.ts` | Merge + collapse tests |
| Modify | `packages/dashboard/src/components/Timeline/event-labels.ts` | Add 7 startup phase labels |
| Modify | `packages/dashboard/src/components/Timeline/event-labels.test.ts` | Coverage |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` | `specForSystem` handles startup phase rows: `in_flight` / `completed` / `failed` status with appropriate tone + summary update |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx` | Startup-event rendering tests |
| Modify | `bruno/endpoints/agents/get-timeline.bru` | Assert startup_events merged when present |

---

## Task 1: Shared type for `StartupEvent`

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Write failing typecheck test or shape pin**

Add to existing types test (or create):

```ts
import { describe, expect, it } from 'vitest';
import type { StartupEvent } from './types.js';

describe('StartupEvent', () => {
  it('shape pin', () => {
    const e: StartupEvent = {
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'completed',
      timestamp: '2026-05-23T10:00:00Z',
      summary: 'installed 152 packages',
      durationMs: 1234,
    };
    expect(e.type).toBe('system');
  });
});
```

- [ ] **Step 2: Run, verify fails (type error)**
- [ ] **Step 3: Add `StartupEvent` + `StartupPhaseRow` to types.ts**

Per spec § Event shape. Two types:
- `StartupEvent` — what the CLI emits (`status: 'started' | 'completed' | 'failed'`)
- `StartupPhaseRow` — daemon → frontend wire shape after the merge (`status: 'in_flight' | 'completed' | 'failed'`, with `startedAt` + `completedAt` + `durationMs`)

Union `StartupPhaseRow` into `TranscriptEvent` so the frontend's existing system-event path handles it. `StartupEvent` is internal to the CLI/daemon writer-ingest pipeline; the frontend never sees it.

- [ ] **Step 4: Run, verify passes**
- [ ] **Step 5: Commit**

---

## Task 2: CLI writer + tests

**Files:**
- Create: `packages/cli/src/lib/startup-events/writer.ts`
- Create: `packages/cli/src/lib/startup-events/writer.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('appends a JSON line to ~/.crew/startup/<key>.jsonl', async () => {
  // mock fs or use tmpdir; assert file content matches
});

it('creates the dir if absent', async () => { /* ... */ });

it('appends multiple events as separate JSONL lines', async () => { /* ... */ });
```

- [ ] **Step 2: Verify fails**
- [ ] **Step 3: Implement `emitStartupEvent`** per spec § Architecture
- [ ] **Step 4: Re-run, verify passes**
- [ ] **Step 5: Commit**

---

## Task 3: CLI dispatch — instrument each of the 7 phases

**Files:**
- Modify: phase-specific files in `packages/cli/src/lib/` (preflight, worktree bringup, env-spec materialization, npm install, docker bringup, mcp wiring, claude spawn)

Seven phases, each gets `emitStartupEvent` calls bracketing started / completed / failed. Per-phase: write the started event before doing the work; write completed after success; write failed in the catch block before re-throwing.

Phase list (subtype → spec section reference):
1. `crew_startup_preflight` — port allocation + env validation + project-config resolution
2. `crew_startup_worktree` — `git worktree add`
3. `crew_startup_env_spec` — env.toml materialization for the worktree
4. `crew_startup_npm_install` — `npm ci`
5. `crew_startup_docker` — `docker compose up --build --wait`
6. `crew_startup_mcp` — MCP config write + chrome/etc. wiring
7. `crew_startup_claude_spawn` — claude subprocess spawn

`crew fix-pr` skips phases 2 and 4 — emits ~5 events instead of 7. Phases only emit events when they actually run; this happens naturally if each phase's existing code path adds its own emit calls.

- [ ] **Step 1: Locate each phase site**

```bash
grep -rn "preflight\|worktree.*add\|env-spec\|npm ci\|docker compose up\|writeMcpFile\|claude' " packages/cli/src --include='*.ts' | head -20
```

Identify the function for each of the 7 phases. Note the agent key is in scope.

- [ ] **Step 2: Implement started/completed/failed brackets in one phase first (e.g. `crew_startup_npm_install`)**

```ts
import { emitStartupEvent } from '../startup-events/writer.js';

await emitStartupEvent(agentKey, {
  type: 'system',
  subtype: 'crew_startup_npm_install',
  status: 'started',
  timestamp: new Date().toISOString(),
  summary: 'npm ci begun',
});
const t0 = Date.now();
try {
  const result = await runNpmCi();
  await emitStartupEvent(agentKey, {
    type: 'system',
    subtype: 'crew_startup_npm_install',
    status: 'completed',
    timestamp: new Date().toISOString(),
    summary: `installed ${result.packageCount} packages`,
    durationMs: Date.now() - t0,
  });
} catch (err) {
  await emitStartupEvent(agentKey, {
    type: 'system',
    subtype: 'crew_startup_npm_install',
    status: 'failed',
    timestamp: new Date().toISOString(),
    summary: err instanceof Error ? err.message : String(err),
    durationMs: Date.now() - t0,
    logPath: `/tmp/crew-npm-install-${agentKey}.log`,
  });
  throw err;
}
```

Run the existing dispatch test for that phase; should still pass (events are additive).

- [ ] **Step 3: Repeat for remaining 6 phases**

Use the same bracket pattern. Each phase's summary should describe what happened ("Worktree created at ...", "All services healthy", "Wrote .mcp.json (jira, figma, chrome, memory)", etc.).

- [ ] **Step 4: Snapshot-test the full sequence**

Integration test: dispatch a no-op fixture (or use a mock dispatch); assert `~/.crew/startup/<key>.jsonl` contains the expected `(started, completed) × 7` = 14 events for happy path. For `crew fix-pr` fixture: assert 10 events (phases 2 + 4 skipped).

- [ ] **Step 5: Commit per phase (7 separate commits) or one squashed**

Recommended: commit per phase for cleaner bisect/revert.

---

## Task 4: Daemon migration + db.ts table type

**Files:**
- Create: `packages/daemon/src/migrations/00NN_startup_events.ts`
- Modify: `packages/daemon/src/db.ts`

- [ ] **Step 1: Determine next migration number**

```bash
ls packages/daemon/src/migrations/ | sort | tail -1
```

- [ ] **Step 2: Write migration**

Per spec § Daemon storage. Up + down.

- [ ] **Step 3: Add `StartupEventsTable` interface to `db.ts`**

```ts
export interface StartupEventsTable {
  id: number;
  agent_key: string;
  subtype: string;
  status: 'started' | 'completed' | 'failed';
  ts: number;
  summary: string;
  duration_ms: number | null;
  log_path: string | null;
}

export interface DB {
  // existing tables
  startup_events: StartupEventsTable;
}
```

- [ ] **Step 4: Run migration tests**

```bash
npm run test:run --workspace=crew-daemon -- migrations
```

Expected: new migration runs cleanly; existing migrations still pass.

- [ ] **Step 5: Commit**

---

## Task 5: Daemon chokidar watcher + ingest

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/IngestService.test.ts`

- [ ] **Step 1: Write failing tests**

Per spec § Testing:
- Chokidar add event → events parsed and inserted into `startup_events`.
- Duplicate event (re-read same line) → dedupe.
- Failed event → triggers state transition to `error`.

- [ ] **Step 2: Verify fails**
- [ ] **Step 3: Implement `watchStartupEvents` + `onStartupFile` + `ingestStartupEvent`**

Per spec § Daemon ingest. Wire into IngestService's existing startup (likely called from `start()` or constructor).

`recordError` helper: if doesn't exist yet, add it as a sibling of `recordFinishCompleted` — transitions `initializing → error` with the event's ts. Guarded against re-transitioning if already error.

- [ ] **Step 4: Re-run, verify passes**
- [ ] **Step 5: Commit**

---

## Task 6: Timeline endpoint — collapse started+completed into one row per phase, then merge

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts`
- Modify: `packages/daemon/src/services/AgentsService.test.ts`
- Modify: `bruno/endpoints/agents/get-timeline.bru`

- [ ] **Step 1: Write failing tests**

```ts
it('merges started+completed events per phase into a single StartupPhaseRow', () => {
  const startupRows = [
    { agent_key: 'A', subtype: 'crew_startup_npm_install', status: 'started', ts: 1000, summary: 'npm ci begun', duration_ms: null, log_path: null },
    { agent_key: 'A', subtype: 'crew_startup_npm_install', status: 'completed', ts: 2000, summary: 'installed 152 packages', duration_ms: 1000, log_path: null },
  ];
  const phaseRows = mergeStartedAndCompleted(startupRows);
  expect(phaseRows).toHaveLength(1);
  expect(phaseRows[0]).toMatchObject({
    subtype: 'crew_startup_npm_install',
    startedAt: new Date(1000).toISOString(),
    completedAt: new Date(2000).toISOString(),
    status: 'completed',
    durationMs: 1000,
    summary: 'installed 152 packages',
  });
});

it('reports in_flight status when no terminal event has arrived yet', () => {
  const startupRows = [
    { agent_key: 'A', subtype: 'crew_startup_npm_install', status: 'started', ts: 1000, summary: 'npm ci begun', duration_ms: null, log_path: null },
  ];
  const [row] = mergeStartedAndCompleted(startupRows);
  expect(row.status).toBe('in_flight');
  expect(row.completedAt).toBeNull();
  expect(row.summary).toBe('npm ci begun');
});

it('reports failed status with terminal event summary', () => {
  const startupRows = [
    { agent_key: 'A', subtype: 'crew_startup_npm_install', status: 'started', ts: 1000, summary: 'npm ci begun', duration_ms: null, log_path: null },
    { agent_key: 'A', subtype: 'crew_startup_npm_install', status: 'failed', ts: 1500, summary: 'exit 1: cannot resolve foo', duration_ms: 500, log_path: '/tmp/crew-npm-install-A.log' },
  ];
  const [row] = mergeStartedAndCompleted(startupRows);
  expect(row.status).toBe('failed');
  expect(row.summary).toBe('exit 1: cannot resolve foo');
  expect(row.logPath).toBe('/tmp/crew-npm-install-A.log');
});

it('getTimeline merges startup phase rows ahead of transcript events by startedAt', async () => {
  // ... fixture: 2 startup events (npm install: started t=1000, completed t=2000) +
  //              1 transcript event (assistant at t=2500)
  const result = await agentsService.getTimeline('A');
  expect(result.events).toHaveLength(2);  // 1 collapsed phase row + 1 transcript event
  expect(result.events[0]).toMatchObject({ subtype: 'crew_startup_npm_install' });
  expect(result.events[1]).toMatchObject({ type: 'assistant' });
});

it('getTimeline returns transcript-only when no startup events exist', async () => {
  // ... fixture: 1 transcript event only
  const result = await agentsService.getTimeline('A');
  expect(result.events.every((e) => !('subtype' in e) || !String(e.subtype).startsWith('crew_startup_'))).toBe(true);
});
```

- [ ] **Step 2: Verify fails**

```bash
npm run test:run --workspace=crew-daemon -- AgentsService
```

Expected: FAIL — `mergeStartedAndCompleted` doesn't exist, `getTimeline` doesn't read startup_events.

- [ ] **Step 3: Implement `mergeStartedAndCompleted` + extend `getTimeline`**

In `AgentsService.ts`:

```ts
import type { StartupEvent, StartupPhaseRow, TranscriptEvent } from 'crew-shared';

interface StartupEventRow {
  agent_key: string;
  subtype: string;
  status: 'started' | 'completed' | 'failed';
  ts: number;
  summary: string;
  duration_ms: number | null;
  log_path: string | null;
}

export function mergeStartedAndCompleted(rows: StartupEventRow[]): StartupPhaseRow[] {
  const bySubtype = new Map<string, { started?: StartupEventRow; terminal?: StartupEventRow }>();
  for (const row of rows) {
    const entry = bySubtype.get(row.subtype) ?? {};
    if (row.status === 'started') entry.started = row;
    else entry.terminal = row;  // 'completed' or 'failed' overwrites
    bySubtype.set(row.subtype, entry);
  }
  return [...bySubtype.entries()].map(([subtype, { started, terminal }]) => {
    const refRow = started ?? terminal!;
    return {
      type: 'system' as const,
      subtype: subtype as StartupPhaseRow['subtype'],
      startedAt: new Date(refRow.ts).toISOString(),
      completedAt: terminal ? new Date(terminal.ts).toISOString() : null,
      status: terminal ? (terminal.status === 'failed' ? 'failed' : 'completed') : 'in_flight',
      summary: terminal?.summary ?? started?.summary ?? '',
      durationMs: terminal?.duration_ms ?? null,
      logPath: (terminal ?? started)?.log_path ?? null,
    };
  });
}

async getTimeline(agentKey: string): Promise<{ events: TranscriptEvent[] }> {
  const transcriptEvents = await this.readTranscript(agentKey);

  const startupRows = await this.db
    .selectFrom('startup_events')
    .where('agent_key', '=', agentKey)
    .selectAll()
    .orderBy('ts')
    .execute();

  const phaseRows = mergeStartedAndCompleted(startupRows);

  return {
    events: [...phaseRows, ...transcriptEvents].sort((a, b) => {
      const aTs = Date.parse('startedAt' in a ? a.startedAt : a.timestamp);
      const bTs = Date.parse('startedAt' in b ? b.startedAt : b.timestamp);
      return aTs - bTs;
    }),
  };
}
```

- [ ] **Step 4: Re-run, verify passes**

```bash
npm run test:run --workspace=crew-daemon -- AgentsService
```

- [ ] **Step 5: Update Bruno smoke**

```javascript
test("agent timeline includes startup phase rows when present", () => {
  const events = res.getBody().events;
  const startupRows = events.filter((e) =>
    typeof e.subtype === 'string' && e.subtype.startsWith('crew_startup_')
  );
  // For the CREW-102 fixture (assuming it has startup events seeded):
  expect(startupRows.length).to.be.above(0);
  // Each is collapsed-per-phase, so no duplicate subtypes
  const subtypes = startupRows.map((r) => r.subtype);
  expect(new Set(subtypes).size).to.equal(subtypes.length);
});
```

- [ ] **Step 6: `npm run bruno:smoke` — green**

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/services/AgentsService.ts \
        packages/daemon/src/services/AgentsService.test.ts \
        bruno/endpoints/agents/get-timeline.bru
git commit -m "feat(daemon): timeline endpoint merges started+completed startup events per phase (CREW-201)

New mergeStartedAndCompleted helper collapses each phase's
started/completed/failed event pair into one StartupPhaseRow with
startedAt/completedAt/status/durationMs/logPath/summary. getTimeline
runs the merge, then sorts the resulting phase rows + transcript
events by ts. Frontend sees one logical row per phase; in_flight
status updates to completed/failed via SSE as terminal events arrive."
```

---

## Task 7: Frontend rendering — labels + status-aware tone + in-flight summary

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/event-labels.ts`
- Modify: `packages/dashboard/src/components/Timeline/event-labels.test.ts`
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.tsx`
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it('renders crew_startup_npm_install with the "npm install" label', () => {
  const event = makeStartupPhaseRow({ subtype: 'crew_startup_npm_install', status: 'completed' });
  render(<TranscriptRow event={event} />);
  expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('npm install');
});

it('renders all 7 startup phase labels', () => {
  const cases: Array<[StartupPhaseRow['subtype'], string]> = [
    ['crew_startup_preflight', 'Preflight'],
    ['crew_startup_worktree', 'Worktree'],
    ['crew_startup_env_spec', 'Env spec'],
    ['crew_startup_npm_install', 'npm install'],
    ['crew_startup_docker', 'Docker'],
    ['crew_startup_mcp', 'MCP'],
    ['crew_startup_claude_spawn', 'Claude spawn'],
  ];
  for (const [subtype, label] of cases) {
    const event = makeStartupPhaseRow({ subtype, status: 'completed' });
    const { unmount } = render(<TranscriptRow event={event} />);
    expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent(label);
    unmount();
  }
});

it('renders failed startup phase with error tone (red)', () => {
  const event = makeStartupPhaseRow({ subtype: 'crew_startup_npm_install', status: 'failed', summary: 'exit 1' });
  render(<TranscriptRow event={event} />);
  const text = screen.getByTestId('transcript-row-text');
  expect(text.className).toContain('text-red-400');
});

it('renders in_flight startup phase with default tone', () => {
  const event = makeStartupPhaseRow({ subtype: 'crew_startup_npm_install', status: 'in_flight', summary: 'npm ci begun' });
  render(<TranscriptRow event={event} />);
  const text = screen.getByTestId('transcript-row-text');
  expect(text.className).not.toContain('text-red');
  expect(text).toHaveTextContent('npm ci begun');
});

it('expanded view shows the logPath when present', () => {
  const event = makeStartupPhaseRow({
    subtype: 'crew_startup_npm_install',
    status: 'failed',
    logPath: '/tmp/crew-npm-install-A.log',
  });
  render(<TranscriptRow event={event} />);
  fireEvent.click(screen.getByRole('button'));
  const expanded = screen.getByTestId('transcript-row-expanded');
  expect(expanded).toHaveTextContent('/tmp/crew-npm-install-A.log');
});
```

`makeStartupPhaseRow` fixture helper — define alongside the test:

```tsx
function makeStartupPhaseRow(over: Partial<StartupPhaseRow>): StartupPhaseRow {
  return {
    type: 'system',
    subtype: 'crew_startup_npm_install',
    startedAt: '2026-05-23T10:00:00Z',
    completedAt: '2026-05-23T10:01:00Z',
    status: 'completed',
    summary: 'installed 152 packages',
    durationMs: 60_000,
    logPath: null,
    ...over,
  };
}
```

- [ ] **Step 2: Verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow
```

Expected: FAIL — labels missing, status-aware tone branch absent.

- [ ] **Step 3: Add the 7 phase labels in event-labels.ts**

```ts
// in SYSTEM_LABELS object:
crew_startup_preflight: 'Preflight',
crew_startup_worktree: 'Worktree',
crew_startup_env_spec: 'Env spec',
crew_startup_npm_install: 'npm install',
crew_startup_docker: 'Docker',
crew_startup_mcp: 'MCP',
crew_startup_claude_spawn: 'Claude spawn',
```

- [ ] **Step 4: Extend `specForSystem` in `TranscriptRow.tsx` to handle StartupPhaseRow**

```tsx
function specForSystem(event: SystemEvent | StartupPhaseRow): RowSpec {
  // Detect StartupPhaseRow by presence of `status` + 'crew_startup_*' subtype
  const isStartupPhase = typeof event.subtype === 'string' && event.subtype.startsWith('crew_startup_');
  if (isStartupPhase) {
    const phase = event as StartupPhaseRow;
    return {
      blockType: 'system',
      category: 'system',
      tone: phase.status === 'failed' ? 'error' : 'default',
      tagLabel: labelForSystem(phase.subtype),
      oneLiner: truncate(phase.summary),
      timestamp: phase.startedAt,
      expanded: prettyJson(phase),  // shows startedAt/completedAt/status/duration/logPath
    };
  }
  // existing branch for SystemEvent (api_error, turn_duration, etc.)
  const subtype = (event as { subtype?: string }).subtype ?? 'system';
  return {
    blockType: 'system',
    category: 'system',
    tone: subtype === 'api_error' ? 'error' : 'default',
    tagLabel: labelForSystem(subtype),
    oneLiner: truncate(summarizeSystem(event as SystemEvent)),
    timestamp: (event as SystemEvent).timestamp,
    expanded: prettyJson(event),
  };
}
```

- [ ] **Step 5: Re-run, verify passes**

```bash
npm run test:run --workspace=crew-dashboard -- TranscriptRow event-labels
```

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/Timeline/event-labels.ts \
        packages/dashboard/src/components/Timeline/event-labels.test.ts \
        packages/dashboard/src/components/Timeline/TranscriptRow.tsx \
        packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx
git commit -m "feat(dashboard): render startup phase rows in TranscriptRow (CREW-201)

7 new phase labels in event-labels.ts. specForSystem branches on
StartupPhaseRow vs SystemEvent: phase rows use phase.status for tone
(failed → red), phase.startedAt for timestamp, phase.summary for the
oneliner (updates from in_flight summary to terminal summary via SSE).
Expanded view shows the full row JSON including logPath for debugging."
```

---

## Task 8: Manual smoke + visual fidelity

- [ ] `npm run lint` / `typecheck` / `test:run` / `bruno:smoke` — green
- [ ] Manual: dispatch a fresh `crew run <KEY>`. Drawer Timeline's Starting section shows 7 phase rows (one per phase), all green for happy path; each row shows the duration on the right.
- [ ] Manual: dispatch a fresh `crew fix-pr <KEY>`. Starting section shows ~5 phase rows (worktree + npm install skipped since they're already done).
- [ ] Manual failure-path: deliberately break one phase (e.g. typo in worktree command); confirm the failed row renders red, expands to show the logPath, and the agent transitions to `error` state in the dashboard list.
- [ ] Manual live-monitoring: open the drawer mid-dispatch during a slow phase (e.g. while `docker compose up --build` is running). Confirm the phase row appears as "in_flight" and updates to "completed N s" when the phase finishes (SSE-driven).
- [ ] `visual-fidelity-check` against the populated CREW-102 fixture (or a fresh dispatch).

PR title: `feat: capture CLI startup phases in drawer Timeline (CREW-201)`
